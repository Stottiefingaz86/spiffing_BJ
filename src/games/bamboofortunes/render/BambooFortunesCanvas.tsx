import { Application, Container, TextureSource } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';

import type { BambooFortunesSnapshot } from '../engine/session';
import { GamePhase } from '../engine/session';
import type { Grid } from '../engine/grid';
import type { SymbolMultiplier } from '../engine/symbolMultipliers';
import { GRID_COLS, GRID_ROWS, SCATTER_TRIGGER } from '../engine/symbols';
import { preloadAllTextures } from './symbolTextures';
import { computeGridLayout, drawGridScene, destroyGridScene, type GridLayout } from './drawGrid';
import {
  startReelSpin,
  isColumnStopped,
  isColumnLandingOrStopped,
  areAllReelsStopped,
  extendColumnStopTime,
  clearAllAnimations,
  clearAllAnimationsAndFloats,
  clearReelSpins,
  queueHighlightAnimations,
  tickAnimations,
  triggerCameraShake,
  getCameraShakeOffset,
} from './gridAnimations';
import { playBF, playBFPitched } from '../audio/bamboofortunesSfx';
import { countScattersInColumns, countScatters } from '../engine/grid';

export interface BambooFortunesCanvasProps {
  snapshot: BambooFortunesSnapshot;
  onReelsComplete: () => void;
  onScatterUpdate?: (count: number) => void;
  className?: string;
}

export function BambooFortunesCanvas({
  snapshot,
  onReelsComplete,
  onScatterUpdate,
  className,
}: BambooFortunesCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameLayerRef = useRef<Container | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  const onReelsCompleteRef = useRef(onReelsComplete);
  onReelsCompleteRef.current = onReelsComplete;

  const onScatterUpdateRef = useRef(onScatterUpdate);
  onScatterUpdateRef.current = onScatterUpdate;

  const displayRef = useRef<{
    grid: Grid;
    symbolMultipliers: SymbolMultiplier[];
    winCells?: Set<number>;
  } | null>(null);

  const lastRevRef = useRef(-1);
  const reelCheckRef = useRef(false);
  const prevStoppedRef = useRef<Set<number>>(new Set());
  const anticipationTriggeredRef = useRef(false);
  const scatterCountRef = useRef(0);

  /** Ignore ± few px canvas jitter (mobile URL bar / subpixel) so the grid doesn’t re-center every frame. */
  const LAYOUT_DIM_TOL = 4;

  const layoutCache = useRef<{ w: number; h: number; layout: GridLayout } | null>(null);
  function getLayout(w: number, h: number): GridLayout {
    const wq = Math.round(w);
    const hq = Math.round(h);
    const c = layoutCache.current;
    if (c) {
      const sameBreakpoint = (wq < 768) === (c.w < 768);
      const similar =
        Math.abs(c.w - wq) <= LAYOUT_DIM_TOL && Math.abs(c.h - hq) <= LAYOUT_DIM_TOL;
      if (similar && sameBreakpoint) return c.layout;
    }
    const layout = computeGridLayout(wq, hq);
    layoutCache.current = { w: wq, h: hq, layout };
    return layout;
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    TextureSource.defaultOptions.scaleMode = 'linear';

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
      .then(async () => {
        if (destroyed) { app.destroy(true); return; }

        host.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;

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

        await preloadAllTextures(app.renderer);
        if (destroyed) return;

        kickResize();

        const gameLayer = new Container();
        app.stage.addChild(gameLayer);
        gameLayerRef.current = gameLayer;

        const snap = snapRef.current;
        const layout = getLayout(app.renderer.width, app.renderer.height);
        drawGridScene(gameLayer, app.renderer, snap.grid, snap.symbolMultipliers, layout, undefined, snap.inFreeSpins, scatterCountRef.current);

        app.ticker.add(() => {
          tickAnimations(app.ticker.deltaMS);
          const gl = gameLayerRef.current;
          if (!gl) return;

          const shake = getCameraShakeOffset();
          const narrow = Math.round(app.renderer.width) < 768;
          gl.x = shake.x;
          gl.y = narrow ? 0 : shake.y;

          const s = snapRef.current;
          const l = getLayout(app.renderer.width, app.renderer.height);
          const d = displayRef.current;

          // Check for newly landing/stopped columns (scatter SFX + anticipation only — no per-reel thud)
          if (reelCheckRef.current) {
            const landedNow = new Set<number>();
            for (let c = 0; c < GRID_COLS; c++) {
              if (isColumnLandingOrStopped(c)) landedNow.add(c);
            }

            let hasNewlyLandedCol = false;
            for (const c of landedNow) {
              if (!prevStoppedRef.current.has(c)) {
                hasNewlyLandedCol = true;
              }
            }

            if (hasNewlyLandedCol) {
              const prevVisible = scatterCountRef.current;
              const visibleScatters = countScattersInColumns(s.grid, landedNow);
              if (visibleScatters > prevVisible) {
                playBF('reelEnd', 0.55, undefined, true);
              }
              scatterCountRef.current = visibleScatters;
              onScatterUpdateRef.current?.(visibleScatters);
            }

            // Scatter anticipation: one away from trigger, extend remaining reels
            if (!anticipationTriggeredRef.current && landedNow.size < GRID_COLS) {
              const scattersInLanded = countScattersInColumns(s.grid, landedNow);
              if (scattersInLanded >= SCATTER_TRIGGER - 1) {
                anticipationTriggeredRef.current = true;
                if (Math.round(app.renderer.width) >= 768) {
                  triggerCameraShake(6, 3000);
                }
                for (let c = 0; c < GRID_COLS; c++) {
                  if (!landedNow.has(c)) {
                    extendColumnStopTime(c, 3000);
                  }
                }
                playBF('scatterMaybe', 0.6);
              }
            }

            prevStoppedRef.current = landedNow;

            // Check if all reels fully stopped (after landing bounce)
            if (areAllReelsStopped()) {
              reelCheckRef.current = false;
              onReelsCompleteRef.current();
            }
          }

          const winCells = d?.winCells;
          drawGridScene(
            gl, app.renderer,
            d?.grid ?? s.grid,
            d?.symbolMultipliers ?? s.symbolMultipliers,
            l, winCells, s.inFreeSpins,
            scatterCountRef.current,
          );
        });
      });

    return () => {
      destroyed = true;
      destroyGridScene();
      clearAllAnimationsAndFloats();
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
    lastRevRef.current = snapshot.revision;

    const snap = snapshot;
    const layout = getLayout(app.renderer.width, app.renderer.height);

    // ── Spinning phase: start reel animation ──
    if (snap.phase === GamePhase.Spinning || snap.phase === GamePhase.FreeSpinSpinning) {
      clearAllAnimationsAndFloats();

      // Stagger column stops: left to right
      const baseDelay = 400;
      const colStagger = 150;
      const delays: number[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        delays.push(baseDelay + c * colStagger);
      }

      startReelSpin(delays, 200);
      reelCheckRef.current = true;
      prevStoppedRef.current = new Set();
      anticipationTriggeredRef.current = false;
      scatterCountRef.current = 0;
      onScatterUpdateRef.current?.(0);

      displayRef.current = { grid: snap.grid, symbolMultipliers: snap.symbolMultipliers };
      playBF('spin', 0.12);
      return;
    }

    // ── ShowWin: highlight winning cells ──
    if (snap.phase === GamePhase.ShowWin) {
      clearReelSpins();
      reelCheckRef.current = false;
      scatterCountRef.current = countScatters(snap.grid);

      const winCellIds = new Set<number>();
      for (const cluster of snap.winClusters) {
        for (const cell of cluster.cells) winCellIds.add(cell.id);
      }

      if (winCellIds.size > 0) {
        queueHighlightAnimations([...winCellIds], 1500);
        playBFPitched('win', 1.0, 0.5, 2.0);
      }

      displayRef.current = { grid: snap.grid, symbolMultipliers: snap.symbolMultipliers, winCells: winCellIds };
      return;
    }

    // ── Idle or other phases ──
    clearReelSpins();
    clearAllAnimations();
    reelCheckRef.current = false;
    displayRef.current = null;
    scatterCountRef.current = countScatters(snap.grid);

    drawGridScene(gl, app.renderer, snap.grid, snap.symbolMultipliers, layout, undefined, snap.inFreeSpins, scatterCountRef.current);
  }, [snapshot.revision, snapshot.phase]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
