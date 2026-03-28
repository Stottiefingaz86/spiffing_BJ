import { Application, Container } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';

import type { BanditSnapshot } from '../engine/session';
import { GamePhase } from '../engine/session';
import { BanditSymbol, REELS } from '../engine/symbols';
import { playBandit } from '../audio/banditSfx';
import { preloadAllTextures } from './symbolTextures';
import {
  computeReelLayout,
  initReelScene,
  updateReelScene,
  destroyReelScene,
  startReelSpin,
  prepareReelLanding,
  loadFrameAsset,
  type ReelLayout,
} from './drawReels';
import { createReelAnimator, type ReelAnimator } from './reelAnimation';

function shakeCanvas(el: HTMLElement | null): void {
  if (!el) return;
  const target = el;
  const intensity = 6;
  const duration = 300;
  const start = performance.now();
  const origTransform = target.style.transform;
  function frame() {
    const elapsed = performance.now() - start;
    if (elapsed >= duration) {
      target.style.transform = origTransform;
      return;
    }
    const decay = 1 - elapsed / duration;
    const x = (Math.random() * 2 - 1) * intensity * decay;
    const y = (Math.random() * 2 - 1) * intensity * decay;
    target.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReelCanvasProps {
  snapshot: BanditSnapshot;
  onSpinComplete: () => void;
  onWildFeatureComplete: () => void;
  onEvaluate: () => void;
  onPaylineDone: () => void;
  onFrameLayout?: (rect: FrameRect) => void;
  className?: string;
}

export function ReelCanvas({
  snapshot,
  onSpinComplete,
  onWildFeatureComplete,
  onEvaluate,
  onPaylineDone,
  onFrameLayout,
  className,
}: ReelCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameLayerRef = useRef<Container | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  const onSpinCompleteRef = useRef(onSpinComplete);
  onSpinCompleteRef.current = onSpinComplete;
  const onWildFeatureRef = useRef(onWildFeatureComplete);
  onWildFeatureRef.current = onWildFeatureComplete;
  const onEvalRef = useRef(onEvaluate);
  onEvalRef.current = onEvaluate;
  const onPaylineDoneRef = useRef(onPaylineDone);
  onPaylineDoneRef.current = onPaylineDone;
  const onFrameLayoutRef = useRef(onFrameLayout);
  onFrameLayoutRef.current = onFrameLayout;
  const lastFrameRectRef = useRef('');


  const animatorRef = useRef<ReelAnimator | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRevRef = useRef(-1);
  const spinActiveRef = useRef(false);
  const wildFeatureShownRef = useRef(false);
  const paylineCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Track which reels have been told to stop */
  const reelStopScheduledRef = useRef<boolean[]>([false, false, false, false, false]);
  /** Track which reels have landed on their final result */
  const reelLandedRef = useRef<boolean[]>([false, false, false, false, false]);
  /** Track which reels have had their stop/scatter sound played */
  const reelSoundPlayedRef = useRef<boolean[]>([false, false, false, false, false]);
  /** How many scatters have landed so far in this spin */
  const scattersLandedRef = useRef(0);
  /** Which reels are in scatter anticipation mode (glowing/boosted) */
  const anticipatingReelsRef = useRef<Set<number>>(new Set());
  /** Interval for repeating scatter anticipation effect */
  const anticipationSoundRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Timestamp when anticipation boost started, used to schedule reel stops from ticker */
  const anticipationStartRef = useRef(0);

  const layoutCache = useRef<{ w: number; h: number; layout: ReelLayout } | null>(null);
  function getLayout(w: number, h: number): ReelLayout {
    const c = layoutCache.current;
    if (c && c.w === w && c.h === h) return c.layout;
    const layout = computeReelLayout(w, h);
    layoutCache.current = { w, h, layout };
    return layout;
  }

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (paylineCycleRef.current) {
      clearInterval(paylineCycleRef.current);
      paylineCycleRef.current = null;
    }
  }, []);

  // Initialize Pixi
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
      .then(async () => {
        if (destroyed) { app.destroy(true); return; }

        const canvasEl = app.canvas as HTMLCanvasElement;
        canvasEl.style.background = 'transparent';
        host.appendChild(canvasEl);
        appRef.current = app;
        await preloadAllTextures(app.renderer);
        await loadFrameAsset();
        if (destroyed) return;

        const gameLayer = new Container();
        app.stage.addChild(gameLayer);
        gameLayerRef.current = gameLayer;

        const animator = createReelAnimator();
        animatorRef.current = animator;

        const snap = snapRef.current;
        const layout = getLayout(app.renderer.width, app.renderer.height);
        initReelScene(gameLayer, app.renderer, snap.grid, layout, snap.inFreeSpins);

        if (onFrameLayoutRef.current && layout.frameW > 0) {
          const res = app.renderer.resolution || 1;
          lastFrameRectRef.current = `${layout.frameX},${layout.frameY},${layout.frameW},${layout.frameH}`;
          onFrameLayoutRef.current({
            x: layout.frameX / res,
            y: layout.frameY / res,
            w: layout.frameW / res,
            h: layout.frameH / res,
          });
        }

        // Main render loop
        app.ticker.add(() => {
          const anim = animatorRef.current;
          const gl = gameLayerRef.current;
          if (!gl || !anim) return;

          anim.tick(app.ticker.deltaMS);
          const s = snapRef.current;
          const l = getLayout(app.renderer.width, app.renderer.height);

          if (spinActiveRef.current) {
            for (let r = 0; r < REELS; r++) {
              const st = anim.states[r];
              // When animator signals prepareLanding, inject result symbols into the strip
              if (st.prepareLanding && !reelLandedRef.current[r]) {
                const reelSymbols = [
                  s.grid[r]?.[0],
                  s.grid[r]?.[1],
                  s.grid[r]?.[2],
                ].filter(Boolean) as import('../engine/symbols').BanditSymbol[];

                if (prepareReelLanding(r, reelSymbols, app.renderer)) {
                  reelLandedRef.current[r] = true;
                  anim.confirmLanding(r);
                }
              }
            }

            // Play sound when reel finishes scrolling in and starts bouncing
            for (let r = 0; r < REELS; r++) {
              const st = anim.states[r];
              if (!st.spinning && reelLandedRef.current[r] && !reelSoundPlayedRef.current[r]) {
                reelSoundPlayedRef.current[r] = true;
                const grid = s.grid[r] ?? [];
                const hasScatter = grid.includes(BanditSymbol.Scatter);

                if (hasScatter) {
                  scattersLandedRef.current++;
                  playBandit('scatter', 0.6);
                  shakeCanvas(hostRef.current);
                } else {
                  playBandit('stop', 0.4);
                }

                if (scattersLandedRef.current >= 2 && !anticipationSoundRef.current) {
                  const newAnticipating = new Set<number>();
                  for (let ar = 0; ar < REELS; ar++) {
                    if (!reelSoundPlayedRef.current[ar]) {
                      newAnticipating.add(ar);
                      anim.boostReel(ar);
                    }
                  }

                  if (newAnticipating.size > 0) {
                    anticipatingReelsRef.current = newAnticipating;
                    anticipationStartRef.current = performance.now();
                    playBandit('scatterMaybe', 0.7);
                    anticipationSoundRef.current = setInterval(() => {}, 100);
                  }
                }
              }
            }

            // Ticker-based anticipation: shake every frame, stop reels to match sound duration (~4s)
            if (anticipatingReelsRef.current.size > 0 && anticipationStartRef.current > 0) {
              const elapsed = performance.now() - anticipationStartRef.current;

              // Continuous shake while anticipating (intensity builds over time)
              if (hostRef.current) {
                const intensity = 3 + Math.min(elapsed / 1000, 4) * 2;
                const x = (Math.random() * 2 - 1) * intensity;
                const y = (Math.random() * 2 - 1) * intensity;
                hostRef.current.style.transform = `translate(${x}px, ${y}px)`;
              }

              // Stagger reel stops across the sound duration (~4s)
              const sortedReels = [...anticipatingReelsRef.current].sort((a, b) => a - b);
              for (let idx = 0; idx < sortedReels.length; idx++) {
                const ar = sortedReels[idx];
                const reelDelay = sortedReels.length === 1
                  ? 3800
                  : 2000 + idx * (1800 / Math.max(sortedReels.length - 1, 1));
                if (elapsed >= reelDelay) {
                  const st2 = anim.states[ar];
                  if (st2.spinning && st2.speed > 0.15) {
                    anim.stopReel(ar);
                  }
                }
              }

              // Clear anticipation once all anticipated reels have landed
              let allAnticipatedDone = true;
              for (const ar of anticipatingReelsRef.current) {
                if (!reelSoundPlayedRef.current[ar]) {
                  allAnticipatedDone = false;
                  break;
                }
              }
              if (allAnticipatedDone || elapsed > 8000) {
                anticipatingReelsRef.current = new Set();
                anticipationStartRef.current = 0;
                if (anticipationSoundRef.current) {
                  clearInterval(anticipationSoundRef.current);
                  anticipationSoundRef.current = null;
                }
                if (hostRef.current) {
                  hostRef.current.style.transform = '';
                }
              }
            }

            if (anim.allStopped()) {
              spinActiveRef.current = false;
              anticipatingReelsRef.current = new Set();
              anticipationStartRef.current = 0;
              if (anticipationSoundRef.current) {
                clearInterval(anticipationSoundRef.current);
                anticipationSoundRef.current = null;
              }
              if (hostRef.current) {
                hostRef.current.style.transform = '';
              }
              onSpinCompleteRef.current();
            }
          }

          const isShowingWild = s.phase === GamePhase.WildFeature || s.phase === GamePhase.FreeSpinWildFeature;
          const wildPositions = isShowingWild && s.wildFeature ? s.wildFeature.positions : undefined;
          const isShowingPaylines = s.phase === GamePhase.ShowWins || s.phase === GamePhase.FreeSpinShowWin;

          updateReelScene(
            app.renderer,
            s.grid,
            l,
            anim.states,
            s.inFreeSpins,
            isShowingPaylines ? s.paylineWins : undefined,
            isShowingPaylines ? s.currentPaylineIndex : undefined,
            s.wildFeature,
            s.spinWin > 0 ? s.spinWin : undefined,
            wildPositions,
            spinActiveRef.current ? anticipatingReelsRef.current : undefined,
          );

          if (onFrameLayoutRef.current && l.frameW > 0) {
            const key = `${l.frameX},${l.frameY},${l.frameW},${l.frameH}`;
            if (key !== lastFrameRectRef.current) {
              lastFrameRectRef.current = key;
              const res = app.renderer.resolution || 1;
              onFrameLayoutRef.current({
                x: l.frameX / res,
                y: l.frameY / res,
                w: l.frameW / res,
                h: l.frameH / res,
              });
            }
          }
        });
      });

    return () => {
      destroyed = true;
      clearTimers();
      destroyReelScene();
      if (appRef.current) {
        const canvas = appRef.current.canvas as HTMLCanvasElement;
        canvas.parentNode?.removeChild(canvas);
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  // React to snapshot changes
  useEffect(() => {
    const app = appRef.current;
    const gl = gameLayerRef.current;
    const animator = animatorRef.current;
    if (!app || !gl || !animator) return;
    if (snapshot.revision === lastRevRef.current) return;
    lastRevRef.current = snapshot.revision;

    const snap = snapshot;

    // ── Spinning phase: kick off reel animation ──
    if (snap.phase === GamePhase.Spinning || snap.phase === GamePhase.FreeSpinning) {
      if (!spinActiveRef.current) {
        clearTimers();
        wildFeatureShownRef.current = false;
        spinActiveRef.current = true;
        reelStopScheduledRef.current = [false, false, false, false, false];
        reelLandedRef.current = [false, false, false, false, false];
        reelSoundPlayedRef.current = [false, false, false, false, false];
        scattersLandedRef.current = 0;
        anticipatingReelsRef.current = new Set();
        anticipationStartRef.current = 0;
        if (anticipationSoundRef.current) {
          clearInterval(anticipationSoundRef.current);
          anticipationSoundRef.current = null;
        }

        startReelSpin();
        animator.startSpin();

        // Schedule staggered stops per reel.
        // Base cascade is fast; scatter anticipation delays extend specific reels.
        const baseDelay = 600;
        for (let r = 0; r < REELS; r++) {
          const extraDelay = snap.reelStopDelays[r] ?? 0;
          const totalDelay = baseDelay + r * 300 + extraDelay;
          scheduleTimer(() => {
            if (!reelStopScheduledRef.current[r]) {
              reelStopScheduledRef.current[r] = true;
              animator.stopReel(r);
            }
          }, totalDelay);
        }
      }
      return;
    }

    // ── Wild Feature ──
    if (snap.phase === GamePhase.WildFeature || snap.phase === GamePhase.FreeSpinWildFeature) {
      if (!wildFeatureShownRef.current) {
        wildFeatureShownRef.current = true;
        scheduleTimer(() => {
          onWildFeatureRef.current();
        }, 1200);
      }
      return;
    }

    // ── Evaluating ──
    if (snap.phase === GamePhase.Evaluating || snap.phase === GamePhase.FreeSpinEvaluating) {
      scheduleTimer(() => {
        onEvalRef.current();
      }, 200);
      return;
    }

    // ── Show Wins: cycle through paylines ──
    if (snap.phase === GamePhase.ShowWins || snap.phase === GamePhase.FreeSpinShowWin) {
      if (snap.paylineWins.length > 0 && snap.currentPaylineIndex >= 0) {
        playBandit('winLine', 0.6);
        if (!paylineCycleRef.current) {
          paylineCycleRef.current = setInterval(() => {
            onPaylineDoneRef.current();
          }, 1200);
        }
      } else {
        clearTimers();
      }
      return;
    }

    // ── Idle or other ──
    clearTimers();
    spinActiveRef.current = false;
    wildFeatureShownRef.current = false;
  }, [snapshot.revision, snapshot.phase, snapshot.currentPaylineIndex, scheduleTimer, clearTimers]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
