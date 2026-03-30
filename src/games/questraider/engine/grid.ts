import { REELS, ROWS, randomSymbolForColumn, type TempleSymbol } from './symbols';

export interface Cell {
  symbol: TempleSymbol;
  id: number;
}

let nextCellId = 0;

export function makeCell(symbol: TempleSymbol): Cell {
  return { symbol, id: nextCellId++ };
}

/** Row-major: grid[row][col], row 0 = top, col 0 = left reel. */
export type Grid = Cell[][];

export function createGrid(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < REELS; c++) {
      row.push(makeCell(randomSymbolForColumn(c)));
    }
    grid.push(row);
  }
  return grid;
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export type NullableGrid = (Cell | null)[][];

export function cloneNullable(grid: NullableGrid): NullableGrid {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** Remove wins, compact downward per column, then fill gaps at top with new symbols. Mutates `g`. */
export function applyGravityAndFill(g: NullableGrid): void {
  for (let c = 0; c < REELS; c++) {
    const stack: Cell[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const cell = g[r][c];
      if (cell) stack.push(cell);
      g[r][c] = null;
    }
    let wr = ROWS - 1;
    for (const cell of stack) {
      g[wr][c] = cell;
      wr--;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < REELS; c++) {
      if (g[r][c] === null) {
        g[r][c] = makeCell(randomSymbolForColumn(c));
      }
    }
  }
}

export function nullableToGrid(g: NullableGrid): Grid {
  return g.map((row) =>
    row.map((cell) => {
      if (!cell) throw new Error('nullableToGrid: unexpected null');
      return cell;
    }),
  );
}

export function gridToNullable(grid: Grid): NullableGrid {
  return grid.map((row) => row.map((c) => c));
}
