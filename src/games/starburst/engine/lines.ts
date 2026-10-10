import { SCATTER, WILD, type GalaxySymbol } from './symbols';
import type { Grid } from './grid';

export interface LineWin {
  symbol: GalaxySymbol;
  cells: { row: number; col: number }[];
  orientation: 'horizontal' | 'vertical';
}

/**
 * Detect horizontal + vertical runs of length ≥ 3 where every cell is the same paying symbol
 * (or a WILD substitute). SCATTER never participates in line wins.
 */
export function detectLineWins(grid: Grid): LineWin[] {
  const wins: LineWin[] = [];
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  // Horizontal
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const startSym = grid[r][c]?.symbol;
      if (!startSym || startSym === SCATTER) { c++; continue; }

      let target: GalaxySymbol | null =
        startSym === WILD ? null : (startSym as GalaxySymbol);
      let end = c;
      while (end < cols) {
        const sym = grid[r][end]?.symbol;
        if (!sym || sym === SCATTER) break;
        if (sym === WILD) { end++; continue; }
        if (target === null) { target = sym as GalaxySymbol; end++; continue; }
        if (sym === target) { end++; continue; }
        break;
      }

      const length = end - c;
      if (length >= 3 && target !== null) {
        const cells: { row: number; col: number }[] = [];
        for (let cc = c; cc < end; cc++) cells.push({ row: r, col: cc });
        wins.push({ symbol: target, cells, orientation: 'horizontal' });
      }
      c = Math.max(end, c + 1);
    }
  }

  // Vertical
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const startSym = grid[r][c]?.symbol;
      if (!startSym || startSym === SCATTER) { r++; continue; }

      let target: GalaxySymbol | null =
        startSym === WILD ? null : (startSym as GalaxySymbol);
      let end = r;
      while (end < rows) {
        const sym = grid[end][c]?.symbol;
        if (!sym || sym === SCATTER) break;
        if (sym === WILD) { end++; continue; }
        if (target === null) { target = sym as GalaxySymbol; end++; continue; }
        if (sym === target) { end++; continue; }
        break;
      }

      const length = end - r;
      if (length >= 3 && target !== null) {
        const cells: { row: number; col: number }[] = [];
        for (let rr = r; rr < end; rr++) cells.push({ row: rr, col: c });
        wins.push({ symbol: target, cells, orientation: 'vertical' });
      }
      r = Math.max(end, r + 1);
    }
  }

  return wins;
}

export function winningCellSet(wins: LineWin[]): Set<string> {
  const s = new Set<string>();
  for (const w of wins) for (const { row, col } of w.cells) s.add(`${row},${col}`);
  return s;
}
