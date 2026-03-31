import {
  applyGravityNoFill,
  cloneGrid,
  type Grid,
  gridToNullablePhysics,
  isSpinPaddingCell,
  nullableToGridWithPadding,
} from '../engine/grid';
import type { TempleSymbol } from '../engine/symbols';
import { REELS, ROWS } from '../engine/symbols';
import { buildFallMovesGravityOnly } from './cascadePhysics';
import {
  estimateFallAnimBatchMaxEndMs,
  estimateSpinClearColumnExplodeMaxEndMs,
  QUEST_RAIDER_SPIN_CLEAR_FALL_BASE_MS,
  QUEST_RAIDER_SPIN_CLEAR_FALL_TIMING,
  QUEST_RAIDER_SPIN_STRIP_COL_OFFSET_MS,
} from './gridAnimations';

export interface SpinClearRemoval {
  removedId: number;
  removedRow: number;
  removedCol: number;
  removedSymbol: TempleSymbol;
}

export interface SpinClearTimelineStep {
  tMs: number;
  /** Whole reel: every real symbol in this column drops together (trap door). */
  removals: SpinClearRemoval[];
  fallMoves: { cellId: number; fromRow: number; toRow: number; col: number }[];
  displayAfter: Grid;
  /** Use when scheduling the next spin phase after all clears */
  localMaxMs: number;
}

/**
 * Trap-door clear: each reel opens left→right on a fixed beat (columns overlap — slot-style cascade).
 */
export function buildSpinClearTimeline(initialGrid: Grid): SpinClearTimelineStep[] {
  const steps: SpinClearTimelineStep[] = [];
  let g = cloneGrid(initialGrid);
  let tMs = 0;

  for (let c = 0; c < REELS; c++) {
    const removals: SpinClearRemoval[] = [];
    for (let r = 0; r < ROWS; r++) {
      const cell = g[r][c];
      if (isSpinPaddingCell(cell)) continue;
      removals.push({
        removedId: cell.id,
        removedRow: r,
        removedCol: c,
        removedSymbol: cell.symbol,
      });
    }
    if (removals.length === 0) continue;

    const ng = gridToNullablePhysics(g);
    for (let r = 0; r < ROWS; r++) {
      if (!isSpinPaddingCell(g[r][c])) ng[r][c] = null;
    }
    const fallMoves = buildFallMovesGravityOnly(ng);
    const compacted = ng.map((row) => [...row]);
    applyGravityNoFill(compacted);
    const displayAfter = nullableToGridWithPadding(compacted);

    const explodeEnd = estimateSpinClearColumnExplodeMaxEndMs(removals);
    const fallEnd =
      fallMoves.length > 0
        ? estimateFallAnimBatchMaxEndMs(
            fallMoves,
            QUEST_RAIDER_SPIN_CLEAR_FALL_BASE_MS,
            0,
            QUEST_RAIDER_SPIN_CLEAR_FALL_TIMING,
          )
        : 0;
    const stepEnd = Math.max(explodeEnd, fallEnd);

    steps.push({
      tMs,
      removals,
      fallMoves,
      displayAfter,
      localMaxMs: stepEnd,
    });

    g = displayAfter;
    tMs += QUEST_RAIDER_SPIN_STRIP_COL_OFFSET_MS;
  }

  return steps;
}
