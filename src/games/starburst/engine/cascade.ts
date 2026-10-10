import { getPayoutMultiplier, randomPaying, SCATTER, WILD } from './symbols';
import { detectLineWins, type LineWin } from './lines';
import { cloneGrid, makeCell, type Grid } from './grid';

/** One avalanche step — wins cleared, center-wilds placed, gravity applied, fill. */
export interface WinCascadeStep {
  wins: LineWin[];
  payoutMultiplier: number; // paytable sum (before Multiplier Collect Meter)
  gridBefore: Grid;
  gridAfterRemoval: Grid;
  gridAfterFill: Grid;
  wildDrops: { row: number; col: number; cellId: number }[];
}

/** Find one WIN cascade step if there are wins; mutates the grid. Returns null if no wins. */
export function stepOnce(grid: Grid): WinCascadeStep | null {
  const wins = detectLineWins(grid);
  if (wins.length === 0) return null;

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  let stepPayout = 0;
  for (const w of wins) stepPayout += getPayoutMultiplier(w.symbol, w.cells.length);

  const gridBefore = cloneGrid(grid);

  // Remove winning cells (track which were pure-wild lines — those skip center-wild drop).
  const winIsPureWild: boolean[] = wins.map((w) => w.cells.every(({ row, col }) => grid[row][col].symbol === WILD));

  // Track which wild block IDs are being consumed (any winning cell inside a block
  // means the whole block is consumed — stars don't stick around after use).
  const consumedBlockIds = new Set<number>();
  for (const w of wins) {
    for (const { row, col } of w.cells) {
      const block = grid[row][col]?.wildBlock;
      if (block) consumedBlockIds.add(block.id);
    }
  }

  // Collect every cell position that should be cleared: winning cells + all cells
  // belonging to any consumed wild block.
  const toClear = new Set<string>();
  for (const w of wins) {
    for (const { row, col } of w.cells) toClear.add(`${row},${col}`);
  }
  if (consumedBlockIds.size > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bid = grid[r][c]?.wildBlock?.id;
        if (bid !== undefined && consumedBlockIds.has(bid)) toClear.add(`${r},${c}`);
      }
    }
  }
  for (const key of toClear) {
    const [rs, cs] = key.split(',');
    const rr = Number(rs); const cc = Number(cs);
    (grid[rr] as unknown as (null | unknown)[])[cc] = null;
  }

  // Place one WILD at the center of each cleared line (rounded left / up for even lengths).
  // Skip if the line was entirely Wilds (wild-substitute pay), if any cell in the line was
  // part of a consumed wild block (don't re-spawn the star), or if that position has already been claimed.
  const wildDrops: { row: number; col: number; cellId: number }[] = [];
  for (let i = 0; i < wins.length; i++) {
    if (winIsPureWild[i]) continue;
    const w = wins[i];
    const lineTouchedBlock = w.cells.some(({ row, col }) => {
      const c = gridBefore[row][col];
      return c?.wildBlock && consumedBlockIds.has(c.wildBlock.id);
    });
    if (lineTouchedBlock) continue;
    const midIdx = Math.floor((w.cells.length - 1) / 2);
    const { row, col } = w.cells[midIdx];
    if (grid[row]?.[col]) continue;
    const cell = makeCell(WILD);
    grid[row][col] = cell;
    wildDrops.push({ row, col, cellId: cell.id });
  }

  const gridAfterRemoval = cloneGrid(grid);

  // Gravity (per column).
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r][c] !== null) {
        if (r !== write) {
          grid[write][c] = grid[r][c];
          (grid[r] as unknown as (null | unknown)[])[c] = null;
        }
        write--;
      }
    }
  }
  // Fill gaps with fresh paying symbols (avalanche refills never spawn new scatters/wilds).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === null) grid[r][c] = makeCell(randomPaying());
    }
  }

  const gridAfterFill = cloneGrid(grid);
  return { wins, payoutMultiplier: stepPayout, gridBefore, gridAfterRemoval, gridAfterFill, wildDrops };
}

/** Sum of scatter multipliers currently on the board (0 when none). */
export function sumScatterMultipliers(grid: Grid): number {
  let total = 0;
  for (const row of grid) for (const cell of row)
    if (cell?.symbol === SCATTER && cell.multiplier) total += cell.multiplier;
  return total;
}
