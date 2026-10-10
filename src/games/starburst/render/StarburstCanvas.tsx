import { Application, Container, TextureSource } from 'pixi.js';
import { useCallback, useEffect, useRef } from 'react';

import type { StarburstSnapshot, CascadeAction } from '../engine/session';
import { GamePhase } from '../engine/session';
import { FEATURE_COLORS, FEATURE_LABELS, FeatureType } from '../engine/features';
import type { Grid } from '../engine/grid';
import { SCATTER, SYMBOL_COLORS, WILD } from '../engine/symbols';
import { preloadAllTextures } from './symbolTextures';
import { computeGridLayout, drawGridScene, destroyGridScene, type GridLayout } from './drawGrid';
import {
  anticipationColFromGrid,
  clearAllAnimations,
  clearAllAnimationsAndFloats,
  queueDropOutAnimations,
  queueDropInAnimations,
  queueHighlightAnimations,
  queuePopAnimations,
  queuePulseAnimations,
  queueSpawnAnimations,
  queueFallAnimations,
  queueMorphAnimations,
  type MorphMove,
  spawnParticles,
  spawnFloatingWin,
  tickAnimations,
  triggerCameraShake,
  getCameraShakeOffset,
  triggerLayerBreathe,
  getLayerBreatheScale,
} from './gridAnimations';
import { playSB, playSBPitched } from '../audio/starburstSfx';

export interface StarburstCanvasProps {
  snapshot: StarburstSnapshot;
  onDropComplete: () => void;
  onCascadeStepComplete: () => void;
  className?: string;
}

function gridDims(grid: Grid): { rows: number; cols: number } {
  return { rows: grid.length, cols: grid[0]?.length ?? 0 };
}

/**
 * Given a set of cell ids that are in a winning line, expand it to include every cell id
 * that belongs to the same wild block as any of them. This guarantees the whole
 * 2×2 / 3×3 star pops/fades together, not just the tiles that happened to be part of
 * the winning line.
 */
function expandWithBlocks(cellIds: Set<number>, gridBefore: Grid): Set<number> {
  const blockIds = new Set<number>();
  for (const row of gridBefore) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.wildBlock && cellIds.has(cell.id)) blockIds.add(cell.wildBlock.id);
    }
  }
  if (blockIds.size === 0) return cellIds;
  const expanded = new Set(cellIds);
  for (const row of gridBefore) {
    for (const cell of row) {
      if (cell?.wildBlock && blockIds.has(cell.wildBlock.id)) expanded.add(cell.id);
    }
  }
  return expanded;
}

export function StarburstCanvas({
  snapshot,
  onDropComplete,
  onCascadeStepComplete,
  className,
}: StarburstCanvasProps) {
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
    winCells?: Set<number>;
    totalWin?: number;
    bet?: number;
    expanded?: boolean;
  } | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRevRef = useRef(-1);
  const prevGridRef = useRef<Grid | null>(null);
  const runningWinRef = useRef(0);
  const winCountRef = useRef(0);

  const layoutCache = useRef<{ w: number; h: number; expanded: boolean; layout: GridLayout } | null>(null);
  function getLayout(w: number, h: number, expanded: boolean): GridLayout {
    const c = layoutCache.current;
    if (c && c.w === w && c.h === h && c.expanded === expanded) return c.layout;
    const layout = computeGridLayout(w, h, expanded);
    layoutCache.current = { w, h, expanded, layout };
    return layout;
  }

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  function draw(
    gl: Container,
    renderer: Application['renderer'],
    grid: Grid,
    layout: GridLayout,
    winCells?: Set<number>,
    totalWin?: number,
    bet?: number,
    expanded?: boolean,
  ) {
    drawGridScene(gl, renderer, grid, layout, winCells, totalWin, bet, expanded);
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
        await preloadAllTextures(app.renderer);
        if (destroyed) return;

        const gameLayer = new Container();
        app.stage.addChild(gameLayer);
        gameLayerRef.current = gameLayer;

        const snap = snapRef.current;
        prevGridRef.current = snap.grid.map((row) => row.map((c) => (c ? { ...c } : c)));
        const layout = getLayout(app.renderer.width, app.renderer.height, snap.gridExpanded);
        draw(gameLayer, app.renderer, snap.grid, layout, undefined, undefined, undefined, snap.gridExpanded);

        app.ticker.add(() => {
          tickAnimations(app.ticker.deltaMS);
          const gl = gameLayerRef.current;
          if (!gl) return;
          const shake = getCameraShakeOffset();
          const breathe = getLayerBreatheScale();
          if (breathe !== 1) {
            // Scale around the canvas centre so the grid "breathes" instead of
            // growing from (0, 0). Set pivot + position every frame while active.
            const w = app.renderer.width;
            const h = app.renderer.height;
            gl.pivot.set(w / 2, h / 2);
            gl.position.set(w / 2 + shake.x, h / 2 + shake.y);
            gl.scale.set(breathe);
          } else {
            if (gl.scale.x !== 1 || gl.scale.y !== 1) gl.scale.set(1);
            if (gl.pivot.x !== 0 || gl.pivot.y !== 0) gl.pivot.set(0, 0);
            gl.position.set(shake.x, shake.y);
          }
          const d = displayRef.current;
          const s = snapRef.current;
          const displayGrid = d?.grid ?? s.grid;
          const expanded = d?.expanded ?? s.gridExpanded;
          const l = getLayout(app.renderer.width, app.renderer.height, expanded);
          draw(
            gl, app.renderer,
            displayGrid,
            l, d?.winCells, d?.totalWin, d?.bet, expanded,
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
    const expanded = snap.gridExpanded;
    const layout = getLayout(app.renderer.width, app.renderer.height, expanded);

    // ---------- Initial drop ----------
    if (snap.phase === GamePhase.Dropping) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      clearAllAnimationsAndFloats();
      runningWinRef.current = 0;
      winCountRef.current = 0;

      const oldGrid = prevGridRef.current;
      const newGrid = snap.grid;
      const { rows, cols } = gridDims(newGrid);

      // --- Scatter anticipation detection (2 scatters landed → 3rd could trigger Mega Star) ---
      const anticipationCol = anticipationColFromGrid(newGrid, SCATTER);
      const scatterColStagger = 55;
      const anticipationExtraMs = 520;

      const scheduleDropInSounds = () => {
        const colStagger = scatterColStagger;
        for (let c = 0; c < cols; c++) {
          let colDelay = c * colStagger;
          if (anticipationCol !== null && c >= anticipationCol) {
            colDelay += (c - anticipationCol + 1) * anticipationExtraMs;
          }
          scheduleTimer(() => { playSB('rowClick', 0.14); }, colDelay);
        }

        // Per-column scatter/wild cues, respecting anticipation delay.
        const firstColOf = (sym: string): number | null => {
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
              if (newGrid[r]?.[c]?.symbol === sym) return c;
            }
          }
          return null;
        };
        const scatterCol = firstColOf(SCATTER);
        if (scatterCol !== null) {
          let sd = scatterCol * colStagger;
          if (anticipationCol !== null && scatterCol >= anticipationCol) {
            sd += (scatterCol - anticipationCol + 1) * anticipationExtraMs;
          }
          scheduleTimer(() => playSB('scatter', 0.3), sd + 55);
        }
        const wildCol = firstColOf(WILD);
        if (wildCol !== null) {
          let wd = wildCol * colStagger;
          if (anticipationCol !== null && wildCol >= anticipationCol) {
            wd += (wildCol - anticipationCol + 1) * anticipationExtraMs;
          }
          scheduleTimer(() => playSB('wild', 0.14), wd + 55);
        }
      };

      // Rising "scatter anticipation" sound: use pitched reel-stop taps that speed up.
      const scheduleAnticipationTension = () => {
        if (anticipationCol === null) return;
        // Calculate when anticipation begins (when the last non-anticipation column lands).
        const preAnticipationMs = anticipationCol * scatterColStagger;
        // Remaining columns: play rising pitched taps while they "hang" in the air.
        for (let c = anticipationCol; c < cols; c++) {
          const step = c - anticipationCol;
          const startAt = preAnticipationMs + step * anticipationExtraMs;
          // 3 taps per column, ascending pitch.
          for (let i = 0; i < 3; i++) {
            const pitch = 0.75 + step * 0.12 + i * 0.06;
            scheduleTimer(() => playSBPitched('rowClick', pitch, 0.22), startAt + i * 100);
          }
        }
        // Heartbeat camera shake on the tension beat.
        for (let c = anticipationCol; c < cols; c++) {
          const step = c - anticipationCol;
          const startAt = preAnticipationMs + step * anticipationExtraMs;
          scheduleTimer(() => triggerCameraShake(2 + step * 0.8, 300), startAt);
        }
      };

      // Pulse already-landed scatters during the anticipation window so they visibly "call" for a 3rd.
      const schedulePulseLandedScatters = () => {
        if (anticipationCol === null) return;
        const landedScatterIds: number[] = [];
        for (let c = 0; c < anticipationCol; c++) {
          for (let r = 0; r < rows; r++) {
            const cell = newGrid[r]?.[c];
            if (cell?.symbol === SCATTER) landedScatterIds.push(cell.id);
          }
        }
        if (landedScatterIds.length === 0) return;
        const startAt = anticipationCol * scatterColStagger + 50;
        const totalAnticipationMs = (cols - anticipationCol) * anticipationExtraMs + 200;
        scheduleTimer(() => {
          queuePulseAnimations(landedScatterIds, totalAnticipationMs);
        }, startAt);
      };

      // If a 3rd scatter actually lands during the anticipation window, celebrate it the moment
      // its column reveals.
      const scheduleThirdScatterCelebration = () => {
        if (anticipationCol === null) return;
        // Find column where the 3rd (or later) scatter first appears.
        let count = 0;
        let triggerCol: number | null = null;
        const triggerCells: { row: number; col: number; cellId: number }[] = [];
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (newGrid[r]?.[c]?.symbol === SCATTER) count++;
          }
          if (count >= 3 && triggerCol === null) {
            triggerCol = c;
            for (let r = 0; r < rows; r++) {
              const cell = newGrid[r]?.[c];
              if (cell?.symbol === SCATTER) triggerCells.push({ row: r, col: c, cellId: cell.id });
            }
            break;
          }
        }
        if (triggerCol === null || triggerCol < anticipationCol) return;
        const landAt =
          triggerCol * scatterColStagger +
          (triggerCol - anticipationCol + 1) * anticipationExtraMs + 200;
        scheduleTimer(() => {
          playSB('scatter', 0.5);
          playSBPitched('explode', 1.0, 0.35, 1.5);
          triggerCameraShake(10, 500);
          for (const { row, col, cellId } of triggerCells) {
            const cx = layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            const cy = layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            spawnParticles(cx, cy, 0xff7ad6, 24, 6, 1200);
            queueSpawnAnimations([cellId], 560);
          }
          spawnFloatingWin(
            layout.gridX + (cols * (layout.cellSize + layout.gap) - layout.gap) / 2,
            layout.gridY - 16, 0, 1800, 'MEGA STAR!',
          );
        }, landAt);
      };

      const runDropIn = () => {
        clearAllAnimations();
        displayRef.current = { grid: newGrid, expanded };
        const dropInDur = queueDropInAnimations(
          newGrid, 160, scatterColStagger, 16,
          anticipationCol ?? undefined, anticipationExtraMs, 360,
        );
        draw(gl, app.renderer, newGrid, layout, undefined, undefined, undefined, expanded);
        scheduleDropInSounds();
        scheduleAnticipationTension();
        schedulePulseLandedScatters();
        scheduleThirdScatterCelebration();

        scheduleTimer(() => {
          clearAllAnimations();
          displayRef.current = null;
          prevGridRef.current = newGrid.map((row) => row.map((c) => (c ? { ...c } : c)));
          draw(gl, app.renderer, newGrid, layout, undefined, undefined, undefined, expanded);
          onDropCompleteRef.current();
        }, dropInDur + 50);
      };

      if (oldGrid) {
        const oldDims = gridDims(oldGrid);
        const oldExpanded = oldDims.rows > 5;
        const oldLayout = getLayout(app.renderer.width, app.renderer.height, oldExpanded);
        displayRef.current = { grid: oldGrid, expanded: oldExpanded };
        const dropOutDur = queueDropOutAnimations(oldGrid);
        draw(gl, app.renderer, oldGrid, oldLayout, undefined, undefined, undefined, oldExpanded);
        scheduleTimer(runDropIn, dropOutDur + 80);
      } else {
        runDropIn();
      }
      return;
    }

    // ---------- Cascade / Feature / Expand ----------
    if (snap.phase === GamePhase.Cascading ||
        snap.phase === GamePhase.FeatureActivating ||
        snap.phase === GamePhase.Expanding) {
      const action = snap.cascadeSteps[snap.currentCascadeIndex];
      if (!action) return;

      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      if (action.kind === 'win') {
        animateWinStep(action, layout, snap);
      } else if (action.kind === 'scatterAdd') {
        animateScatterAdd(action, layout, snap);
      } else if (action.kind === 'feature') {
        animateFeature(action, layout, snap);
      }
      return;
    }

    // ---------- Idle / ShowWin ----------
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    clearAllAnimations();
    displayRef.current = null;

    const totalWin = snap.phase === GamePhase.ShowWin ? snap.spinWin : 0;
    prevGridRef.current = snap.grid.map((row) => row.map((c) => (c ? { ...c } : c)));
    draw(gl, app.renderer, snap.grid, layout, undefined, totalWin > 0 ? totalWin : undefined, snap.bet, expanded);
  }, [snapshot.revision, snapshot.phase, snapshot.currentCascadeIndex, scheduleTimer]);

  // ---------- Animation helpers ----------

  function animateWinStep(
    action: Extract<CascadeAction, { kind: 'win' }>,
    layout: GridLayout,
    snap: StarburstSnapshot,
  ) {
    const app = appRef.current!;
    const gl = gameLayerRef.current!;
    const step = action.step;
    const stepWin = action.payout;
    const n = step.wins.length;
    const lineWins: number[] = [];
    let allocated = 0;
    for (let wi = 0; wi < n; wi++) {
      if (wi === n - 1) lineWins.push(stepWin - allocated);
      else {
        const w = Math.round(stepWin / n);
        lineWins.push(w);
        allocated += w;
      }
    }
    const expanded = snap.gridExpanded;
    const { rows, cols } = gridDims(step.gridAfterFill);

    let lineDelay = 0;
    for (let wi = 0; wi < step.wins.length; wi++) {
      const line = step.wins[wi];
      const cWin = lineWins[wi];
      const rawIds = new Set<number>();
      for (const { row, col } of line.cells) {
        const cell = step.gridBefore[row]?.[col];
        if (cell) rawIds.add(cell.id);
      }
      // Expand to include every cell of a wild block if any of its cells are in the line —
      // so the whole 2×2 / 3×3 star highlights and pops as one unit.
      const cellIds = expandWithBlocks(rawIds, step.gridBefore);

      scheduleTimer(() => {
        clearAllAnimations();
        queueHighlightAnimations([...cellIds], 400);
        playSBPitched('rowClick', 1.0 + winCountRef.current * 0.1, 0.55);
        const previewWin = runningWinRef.current + cWin;
        displayRef.current = {
          grid: step.gridBefore,
          winCells: cellIds,
          totalWin: previewWin > 0 ? previewWin : undefined,
          bet: snap.bet,
          expanded,
        };
      }, lineDelay);

      const popDelay = lineDelay + 420;
      scheduleTimer(() => {
        clearAllAnimations();
        queuePopAnimations([...cellIds], 340);
        const wc = winCountRef.current;
        winCountRef.current = wc + 1;
        playSBPitched('explode', 0.7 + wc * 0.2, 0.09, 1.5);

        const color = SYMBOL_COLORS[line.symbol] ?? 0xffffff;
        for (const { row, col } of line.cells) {
          const cx = layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
          const cy = layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
          spawnParticles(cx, cy, color, 10, 4, 800);
        }
        if (cWin > 0) {
          let avgX = 0, avgY = 0;
          for (const { row, col } of line.cells) {
            avgX += layout.gridX + col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
            avgY += layout.gridY + row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
          }
          avgX /= line.cells.length;
          avgY /= line.cells.length;
          spawnFloatingWin(avgX, avgY, cWin);
        }
        runningWinRef.current += cWin;
        const winRatio = runningWinRef.current / snap.bet;
        triggerCameraShake(Math.min(10, 3 + winRatio * 0.4), 260);
        displayRef.current = {
          grid: step.gridBefore,
          winCells: cellIds,
          totalWin: runningWinRef.current,
          bet: snap.bet,
          expanded,
        };
      }, popDelay);

      lineDelay = popDelay + 380;
    }

    // Wild-spawn flourish: every cleared line leaves a Wild at its center. Show a
    // brief starburst at the original center position so the player visibly sees
    // "a star just formed here" before gravity pulls it into the column.
    const wildSpawnDelay = lineDelay + 30;
    scheduleTimer(() => {
      if (!step.wildDrops?.length) return;
      for (const drop of step.wildDrops) {
        const cx = layout.gridX + drop.col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
        const cy = layout.gridY + drop.row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
        // Ring of particles + center flash
        for (let i = 0; i < 18; i++) {
          const ang = (i / 18) * Math.PI * 2;
          spawnParticles(
            cx + Math.cos(ang) * 6,
            cy + Math.sin(ang) * 6,
            0xffffff, 1, 3 + Math.random() * 2.5, 700,
          );
        }
        spawnParticles(cx, cy, 0xff7ad6, 10, 5, 600);
      }
      playSBPitched('wild', 1.2, 0.25);
      // Queue spawn (scale from 0 → 1.4 → 1) animation for each center wild when the
      // grid swaps to gridAfterFill below.
      queueSpawnAnimations(step.wildDrops.map((d) => d.cellId), 520);
    }, wildSpawnDelay);

    // Gravity fall
    const fallDelay = lineDelay + 50;
    scheduleTimer(() => {
      clearAllAnimations();
      // Re-queue the spawn animation so it survives the clearAllAnimations() above,
      // and plays while the wild settles into its final resting position.
      if (step.wildDrops?.length) {
        queueSpawnAnimations(step.wildDrops.map((d) => d.cellId), 520);
      }
      const gridAfterFill = step.gridAfterFill;
      const gridAfterRemoval = step.gridAfterRemoval;
      const moves: { cellId: number; fromRow: number; toRow: number; col: number }[] = [];
      for (let c = 0; c < cols; c++) {
        let newCellCount = 0;
        for (let r = 0; r < rows; r++) {
          const cell = gridAfterFill[r]?.[c];
          if (!cell) continue;
          let foundInOld = false;
          for (let or = 0; or < rows; or++) {
            if (gridAfterRemoval[or]?.[c]?.id === cell.id) { foundInOld = true; break; }
          }
          if (!foundInOld) newCellCount++;
        }
        let newIdx = 0;
        for (let r = 0; r < rows; r++) {
          const cell = gridAfterFill[r]?.[c];
          if (!cell) continue;
          const oldCell = gridAfterRemoval[r]?.[c];
          if (oldCell && oldCell.id === cell.id) continue;
          let fromRow = -1;
          for (let or = 0; or < rows; or++) {
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
        totalWin: runningWinRef.current,
        bet: snap.bet,
        expanded,
      };
      draw(gl, app.renderer, gridAfterFill, layout, undefined, runningWinRef.current, snap.bet, expanded);

      scheduleTimer(() => {
        clearAllAnimations();
        displayRef.current = null;
        prevGridRef.current = gridAfterFill.map((row) => row.map((c) => (c ? { ...c } : c)));
        draw(gl, app.renderer, gridAfterFill, layout, undefined, runningWinRef.current, snap.bet, expanded);
        onCascadeRef.current();
      }, fallDur + 200);
    }, fallDelay);
  }

  function animateScatterAdd(
    action: Extract<CascadeAction, { kind: 'scatterAdd' }>,
    layout: GridLayout,
    snap: StarburstSnapshot,
  ) {
    const app = appRef.current!;
    const gl = gameLayerRef.current!;
    const expanded = snap.gridExpanded;

    // Pulse scatters → pop → gravity fill → done. Scatters were removed from gridAfter.
    displayRef.current = { grid: action.gridBefore, expanded };
    const scatterIds = action.added.map((a) => a.cellId);
    queueHighlightAnimations(scatterIds, 500);
    playSB('scatter', 0.4);

    scheduleTimer(() => {
      clearAllAnimations();
      queuePopAnimations(scatterIds, 400);
      playSBPitched('explode', 1.0, 0.2, 1.4);
      for (const a of action.added) {
        const cx = layout.gridX + a.col * (layout.cellSize + layout.gap) + layout.cellSize / 2;
        const cy = layout.gridY + a.row * (layout.cellSize + layout.gap) + layout.cellSize / 2;
        spawnParticles(cx, cy, 0xff7ad6, 20, 6, 900);
        spawnFloatingWin(cx, cy, 0, 2000, `×${a.multiplier}`);
      }
      triggerCameraShake(6, 300);
    }, 520);

    scheduleTimer(() => {
      clearAllAnimations();
      displayRef.current = { grid: action.gridAfter, expanded };
      draw(gl, app.renderer, action.gridAfter, layout, undefined, runningWinRef.current, snap.bet, expanded);
    }, 1000);

    scheduleTimer(() => {
      clearAllAnimations();
      displayRef.current = null;
      prevGridRef.current = action.gridAfter.map((row) => row.map((c) => (c ? { ...c } : c)));
      draw(gl, app.renderer, action.gridAfter, layout, undefined, runningWinRef.current, snap.bet, expanded);
      onCascadeRef.current();
    }, 1200);
  }

  function animateFeature(
    action: Extract<CascadeAction, { kind: 'feature' }>,
    layout: GridLayout,
    snap: StarburstSnapshot,
  ) {
    const app = appRef.current!;
    const gl = gameLayerRef.current!;

    const before = action.application.gridBefore;
    const after = action.application.gridAfter;
    const beforeDims = gridDims(before);
    const afterDims = gridDims(after);
    const isExpand = !!action.expanded || beforeDims.rows !== afterDims.rows || beforeDims.cols !== afterDims.cols;

    // Label float above the grid (skipped for silent feature actions like block cleanup).
    const label = FEATURE_LABELS[action.feature];
    const color = FEATURE_COLORS[action.feature];
    const midX = layout.gridX + (afterDims.cols * (layout.cellSize + layout.gap) - layout.gap) / 2;
    const midY = layout.gridY - 20;
    if (!action.silent) {
      spawnFloatingWin(midX, midY, 0, 2000, label);
      playSB('wild', 0.4);
    }

    // Galaxy Star expansion: organic morph between 5×5 and 7×7.
    //
    // The transition has three acts:
    //   A) Charge-up — the pre-expansion grid stays on screen while shimmer particles
    //      converge inward and the camera gently pulses, signalling the expansion.
    //   B) Morph — we swap to the target grid (same IDs on the inner block) and run a
    //      per-cell morph animation: the original 25 cells shrink & migrate into their
    //      new inner slots, while the 24 new outer cells bloom in from 0, rippling
    //      outward from the centre. A brief layer scale pulse masks the frame swap.
    //   C) Settle — let the morph finish and hand off to the cascade engine.
    if (isExpand) {
      const fromExpanded = beforeDims.rows > 5;
      const toExpanded = afterDims.rows > 5;
      const fromLayout = getLayout(app.renderer.width, app.renderer.height, fromExpanded);
      const afterLayout = getLayout(app.renderer.width, app.renderer.height, toExpanded);
      const fromStep = fromLayout.cellSize + fromLayout.gap;
      const toStep = afterLayout.cellSize + afterLayout.gap;

      // 5×5 block sits in the centred inner region of the 7×7 grid.
      const rowOffset = Math.floor((afterDims.rows - beforeDims.rows) / 2);
      const colOffset = Math.floor((afterDims.cols - beforeDims.cols) / 2);

      const afterGridCenterX = afterLayout.gridX + (afterDims.cols * toStep - afterLayout.gap) / 2;
      const afterGridCenterY = afterLayout.gridY + (afterDims.rows * toStep - afterLayout.gap) / 2;
      const fromGridCenterX = fromLayout.gridX + (beforeDims.cols * fromStep - fromLayout.gap) / 2;
      const fromGridCenterY = fromLayout.gridY + (beforeDims.rows * fromStep - fromLayout.gap) / 2;

      // ───────── Phase A: charge-up ─────────
      clearAllAnimations();
      displayRef.current = { grid: before, expanded: fromExpanded };
      draw(gl, app.renderer, before, fromLayout, undefined, runningWinRef.current, snap.bet, fromExpanded);
      playSBPitched('rowClick', 0.85, 0.3);

      // Three waves of particles converging inward — builds tension.
      for (let wave = 0; wave < 3; wave++) {
        scheduleTimer(() => {
          const radius = 140 - wave * 35;
          const n = 18 + wave * 6;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + wave * 0.4;
            spawnParticles(
              fromGridCenterX + Math.cos(ang) * radius,
              fromGridCenterY + Math.sin(ang) * radius,
              color, 1, 2 + Math.random() * 2, 380 + wave * 80,
            );
          }
          triggerCameraShake(2 + wave, 240);
          playSBPitched('rowClick', 1 + wave * 0.15, 0.22);
        }, wave * 150);
      }

      // ───────── Phase B: morph ─────────
      const morphStartMs = 520;
      scheduleTimer(() => {
        // Build per-cell morph moves.
        const moves: MorphMove[] = [];
        const afterCenterR = (afterDims.rows - 1) / 2;
        const afterCenterC = (afterDims.cols - 1) / 2;
        const scaleInnerFrom = fromLayout.cellSize / afterLayout.cellSize;

        for (let r = 0; r < afterDims.rows; r++) {
          for (let c = 0; c < afterDims.cols; c++) {
            const cell = after[r]?.[c];
            if (!cell) continue;
            const isInner =
              r >= rowOffset && r < rowOffset + beforeDims.rows &&
              c >= colOffset && c < colOffset + beforeDims.cols;

            if (isInner) {
              // Migrate from 5×5 slot to new 7×7 slot, shrinking as it lands.
              const oldR = r - rowOffset;
              const oldC = c - colOffset;
              const oldCenterX = fromLayout.gridX + oldC * fromStep + fromLayout.cellSize / 2;
              const oldCenterY = fromLayout.gridY + oldR * fromStep + fromLayout.cellSize / 2;
              const newCenterX = afterLayout.gridX + c * toStep + afterLayout.cellSize / 2;
              const newCenterY = afterLayout.gridY + r * toStep + afterLayout.cellSize / 2;
              moves.push({
                cellId: cell.id,
                fromXOffset: (oldCenterX - newCenterX) / toStep,
                fromYOffset: (oldCenterY - newCenterY) / toStep,
                fromScaleX: scaleInnerFrom,
                fromScaleY: scaleInnerFrom,
                fromAlpha: 1,
                toAlpha: 1,
                delayMs: 0,
                durationMs: 820,
              });
            } else {
              // Outer ring blossoms in with a radial wave: middle-edges appear first,
              // corners last, so the grid "opens up" organically from its sides outward.
              // Use Euclidean distance (not Chebyshev) so the 4 corners really do come
              // last, not in sync with their neighbours.
              const radialDist = Math.hypot(r - afterCenterR, c - afterCenterC);
              // Inner 5×5 max radial ≈ 2.83; edge-middles at 3.0; corners at ≈4.24.
              const delay = 140 + Math.max(0, radialDist - 2.5) * 200;
              // Slight outward "pop" — gives the illusion the cell is thrown outward
              // slightly and then pulled back into place as it blooms.
              const dirX = c - afterCenterC;
              const dirY = r - afterCenterR;
              const dirLen = Math.hypot(dirX, dirY) || 1;
              moves.push({
                cellId: cell.id,
                fromXOffset: (dirX / dirLen) * -0.18,
                fromYOffset: (dirY / dirLen) * -0.18,
                fromScaleX: 0.05,
                fromScaleY: 0.05,
                fromAlpha: 0,
                toAlpha: 1,
                delayMs: delay,
                durationMs: 560,
              });
            }
          }
        }

        // Keep the converging particles from Phase A alive — they naturally die out
        // during the morph and provide a continuous trail into the explosion.
        displayRef.current = { grid: after, expanded: toExpanded };
        queueMorphAnimations(moves);
        draw(gl, app.renderer, after, afterLayout, undefined, runningWinRef.current, snap.bet, toExpanded);

        // Central shockwave masks the frame swap and punctuates the moment.
        for (let ring = 0; ring < 2; ring++) {
          scheduleTimer(() => {
            const rr = 30 + ring * 55;
            const n = 54;
            for (let i = 0; i < n; i++) {
              const ang = (i / n) * Math.PI * 2;
              spawnParticles(
                afterGridCenterX + Math.cos(ang) * rr,
                afterGridCenterY + Math.sin(ang) * rr,
                ring === 0 ? 0xffffff : color, 1, 5 + Math.random() * 3, 1200 + ring * 200,
              );
            }
          }, ring * 180);
        }
        triggerCameraShake(10, 550);
        playSB('wild', 0.5);
        playSB('scatter', 0.3);

        // Subtle scale pulse on the entire game layer — makes the swap feel like a
        // "zoom in, zoom out" breath instead of a discrete layout switch. The main
        // ticker reads getLayerBreatheScale() and applies pivot + scale each frame.
        triggerLayerBreathe(1.06, 820);

        // Secondary sparkles around each newly-bloomed outer cell as it appears.
        for (const m of moves) {
          if ((m.fromAlpha ?? 1) < 0.5) {
            const delay = m.delayMs ?? 0;
            scheduleTimer(() => {
              // Find cell's final-position in after grid.
              for (let rr = 0; rr < after.length; rr++) {
                const row = after[rr];
                if (!row) continue;
                for (let cc = 0; cc < row.length; cc++) {
                  if (row[cc]?.id === m.cellId) {
                    const cx = afterLayout.gridX + cc * toStep + afterLayout.cellSize / 2;
                    const cy = afterLayout.gridY + rr * toStep + afterLayout.cellSize / 2;
                    for (let k = 0; k < 10; k++) {
                      const ang = Math.random() * Math.PI * 2;
                      const dist = 4 + Math.random() * 16;
                      spawnParticles(
                        cx + Math.cos(ang) * dist,
                        cy + Math.sin(ang) * dist,
                        color, 1, 1.6 + Math.random() * 1.6, 520 + Math.random() * 240,
                      );
                    }
                  }
                }
              }
            }, delay);
          }
        }
      }, morphStartMs);

      // ───────── Phase C: settle ─────────
      //
      // Hand off to the next cascade action after the morph finishes. We do NOT call
      // clearAllAnimations here so the shockwave and sparkle particles can continue
      // to fade naturally into the post-expansion state — this avoids the "pop-out"
      // that made the original transition feel abrupt.
      scheduleTimer(() => {
        displayRef.current = null;
        prevGridRef.current = after.map((row) => row.map((c) => (c ? { ...c } : c)));
        // Defensive reset: the ticker also resets the transform once the breathe
        // animation completes, but snap it neutral here just in case the next
        // action queues new geometry before the ticker fires its next frame.
        const layer = gameLayerRef.current;
        if (layer && getLayerBreatheScale() === 1) {
          layer.scale.set(1);
          layer.pivot.set(0, 0);
        }
        draw(gl, app.renderer, after, afterLayout, undefined, runningWinRef.current, snap.bet, toExpanded);
        onCascadeRef.current();
      }, morphStartMs + 1120);
      return;
    }

    // Standard feature: pulse changed cells → swap grid → done.
    const expanded = afterDims.rows > 5;
    const changedIds = new Set<number>([...action.application.changedCellIds, ...action.application.newWildIds]);

    // Mega Star / Galaxy Star (non-expand path, i.e. already 7×7) — dramatic star-burst buildup.
    const isStar = action.feature === FeatureType.MegaStar || action.feature === FeatureType.GalaxyStar;
    if (isStar && !action.silent) {
      const gridMidX = layout.gridX + (afterDims.cols * (layout.cellSize + layout.gap) - layout.gap) / 2;
      const gridMidY = layout.gridY + (afterDims.rows * (layout.cellSize + layout.gap) - layout.gap) / 2;
      // Ring burst at the grid center.
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * Math.PI * 2;
        spawnParticles(
          gridMidX + Math.cos(ang) * 20,
          gridMidY + Math.sin(ang) * 20,
          color, 1, 5 + Math.random() * 3, 1400,
        );
      }
      triggerCameraShake(8, 500);
      playSB('scatter', 0.5);
    }

    displayRef.current = { grid: before, expanded };
    draw(gl, app.renderer, before, layout, changedIds.size ? changedIds : undefined, runningWinRef.current, snap.bet, expanded);
    queueHighlightAnimations(Array.from(changedIds), 500);

    const swapDelay = isStar ? 780 : 620;

    scheduleTimer(() => {
      clearAllAnimations();
      // Particle burst over changed cells.
      for (const id of changedIds) {
        // find the position in the AFTER grid (more reliable for new-wilds placed over old cells)
        outer:
        for (let r = 0; r < after.length; r++) {
          for (let c = 0; c < after[r].length; c++) {
            if (after[r][c]?.id === id) {
              const cx = layout.gridX + c * (layout.cellSize + layout.gap) + layout.cellSize / 2;
              const cy = layout.gridY + r * (layout.cellSize + layout.gap) + layout.cellSize / 2;
              spawnParticles(cx, cy, color, 12, 5, 800);
              break outer;
            }
          }
        }
      }
      // For star features, also spawn-scale the newly placed wild block / random wilds.
      if (isStar && action.application.newWildIds.length > 0) {
        queueSpawnAnimations(action.application.newWildIds, 620);
        playSB('wild', 0.5);
      }
      playSBPitched('explode', 0.9, 0.15, 1.4);
      triggerCameraShake(isStar ? 8 : 5, isStar ? 380 : 280);
      displayRef.current = { grid: after, expanded };
      draw(gl, app.renderer, after, layout, undefined, runningWinRef.current, snap.bet, expanded);
    }, swapDelay);

    scheduleTimer(() => {
      clearAllAnimations();
      displayRef.current = null;
      prevGridRef.current = after.map((row) => row.map((c) => (c ? { ...c } : c)));
      draw(gl, app.renderer, after, layout, undefined, runningWinRef.current, snap.bet, expanded);
      onCascadeRef.current();
    }, swapDelay + 580);
  }

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
