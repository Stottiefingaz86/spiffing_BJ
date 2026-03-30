import {
  cloneGrid,
  cloneNullable,
  applyGravityAndFill,
  gridToNullable,
  nullableToGrid,
  type Grid,
  type NullableGrid,
} from './grid';
import { evaluatePaylines, type PaylineWin } from './paylines';

export interface AvalancheStep {
  /** Full grid before removing this step's wins. */
  gridBefore: Grid;
  lineWins: PaylineWin[];
  /** Unique winning cells (row, col). */
  winningCells: { row: number; col: number }[];
  /** Line wins summed, before avalanche multiplier. */
  basePayoutCents: number;
  /** Applied avalanche multiplier for this step. */
  avalancheMult: number;
  /** Payout for this step in cents. */
  payoutCents: number;
  /** After removals (holes), before gravity. */
  gridAfterRemoval: NullableGrid;
  /** Settled grid after gravity + refill (start of next evaluation). */
  gridAfter: Grid;
}

function collectWinningCells(wins: PaylineWin[]): { row: number; col: number }[] {
  const set = new Set<string>();
  for (const w of wins) {
    for (const p of w.positions) {
      set.add(`${p.row},${p.reel}`);
    }
  }
  return [...set].map((key) => {
    const [row, col] = key.split(',').map(Number);
    return { row, col };
  });
}

function removeCells(g: NullableGrid, cells: { row: number; col: number }[]): void {
  for (const { row, col } of cells) {
    g[row][col] = null;
  }
}

function avalancheMultiplier(stepIndex: number, inFreeFall: boolean): number {
  if (inFreeFall) {
    return Math.min(15, 3 * (stepIndex + 1));
  }
  return Math.min(5, stepIndex + 1);
}

const MAX_STEPS = 24;

/**
 * Mutates a full `Grid` copy into the final post-cascade state.
 * Returns per-step snapshots for animation.
 */
export function runAvalancheLoop(
  grid: Grid,
  bet: number,
  inFreeFall: boolean,
): AvalancheStep[] {
  const steps: AvalancheStep[] = [];
  let working = cloneGrid(grid);
  let stepIndex = 0;

  while (steps.length < MAX_STEPS) {
    const lineWins = evaluatePaylines(working, bet);
    if (lineWins.length === 0) break;

    const mult = avalancheMultiplier(stepIndex, inFreeFall);
    let base = 0;
    for (const w of lineWins) base += w.payout;
    const payoutCents = Math.round(base * mult);

    const gridBefore = cloneGrid(working);
    const winningCells = collectWinningCells(lineWins);

    const ng = gridToNullable(working);
    removeCells(ng, winningCells);
    const gridAfterRemoval = cloneNullable(ng);

    applyGravityAndFill(ng);
    working = nullableToGrid(ng);

    const gridAfter = cloneGrid(working);

    steps.push({
      gridBefore,
      lineWins,
      winningCells,
      basePayoutCents: base,
      avalancheMult: mult,
      payoutCents,
      gridAfterRemoval,
      gridAfter,
    });
    stepIndex++;
  }

  return steps;
}
