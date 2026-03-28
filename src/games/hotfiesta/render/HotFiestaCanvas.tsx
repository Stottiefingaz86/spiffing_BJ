import { Application, Container } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';

import type { HotFiestaSnapshot } from '../engine/session';
import { GamePhase } from '../engine/session';
import type { Grid } from '../engine/grid';
import type { JarState } from '../engine/jarWild';
import { GRID_COLS, GRID_ROWS, SYMBOL_COLORS, JAR_WILD, SCATTER } from '../engine/symbols';
import { preloadAllTextures } from './symbolTextures';
import { computeGridLayout, drawGridScene, destroyGridScene, type GridLayout } from './drawGrid';
import {
  clearAllAnimations,
  clearAllAnimationsAndFloats,
  hasActiveAnimations,
  queueDropOutAnimations,
  queueDropInAnimations,
  queueHighlightAnimations,
  queuePopAnimations,
  queueSuckAnimations,
  queueJarMoveAnimations,
  queueFallAnimations,
  spawnParticles,
  spawnFloatingWin,
  tickAnimations,
  triggerCameraShake,
  getCameraShakeOffset,
} from './gridAnimations';
import { playHF, playHFPitched } from '../audio/hotfiestaSfx';

export interface HotFiestaCanvasProps {
  snapshot: HotFiestaSnapshot;
  onDropComplete: () => void;
  onCascadeStepComplete: () => void;
  className?: string;
}

export function HotFiestaCanvas({
  snapshot,
  onDropComplete,
  onCascadeStepComplete,
  className,
}: HotFiestaCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameLayerRef = useRef<Container | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  const onDropCompleteRef = useRef(onDropComplete);
  onDropCompleteRef.current = onDropComplete;
  const onCascadeRef = useRef(onCascadeStepComplete);
  onCascadeRef.current = onCascadeStepComplete;

  const displayRef = useRef<{
    grid: Grid;
    jars: JarState[];
    winCells?: Set<number>;
    totalWin?: number;
    bet?: number;
  } | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRevRef = useRef(-1);
  const prevGridRef = useRef<Grid | null>(null);
  const runningWinRef = useRef(0);
  const winCountRef = useRef(0);

  // Cached layout — only recompute on canvas resize
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

  function draw(
    gl: Container,
    renderer: any,
    grid: Grid,
    jars: JarState[],
    layout: GridLayout,
    winCells?: Set<number>,
    totalWin?: number,
    bet?: number,
    inFreeSpins?: boolean,
  ) {
    drawGridScene(gl, renderer, grid, jars, layout, winCells, totalWin, bet, inFreeSpins);
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
      .then(async () => {
        if (destroyed) { app.destroy(true); return; }

        host.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;
        await preloadAllTextures(app.renderer);
        if (destroyed) return;

        const gameLayer = new Container();
        app.stage.addChild(gameLayer);
        gameLayerRef.current = gameLayer;

        const snap = snapRef.current;
        prevGridRef.current = snap.grid.map((row) => row.map((c) => (c ? { ...c } : c)));
        const layout = getLayout(app.renderer.width, app.renderer.height);
        draw(gameLayer, app.renderer, snap.grid, snap.jarStates, layout, undefined, undefined, undefined, snap.inFreeSpins);

        app.ticker.add(() => {
          tickAnimations(app.ticker.deltaMS);
          const gl = gameLayerRef.current;
          if (!gl) return;
          const shake = getCameraShakeOffset();
          gl.x = shake.x;
          gl.y = shake.y;
          const d = displayRef.current;
          const s = snapRef.current;
          const l = getLayout(app.renderer.width, app.renderer.height);
          draw(
            gl, app.renderer,
            d?.grid ?? s.grid,
            d?.jars ?? s.jarStates,
            l, d?.winCells, d?.totalWin, d?.bet, s.inFreeSpins,
          );
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
    lastRevRef.current = snapshot.revision;

    const snap = snapshot;
    const layout = getLayout(app.renderer.width, app.renderer.height);

    // ── Dropping phase: drop-out old → drop-in new ──
    if (snap.phase === GamePhase.Dropping || snap.phase === GamePhase.FreeSpinDropping) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      clearAllAnimationsAndFloats();
      runningWinRef.current = 0;
      winCountRef.current = 0;

      const oldGrid = prevGridRef.current;
      const newGrid = snap.grid;

      const scheduleDropInSounds = () => {
        const colStagger = 60;
        let hasJar = false;
        let hasScatter = false;
        for (let c = 0; c < GRID_COLS; c++) {
          scheduleTimer(() => {
            playHF('rowClick', 0.15);
          }, c * colStagger);
          for (let r = 0; r < GRID_ROWS; r++) {
            const cell = newGrid[r]?.[c];
            if (cell?.symbol === SCATTER && !hasScatter) {
              hasScatter = true;
              scheduleTimer(() => playHF('scatter', 0.3), c * colStagger + 60);
            }
            if (cell?.symbol === JAR_WILD && !hasJar) {
              hasJar = true;
              scheduleTimer(() => playHF('jar', 0.08), c * colStagger + 60);
            }
          }
        }
      };

      if (oldGrid) {
        displayRef.current = { grid: oldGrid, jars: [] };
        const dropOutDur = queueDropOutAnimations(oldGrid);
        draw(gl, app.renderer, oldGrid, [], layout);

        scheduleTimer(() => {
          clearAllAnimations();
          displayRef.current = { grid: newGrid, jars: snap.jarStates };
          const dropInDur = queueDropInAnimations(newGrid);
          draw(gl, app.renderer, newGrid, snap.jarStates, layout);
          scheduleDropInSounds();

          scheduleTimer(() => {
            clearAllAnimations();
            displayRef.current = null;
            prevGridRef.current = newGrid.map((row) => row.map((c) => (c ? { ...c } : c)));
            draw(gl, app.renderer, newGrid, snap.jarStates, layout);
            onDropCompleteRef.current();
          }, dropInDur + 50);
        }, dropOutDur + 80);
      } else {
        displayRef.current = { grid: newGrid, jars: snap.jarStates };
        const dropInDur = queueDropInAnimations(newGrid);
        draw(gl, app.renderer, newGrid, snap.jarStates, layout);
        scheduleDropInSounds();

        scheduleTimer(() => {
          clearAllAnimations();
          displayRef.current = null;
          prevGridRef.current = newGrid.map((row) => row.map((c) => (c ? { ...c } : c)));
          draw(gl, app.renderer, newGrid, snap.jarStates, layout);
          onDropCompleteRef.current();
        }, dropInDur + 50);
      }
      return;
    }

    // ── Cascading phase: show one cluster at a time, then fall ──
    if ((snap.phase === GamePhase.Cascading || snap.phase === GamePhase.FreeSpinCascading) && snap.currentCascadeIndex >= 0) {
      const step = snap.cascadeSteps[snap.currentCascadeIndex];
      if (!step) return;

      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      const stepWin = Math.round(snap.bet * step.payoutMultiplier);

      // Split win evenly across clusters, correct rounding on last one
      const n = step.clusters.length;
      const clusterWins: number[] = [];
      let allocated = 0;
      for (let ci = 0; ci < n; ci++) {
        if (ci === n - 1) {
          clusterWins.push(stepWin - allocated);
        } else {
          const w = Math.round(stepWin / n);
          clusterWins.push(w);
          allocated += w;
        }
      }

      // Chain: for each cluster → highlight → suck/pop, then jar hop → fall
      let clusterDelay = 0;

      for (let ci = 0; ci < step.clusters.length; ci++) {
        const cluster = step.clusters[ci];
        const cWin = clusterWins[ci];

        const cellIds = new Set<number>();
        const fruitCellData: { cellId: number; row: number; col: number }[] = [];
        let jarRow = -1, jarCol = -1;

        for (const { row, col } of cluster.cells) {
          const cell = step.gridBefore[row]?.[col];
          if (cell) {
            cellIds.add(cell.id);
            if (cell.symbol === JAR_WILD) {
              jarRow = row;
              jarCol = col;
            } else {
              fruitCellData.push({ cellId: cell.id, row, col });
            }
          }
        }

        const hasJar = jarRow >= 0;

        // Highlight this cluster
        const highlightDelay = clusterDelay;
        scheduleTimer(() => {
          clearAllAnimations();
          queueHighlightAnimations([...cellIds], 400);
          playHFPitched('rowClick', 1.0 + winCountRef.current * 0.12, 0.6);

          const previewWin = runningWinRef.current + cWin;
          displayRef.current = {
            grid: step.gridBefore,
            jars: step.jarStatesBefore,
            winCells: cellIds,
            totalWin: previewWin > 0 ? previewWin : undefined,
            bet: snap.bet,
          };
          draw(gl, app.renderer, step.gridBefore, step.jarStatesBefore, layout, cellIds, previewWin > 0 ? previewWin : undefined, snap.bet);
        }, highlightDelay);

        // Suck or Pop this cluster
        const suckPopDelay = highlightDelay + 420;
        scheduleTimer(() => {
          clearAllAnimations();

          if (hasJar) {
            // Fruit cells suck towards the jar; jar cell stays (just pop non-fruit)
            const fruitIds = fruitCellData.map((f) => f.cellId);
            queueSuckAnimations(fruitCellData, jarRow, jarCol, 300);
            // Also pop any non-jar, non-fruit (shouldn't happen, but safe)
            const jarCellIds = [...cellIds].filter((id) => !fruitIds.includes(id));
            // Don't pop the jar itself — it stays
          } else {
            queuePopAnimations([...cellIds], 320);
          }

          const wc = winCountRef.current;
          winCountRef.current = wc + 1;
          playHFPitched('explode', 0.7 + wc * 0.25, 0.1, 1.5);

          const color = SYMBOL_COLORS[cluster.fruit] ?? 0xffffff;
          for (const { row, col } of cluster.cells) {
            if (hasJar && step.gridBefore[row]?.[col]?.symbol === JAR_WILD) continue;
            const cx = layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            const cy = layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            spawnParticles(cx, cy, color, 8, 4, 700);
          }

          if (cWin > 0) {
            if (hasJar) {
              const jx = layout.gridX + jarCol * (layout.cellSize + layout.gap) + layout.cellSize / 2;
              const jy = layout.gridY + jarRow * (layout.cellSize + layout.gap) + layout.cellSize / 2;
              const jar = step.jarStatesBefore.find((j) => j.row === jarRow && j.col === jarCol);
              const mult = jar?.multiplier ?? 1;
              const baseWin = mult > 1 ? Math.round(cWin / mult) : cWin;
              spawnFloatingWin(jx, jy, cWin, 2500, undefined, baseWin, mult);
            } else {
              let avgX = 0, avgY = 0;
              for (const { row, col } of cluster.cells) {
                avgX += layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
                avgY += layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
              }
              avgX /= cluster.cells.length;
              avgY /= cluster.cells.length;
              spawnFloatingWin(avgX, avgY, cWin);
            }
          }

          runningWinRef.current += cWin;

          const winRatio = runningWinRef.current / snap.bet;
          triggerCameraShake(Math.min(12, 4 + winRatio * 0.5), 300);

          displayRef.current = {
            grid: step.gridBefore,
            jars: step.jarStatesBefore,
            winCells: cellIds,
            totalWin: runningWinRef.current,
            bet: snap.bet,
          };
          draw(gl, app.renderer, step.gridBefore, step.jarStatesBefore, layout, cellIds, runningWinRef.current, snap.bet);
        }, suckPopDelay);

        clusterDelay = suckPopDelay + (hasJar ? 340 : 380);
      }

      // Jar hop — after all clusters, animate jars moving to new positions
      const jarHopDelay = clusterDelay + 50;
      const hasJarMoves = step.jarMoves.length > 0;

      if (hasJarMoves) {
        scheduleTimer(() => {
          clearAllAnimations();
          const moveCellData = step.jarMoves.map((m) => {
            const cell = step.gridAfterRemoval[m.toRow]?.[m.toCol];
            return {
              cellId: cell?.id ?? 0,
              fromRow: m.fromRow,
              fromCol: m.fromCol,
              toRow: m.toRow,
              toCol: m.toCol,
            };
          });
          const hopDur = queueJarMoveAnimations(moveCellData, 220);

          displayRef.current = {
            grid: step.gridAfterRemoval,
            jars: step.jarStates,
            totalWin: runningWinRef.current,
            bet: snap.bet,
          };
          draw(gl, app.renderer, step.gridAfterRemoval, step.jarStates, layout, undefined, runningWinRef.current, snap.bet);
        }, jarHopDelay);
      }

      // Fall — after jar hop (or directly after clusters if no jar moves)
      const fallDelay = hasJarMoves ? jarHopDelay + 260 : clusterDelay + 50;
      scheduleTimer(() => {
        clearAllAnimations();

        const gridAfterFill = step.gridAfterFill;
        const gridAfterRemoval = step.gridAfterRemoval;

        const moves: { cellId: number; fromRow: number; toRow: number; col: number }[] = [];
        for (let c = 0; c < GRID_COLS; c++) {
          let newCellCount = 0;
          for (let r = 0; r < GRID_ROWS; r++) {
            const cell = gridAfterFill[r]?.[c];
            if (!cell) continue;
            let foundInOld = false;
            for (let or = 0; or < GRID_ROWS; or++) {
              if (gridAfterRemoval[or]?.[c]?.id === cell.id) { foundInOld = true; break; }
            }
            if (!foundInOld) newCellCount++;
          }

          let newIdx = 0;
          for (let r = 0; r < GRID_ROWS; r++) {
            const cell = gridAfterFill[r]?.[c];
            if (!cell) continue;
            const oldCell = gridAfterRemoval[r]?.[c];
            if (oldCell && oldCell.id === cell.id) continue;

            let fromRow = -1;
            for (let or = 0; or < GRID_ROWS; or++) {
              if (gridAfterRemoval[or]?.[c]?.id === cell.id) { fromRow = or; break; }
            }
            if (fromRow === -1) {
              fromRow = -(newCellCount - newIdx);
              newIdx++;
            }
            if (fromRow !== r) moves.push({ cellId: cell.id, fromRow, toRow: r, col: c });
          }
        }

        const fallDur = queueFallAnimations(moves, 180, 5);

        displayRef.current = {
          grid: gridAfterFill,
          jars: step.jarStates,
          totalWin: runningWinRef.current,
          bet: snap.bet,
        };
        draw(gl, app.renderer, gridAfterFill, step.jarStates, layout, undefined, runningWinRef.current, snap.bet);

        scheduleTimer(() => {
          clearAllAnimations();
          displayRef.current = null;
          prevGridRef.current = gridAfterFill.map((row) => row.map((c) => (c ? { ...c } : c)));
          draw(gl, app.renderer, gridAfterFill, step.jarStates, layout, undefined, runningWinRef.current, snap.bet);
          onCascadeRef.current();
        }, fallDur + 200);
      }, clusterDelay + 50);

      return;
    }

    // ── ShowWin or Idle ──
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    clearAllAnimations();
    displayRef.current = null;

    const totalWin = snap.phase === GamePhase.ShowWin ? snap.spinWin : 0;
    prevGridRef.current = snap.grid.map((row) => row.map((c) => (c ? { ...c } : c)));
    draw(gl, app.renderer, snap.grid, snap.jarStates, layout, undefined, totalWin > 0 ? totalWin : undefined, snap.bet);
  }, [snapshot.revision, snapshot.phase, snapshot.currentCascadeIndex, scheduleTimer]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
