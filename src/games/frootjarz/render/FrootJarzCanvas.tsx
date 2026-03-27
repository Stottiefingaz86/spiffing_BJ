import { Application, Container } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';

import type { FrootJarzSnapshot } from '../engine/session';
import { GamePhase } from '../engine/session';
import type { Grid } from '../engine/grid';
import type { JarState } from '../engine/jarWild';
import { GRID_COLS, GRID_ROWS, SYMBOL_COLORS } from '../engine/symbols';
import { preloadAllTextures } from './symbolTextures';
import { computeGridLayout, drawGridScene } from './drawGrid';
import {
  clearAllAnimations,
  hasActiveAnimations,
  queueDropOutAnimations,
  queueDropInAnimations,
  queueHighlightAnimations,
  queuePopAnimations,
  queueFallAnimations,
  spawnParticles,
  spawnFloatingWin,
  tickAnimations,
  triggerCameraShake,
  getCameraShakeOffset,
} from './gridAnimations';

export interface FrootJarzCanvasProps {
  snapshot: FrootJarzSnapshot;
  onDropComplete: () => void;
  onCascadeStepComplete: () => void;
  className?: string;
}

export function FrootJarzCanvas({
  snapshot,
  onDropComplete,
  onCascadeStepComplete,
  className,
}: FrootJarzCanvasProps) {
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
  // Track running win total across cascade steps for the big pill
  const runningWinRef = useRef(0);

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  // Helper to call drawGridScene with current display state
  function draw(
    gl: Container,
    renderer: any,
    grid: Grid,
    jars: JarState[],
    layout: ReturnType<typeof computeGridLayout>,
    winCells?: Set<number>,
    totalWin?: number,
    bet?: number,
  ) {
    drawGridScene(gl, renderer, grid, jars, layout, winCells, totalWin, bet);
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
        if (destroyed) { app.destroy(true); return; }

        host.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;
        preloadAllTextures(app.renderer);

        const gameLayer = new Container();
        app.stage.addChild(gameLayer);
        gameLayerRef.current = gameLayer;

        const snap = snapRef.current;
        prevGridRef.current = snap.grid.map((row) => row.map((c) => (c ? { ...c } : c)));
        const layout = computeGridLayout(app.renderer.width, app.renderer.height);
        draw(gameLayer, app.renderer, snap.grid, snap.jarStates, layout);

        app.ticker.add(() => {
          tickAnimations(app.ticker.deltaMS);
          const gl = gameLayerRef.current;
          if (!gl) return;
          const shake = getCameraShakeOffset();
          gl.x = shake.x;
          gl.y = shake.y;
          if (hasActiveAnimations()) {
            const d = displayRef.current;
            const s = snapRef.current;
            const l = computeGridLayout(app.renderer.width, app.renderer.height);
            draw(
              gl, app.renderer,
              d?.grid ?? s.grid,
              d?.jars ?? s.jarStates,
              l, d?.winCells, d?.totalWin, d?.bet,
            );
          }
        });
      });

    return () => {
      destroyed = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
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
    const layout = computeGridLayout(app.renderer.width, app.renderer.height);

    // ── Dropping phase: drop-out old → drop-in new ──
    if (snap.phase === GamePhase.Dropping || snap.phase === GamePhase.FreeSpinDropping) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      clearAllAnimations();
      runningWinRef.current = 0;

      const oldGrid = prevGridRef.current;
      const newGrid = snap.grid;

      if (oldGrid) {
        displayRef.current = { grid: oldGrid, jars: [] };
        const dropOutDur = queueDropOutAnimations(oldGrid);
        draw(gl, app.renderer, oldGrid, [], layout);

        scheduleTimer(() => {
          clearAllAnimations();
          displayRef.current = { grid: newGrid, jars: snap.jarStates };
          const dropInDur = queueDropInAnimations(newGrid);
          draw(gl, app.renderer, newGrid, snap.jarStates, layout);

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

    // ── Cascading phase: highlight → pop → fall ──
    if ((snap.phase === GamePhase.Cascading || snap.phase === GamePhase.FreeSpinCascading) && snap.currentCascadeIndex >= 0) {
      const step = snap.cascadeSteps[snap.currentCascadeIndex];
      if (!step) return;

      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      const winCells = new Set<number>();
      for (const cluster of step.clusters) {
        for (const { row, col } of cluster.cells) {
          const cell = step.gridBefore[row]?.[col];
          if (cell) winCells.add(cell.id);
        }
      }

      const stepWin = Math.round(snap.bet * step.payoutMultiplier);

      // ── Highlight ──
      clearAllAnimations();
      queueHighlightAnimations([...winCells], 450);
      displayRef.current = {
        grid: step.gridBefore,
        jars: snap.jarStates,
        winCells,
        totalWin: runningWinRef.current > 0 ? runningWinRef.current : undefined,
        bet: snap.bet,
      };
      draw(gl, app.renderer, step.gridBefore, snap.jarStates, layout, winCells, runningWinRef.current > 0 ? runningWinRef.current : undefined, snap.bet);

      // ── Pop + particles + floating small win ──
      scheduleTimer(() => {
        clearAllAnimations();
        queuePopAnimations([...winCells], 350);

        // Particles
        for (const cluster of step.clusters) {
          const color = SYMBOL_COLORS[cluster.fruit] ?? 0xffffff;
          for (const { row, col } of cluster.cells) {
            const cx = layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            const cy = layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            spawnParticles(cx, cy, color, 10, 3.5, 650);
          }
        }

        // Floating small win text — spawn at the center of each cluster
        if (stepWin > 0) {
          for (const cluster of step.clusters) {
            let avgX = 0, avgY = 0;
            for (const { row, col } of cluster.cells) {
              avgX += layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
              avgY += layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            }
            avgX /= cluster.cells.length;
            avgY /= cluster.cells.length;
            const clusterWin = Math.round(snap.bet * (step.payoutMultiplier / step.clusters.length));
            spawnFloatingWin(avgX, avgY, clusterWin > 0 ? clusterWin : stepWin);
          }
        }

        // Update running total
        runningWinRef.current += stepWin;

        // Camera shake on every win — intensity scales with win size
        const winRatio = runningWinRef.current / snap.bet;
        const intensity = Math.min(12, 4 + winRatio * 0.5);
        triggerCameraShake(intensity, 350);

        displayRef.current = {
          grid: step.gridBefore,
          jars: snap.jarStates,
          winCells,
          totalWin: runningWinRef.current,
          bet: snap.bet,
        };
        draw(gl, app.renderer, step.gridBefore, snap.jarStates, layout, winCells, runningWinRef.current, snap.bet);

        // ── Fall ──
        scheduleTimer(() => {
          clearAllAnimations();

          const gridAfterFill = step.gridAfterFill;
          const gridAfterRemoval = step.gridAfterRemoval;

          const moves: { cellId: number; fromRow: number; toRow: number; col: number }[] = [];
          for (let c = 0; c < GRID_COLS; c++) {
            // Count how many new cells enter this column from above
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
                // New cell: enters from above, staggered
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

          // ── Pause then advance ──
          scheduleTimer(() => {
            clearAllAnimations();
            displayRef.current = null;
            prevGridRef.current = gridAfterFill.map((row) => row.map((c) => (c ? { ...c } : c)));
            draw(gl, app.renderer, gridAfterFill, step.jarStates, layout, undefined, runningWinRef.current, snap.bet);
            onCascadeRef.current();
          }, fallDur + 200);
        }, 400);
      }, 480);

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
