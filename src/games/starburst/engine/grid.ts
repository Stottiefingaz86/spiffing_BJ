import {
  SCATTER,
  randomPaying,
  randomSymbol,
  type CellSymbol,
  type ScatterMultiplier,
} from './symbols';

export interface Cell {
  symbol: CellSymbol;
  id: number;
  /** x2/x3/x5/x10/x25 multiplier (Scatter only). */
  multiplier?: ScatterMultiplier;
  /** Ties wild cells together when a 2×2 or 3×3 block drops as one unit. */
  wildBlock?: { id: number; size: 2 | 3 };
}

let nextCellId = 0;
export function makeCell(symbol: CellSymbol, opts?: Partial<Omit<Cell, 'symbol' | 'id'>>): Cell {
  return { symbol, id: nextCellId++, ...(opts ?? {}) };
}

/** Row-major grid. grid[row][col]. Row 0 = top. */
export type Grid = Cell[][];

export function gridRows(grid: Grid): number { return grid.length; }
export function gridCols(grid: Grid): number { return grid[0]?.length ?? 0; }

export function createGrid(rows: number, cols: number, opts?: { scatterChance?: number; wildChance?: number }): Grid {
  const g: Grid = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) row.push(makeCell(randomSymbol(opts)));
    g.push(row);
  }
  return g;
}

export function createPayingGrid(rows: number, cols: number): Grid {
  const g: Grid = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) row.push(makeCell(randomPaying()));
    g.push(row);
  }
  return g;
}

export function countScatters(grid: Grid): number {
  let n = 0;
  for (const row of grid) for (const c of row) if (c?.symbol === SCATTER) n++;
  return n;
}

export function findScatterCells(grid: Grid): { row: number; col: number; cell: Cell }[] {
  const out: { row: number; col: number; cell: Cell }[] = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c]?.symbol === SCATTER) out.push({ row: r, col: c, cell: grid[r][c] });
  return out;
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : cell)));
}
