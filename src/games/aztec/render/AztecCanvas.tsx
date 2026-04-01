import { Application, Container } from 'pixi.js';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import type { AztecSnapshot } from '../engine/session';
import { GamePhase } from '../engine/session';
import type { Grid } from '../engine/grid';

function cloneGridCells(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}
import { REELS, ROWS, type TempleSymbol } from '../engine/symbols';
import {
  computeGridLayout,
  destroyGridScene,
  getAztecReelSpinOverlay,
  initGridScene,
  loadAztecFrameTexture,
  setAztecGridLayerVisibleForBanditSpin,
  setAztecReelMaskTexture,
  setAztecReelSpinOverlayVisible,
  updateGridScene,
  type GridLayout,
} from './drawGrid';
import { loadAztecGridMaskTexture } from './aztecGridMask';
import { computeAztecStageLayout } from './aztecStageLayout';
import { preloadAztecSymbolTextures } from './aztecSymbolTextures';
import { buildFallMovesFromRemoval, particleColorForCells } from './cascadePhysics';
import {
  appendFallAnimations,
  clearAllAnimations,
  clearAllAnimationsAndFloats,
  queueFallAnimations,
  queueHighlightAnimations,
  queuePopAnimations,
  spawnFloatingWin,
  spawnBrickExplosion,
  tickAnimations,
  triggerCameraShake,
  getCameraShakeOffset,
} from './gridAnimations';
import {
  BANDITS_REEL_STOP_BASE_DELAY_MS,
  BANDITS_REEL_STOP_STAGGER_MS,
  createReelAnimator,
  type ReelAnimator,
} from '../../shared/reelAnimator';
import {
  computeAztecReelLayout,
  destroyAztecReelScene,
  gridToReelMajorSymbols,
  initAztecReelScene,
  prepareAztecReelLanding,
  startAztecReelSpin,
  updateAztecReelScene,
} from './aztecDrawReels';
import { playTF } from '../audio/aztecSfx';

export interface AztecFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Reel window — CSS px, same coordinate space as the canvas client rect (and Pixi stage). */
  innerX: number;
  innerY: number;
  innerW: number;
  innerH: number;
}

/** Latest camera shake in CSS px — same offset applied to the Pixi game layer each tick (for HTML overlays). */
export type AztecCameraShakeRef = MutableRefObject<{ x: number; y: number }>;

export interface AztecCanvasProps {
  snapshot: AztecSnapshot;
  onDropComplete: () => void;
  onCascadeStepComplete: () => void;
  /** Screen-space frame bounds (CSS px) for HTML overlays — same role as Breaking Bandits `onFrameLayout`. */
  onFrameLayout?: (rect: AztecFrameRect) => void;
  /** Written every frame with the same `{x,y}` applied to `gameLayer` (shake); omit if unused. */
  cameraShakeRef?: AztecCameraShakeRef;
  className?: string;
}

export function AztecCanvas({
  snapshot,
  onDropComplete,
  onCascadeStepComplete,
  onFrameLayout,
  cameraShakeRef,
  className,
}: AztecCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameLayerRef = useRef<Container | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  const onDropCompleteRef = useRef(onDropComplete);
  onDropCompleteRef.current = onDropComplete;
  const onCascadeRef = useRef(onCascadeStepComplete);
  onCascadeRef.current = onCascadeStepComplete;
  const onFrameLayoutRef = useRef(onFrameLayout);
  onFrameLayoutRef.current = onFrameLayout;
  const cameraShakeSinkRef = useRef(cameraShakeRef);
  cameraShakeSinkRef.current = cameraShakeRef;
  const lastFrameKeyRef = useRef('');

  const reelAnimatorRef = useRef<ReelAnimator | null>(null);
  const banditSpinActiveRef = useRef(false);
  const banditSpinTargetReelsRef = useRef<TempleSymbol[][] | null>(null);
  const reelStopScheduledRef = useRef<boolean[]>([false, false, false, false, false]);
  const reelLandedRef = useRef<boolean[]>([false, false, false, false, false]);
  const reelSoundPlayedRef = useRef<boolean[]>([false, false, false, false, false]);

  const displayRef = useRef<{
    grid: Grid;
    winCells?: Set<number>;
    multLabel?: string;
  } | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRevRef = useRef(-1);
  const prevGridRef = useRef<Grid | null>(null);
  const runningWinRef = useRef(0);

  const layoutCache = useRef<{ w: number; h: number; layout: GridLayout } | null>(null);
  function getLayout(w: number, h: number): GridLayout {
    const c = layoutCache.current;
    if (c && c.w === w && c.h === h) return c.layout;
    const layout = computeGridLayout(w, h);
    layoutCache.current = { w, h, layout };
    return layout;
  }

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  function draw(gl: Container, renderer: any, grid: Grid, layout: GridLayout, winCells?: Set<number>, mult?: string) {
    updateGridScene(renderer, grid, layout, winCells, mult, snapRef.current.inFreeSpins);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let destroyed = false;

    app
      .init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }

        host.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;

        const gameLayer = new Container();
        app.stage.addChild(gameLayer);
        gameLayerRef.current = gameLayer;

        initGridScene(gameLayer);
        setAztecGridLayerVisibleForBanditSpin(true);
        setAztecReelSpinOverlayVisible(false);
        destroyAztecReelScene();
        if (!reelAnimatorRef.current) reelAnimatorRef.current = createReelAnimator();

        const kickResize = () => {
          if (destroyed || !app.renderer) return;
          const r = host.getBoundingClientRect();
          const w = Math.max(16, Math.floor(r.width));
          const h = Math.max(16, Math.floor(r.height));
          if (w > 0 && h > 0 && (w !== app.renderer.width || h !== app.renderer.height)) {
            app.renderer.resize(w, h);
          }
        };
        requestAnimationFrame(() => {
          kickResize();
          requestAnimationFrame(kickResize);
        });

        void (async () => {
          await loadAztecFrameTexture();
          await preloadAztecSymbolTextures();
          if (!destroyed && gameLayerRef.current) {
            const maskTex = await loadAztecGridMaskTexture();
            if (maskTex) setAztecReelMaskTexture(maskTex);
          }
          if (destroyed || !gameLayerRef.current || !appRef.current) return;
          kickResize();
          const l = getLayout(appRef.current.renderer.width, appRef.current.renderer.height);
          const s = snapRef.current;
          const d = displayRef.current;
          draw(gameLayerRef.current, appRef.current.renderer, d?.grid ?? s.grid, l, d?.winCells, d?.multLabel);
        })();
        const snap = snapRef.current;
        prevGridRef.current = snap.grid.map((row) => row.map((c) => ({ ...c })));
        const layout = getLayout(app.renderer.width, app.renderer.height);
        draw(gameLayer, app.renderer, snap.grid, layout);

        app.ticker.add(() => {
          tickAnimations(app.ticker.deltaMS);
          const gl = gameLayerRef.current;
          if (!gl) return;

          const anim = reelAnimatorRef.current;
          if (banditSpinActiveRef.current && anim) {
            anim.tick(app.ticker.deltaMS);
            const target = banditSpinTargetReelsRef.current;
            const rl = computeAztecReelLayout(app.renderer.width, app.renderer.height);
            if (target) {
              for (let r = 0; r < REELS; r++) {
                const st = anim.states[r];
                if (st.prepareLanding && !reelLandedRef.current[r]) {
                  const reelSyms: TempleSymbol[] = [
                    target[r][0],
                    target[r][1],
                    target[r][2],
                  ];
                  if (prepareAztecReelLanding(r, reelSyms)) {
                    reelLandedRef.current[r] = true;
                    anim.confirmLanding(r);
                  }
                }
              }
              for (let r = 0; r < REELS; r++) {
                const st = anim.states[r];
                if (!st.spinning && reelLandedRef.current[r] && !reelSoundPlayedRef.current[r]) {
                  reelSoundPlayedRef.current[r] = true;
                  // Reels 0..REELS-2: light tick. Last reel: skip — `reelEnd` on allStopped fires same
                  // frame and would stack (reel_end ×2 + much higher gain), so reel 5 read as too loud.
                  if (r < REELS - 1) playTF('rowClick', 0.11);
                }
              }
              updateAztecReelScene(target, rl, anim.states, snapRef.current.inFreeSpins);
            }

            if (anim.allStopped()) {
              banditSpinActiveRef.current = false;
              banditSpinTargetReelsRef.current = null;
              destroyAztecReelScene();
              setAztecGridLayerVisibleForBanditSpin(true);
              setAztecReelSpinOverlayVisible(false);
              for (let i = 0; i < REELS; i++) {
                reelLandedRef.current[i] = false;
                reelSoundPlayedRef.current[i] = false;
                reelStopScheduledRef.current[i] = false;
              }
              playTF('reelEnd', 0.07);
              onDropCompleteRef.current();
              setTimeout(() => {
                const g = snapRef.current.grid;
                prevGridRef.current = g.map((row) => row.map((c) => ({ ...c })));
              }, 0);
            }
          }

          const ph = snapRef.current.phase;
          const shake =
            ph === GamePhase.Dropping || ph === GamePhase.FreeSpinDropping
              ? { x: 0, y: 0 }
              : getCameraShakeOffset();
          gl.x = shake.x;
          gl.y = shake.y;
          const shakeOut = cameraShakeSinkRef.current;
          if (shakeOut?.current) {
            shakeOut.current.x = shake.x;
            shakeOut.current.y = shake.y;
          }
          const d = displayRef.current;
          const s = snapRef.current;
          const l = getLayout(app.renderer.width, app.renderer.height);
          draw(
            gl,
            app.renderer,
            d?.grid ?? s.grid,
            l,
            d?.winCells,
            d?.multLabel,
          );
          const st = computeAztecStageLayout(app.renderer.width, app.renderer.height);
          const fk = `${st.frameX},${st.frameY},${st.frameW},${st.frameH},${st.innerX},${st.innerY},${st.innerW},${st.innerH}`;
          if (onFrameLayoutRef.current && fk !== lastFrameKeyRef.current) {
            lastFrameKeyRef.current = fk;
            // Stage layout is already in CSS/logical px (matches canvas client box).
            onFrameLayoutRef.current({
              x: st.frameX,
              y: st.frameY,
              w: st.frameW,
              h: st.frameH,
              innerX: st.innerX,
              innerY: st.innerY,
              innerW: st.innerW,
              innerH: st.innerH,
            });
          }
        });
      });

    return () => {
      destroyed = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      destroyGridScene();
      if (appRef.current) {
        const canvas = appRef.current.canvas as HTMLCanvasElement;
        canvas.parentNode?.removeChild(canvas);
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const gl = gameLayerRef.current;
    if (!app || !gl) return;
    if (snapshot.revision === lastRevRef.current) return;
    const revisionBefore = lastRevRef.current;
    lastRevRef.current = snapshot.revision;

    const snap = snapshot;
    const layout = getLayout(app.renderer.width, app.renderer.height);

    if (snap.phase === GamePhase.Dropping || snap.phase === GamePhase.FreeSpinDropping) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      clearAllAnimationsAndFloats();
      runningWinRef.current = 0;

      let anim = reelAnimatorRef.current;
      if (!anim) {
        anim = createReelAnimator();
        reelAnimatorRef.current = anim;
      }
      const overlay = getAztecReelSpinOverlay();
      if (!overlay) {
        lastRevRef.current = revisionBefore;
        return;
      }

      const oldGrid = prevGridRef.current ?? snap.grid;
      const newGrid = snap.grid;
      const reelLayout = computeAztecReelLayout(app.renderer.width, app.renderer.height);

      displayRef.current = { grid: newGrid };
      destroyAztecReelScene();
      initAztecReelScene(overlay, gridToReelMajorSymbols(oldGrid), reelLayout, snap.inFreeSpins);
      startAztecReelSpin();
      anim.startSpin();

      for (let i = 0; i < REELS; i++) {
        reelStopScheduledRef.current[i] = false;
        reelLandedRef.current[i] = false;
        reelSoundPlayedRef.current[i] = false;
      }

      setAztecGridLayerVisibleForBanditSpin(false);
      setAztecReelSpinOverlayVisible(true);
      banditSpinTargetReelsRef.current = gridToReelMajorSymbols(newGrid);
      banditSpinActiveRef.current = true;

      for (let r = 0; r < REELS; r++) {
        const reelIdx = r;
        const totalDelay = BANDITS_REEL_STOP_BASE_DELAY_MS + reelIdx * BANDITS_REEL_STOP_STAGGER_MS;
        scheduleTimer(() => {
          if (!reelStopScheduledRef.current[reelIdx]) {
            reelStopScheduledRef.current[reelIdx] = true;
            anim.stopReel(reelIdx);
          }
        }, totalDelay);
      }

      draw(gl, app.renderer, newGrid, layout);
      return;
    }

    if (
      (snap.phase === GamePhase.Cascading || snap.phase === GamePhase.FreeSpinCascading) &&
      snap.currentCascadeIndex >= 0
    ) {
      const step = snap.cascadeSteps[snap.currentCascadeIndex];
      if (!step) {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        clearAllAnimations();
        displayRef.current = null;
        prevGridRef.current = snap.grid.map((row) => row.map((c) => ({ ...c })));
        draw(gl, app.renderer, snap.grid, layout);
        return;
      }

      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      const stepWin = step.payoutCents;
      const winIds = new Set<number>();
      for (const { row, col } of step.winningCells) {
        const cell = step.gridBefore[row]?.[col];
        if (cell) winIds.add(cell.id);
      }
      const hasWins = winIds.size > 0;
      /** First cascade after a spin is the initial line hit — `win` covers it; `explode` only on later avalanches. */
      const playExplodeSfx = hasWins && snap.currentCascadeIndex > 0;

      const multLabel = `×${step.avalancheMult}`;

      const highlightMs = 400;
      const popMs = 300;

      /** Own copy for this step so displayRef never aliases snapshot grids across React updates. */
      const gridBeforeClone = cloneGridCells(step.gridBefore);

      scheduleTimer(() => {
        clearAllAnimations();
        if (hasWins) queueHighlightAnimations([...winIds], highlightMs);
        if (hasWins) playTF('tick', 0.26);
        displayRef.current = {
          grid: gridBeforeClone,
          winCells: hasWins ? winIds : undefined,
          multLabel,
        };
        draw(gl, app.renderer, gridBeforeClone, layout, hasWins ? winIds : undefined, multLabel);
      }, 0);

      scheduleTimer(() => {
        clearAllAnimations();
        if (hasWins) queuePopAnimations([...winIds], popMs);
        if (hasWins) {
          if (playExplodeSfx) playTF('explode', 0.3);
          if (stepWin > 0) playTF('win', 0.48);
          const accent = particleColorForCells(step.gridBefore, winIds);
          const minDim = Math.min(layout.cellW, layout.cellH);
          const spread = minDim * 0.82;
          const { cellW: cw, cellH: ch } = layout;
          for (const { row, col: c } of step.winningCells) {
            const cx = layout.gridX + c * cw + cw / 2;
            const cy = layout.gridY + row * ch + ch / 2;
            spawnBrickExplosion(cx, cy, accent, spread);
          }
          runningWinRef.current += stepWin;
          const avgX = layout.gridX + (REELS / 2) * cw;
          const avgY = layout.gridY + (ROWS / 2) * ch;
          spawnFloatingWin(avgX, avgY, stepWin, 2000);
          triggerCameraShake(Math.min(11, 4 + stepWin / Math.max(1, snap.bet)), 320);
        }

        displayRef.current = {
          grid: gridBeforeClone,
          winCells: hasWins ? winIds : undefined,
          multLabel,
        };
        draw(gl, app.renderer, gridBeforeClone, layout, hasWins ? winIds : undefined, multLabel);
      }, highlightMs + 20);

      const fallStart = highlightMs + 20 + popMs + 40;
      scheduleTimer(() => {
        clearAllAnimations();
        const moves = buildFallMovesFromRemoval(step.gridAfterRemoval, step.gridAfter);
        const fallDur = queueFallAnimations(moves, 195, 5, undefined, step.gridAfter, true);

        const gridAfterFrozen = cloneGridCells(step.gridAfter);
        displayRef.current = {
          grid: gridAfterFrozen,
          multLabel,
        };
        draw(gl, app.renderer, gridAfterFrozen, layout, undefined, multLabel);

        scheduleTimer(() => {
          clearAllAnimations();
          // Cascading snapshot.grid is still gridBefore; keep showing gridAfter until the effect advances.
          const settled = cloneGridCells(step.gridAfter);
          displayRef.current = { grid: settled, multLabel };
          prevGridRef.current = settled.map((row) => row.map((c) => ({ ...c })));
          draw(gl, app.renderer, settled, layout, undefined, multLabel);
          playTF('reelEnd', 0.17);
          onCascadeRef.current();
        }, fallDur + 120);
      }, fallStart);

      return;
    }

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    clearAllAnimations();
    displayRef.current = null;
    prevGridRef.current = snap.grid.map((row) => row.map((c) => ({ ...c })));
    draw(gl, app.renderer, snap.grid, layout);
  }, [snapshot.revision, snapshot.phase, snapshot.currentCascadeIndex, scheduleTimer]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
