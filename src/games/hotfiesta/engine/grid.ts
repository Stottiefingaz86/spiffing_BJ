import {
  GRID_COLS,
  GRID_ROWS,
  JAR_WILD,
  SCATTER,
  randomFruit,
  randomSymbol,
  type CellSymbol,
  type FiestaSymbol,
} from './symbols';

export interface Cell {
  symbol: CellSymbol;
  id: number;
}

let nextCellId = 0;

export function makeCell(symbol: CellSymbol): Cell {
  return { symbol, id: nextCellId++ };
}

/** Row-major 7x7 grid. grid[row][col]. Row 0 = top. */
export type Grid = Cell[][];

export function createGrid(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      row.push(makeCell(randomSymbol()));
    }
    grid.push(row);
  }
  return grid;
}

export function createFruitGrid(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      row.push(makeCell(randomFruit()));
    }
    grid.push(row);
  }
  return grid;
}

export interface Cluster {
  fruit: FiestaSymbol;
  cells: { row: number; col: number }[];
  hasJar: boolean;
}

export function detectClusters(grid: Grid): Cluster[] {
  const visited = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
  const clusters: Cluster[] = [];

  const inBounds = (r: number, c: number) =>
    r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS;

  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (visited[r][c]) continue;
      const sym = grid[r][c].symbol;
      if (sym === JAR_WILD || sym === SCATTER) continue;

      const cells: { row: number; col: number }[] = [];
      let hasJar = false;
      const queue: [number, number][] = [[r, c]];
      visited[r][c] = true;

      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        cells.push({ row: cr, col: cc });
        if (grid[cr][cc].symbol === JAR_WILD) hasJar = true;

        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (!inBounds(nr, nc) || visited[nr][nc]) continue;
          const ns = grid[nr][nc].symbol;
          if (ns === sym || ns === JAR_WILD) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }

      if (cells.length >= 5) {
        clusters.push({ fruit: sym as FiestaSymbol, cells, hasJar });
      } else {
        for (const { row: cr, col: cc } of cells) {
          if (grid[cr][cc].symbol === JAR_WILD) {
            visited[cr][cc] = false;
          }
        }
      }
    }
  }

  const clusterCellSet = new Map<string, number>();
  for (let ci = 0; ci < clusters.length; ci++) {
    for (const { row: cr, col: cc } of clusters[ci].cells) {
      clusterCellSet.set(`${cr},${cc}`, ci);
    }
  }

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (visited[r][c]) continue;
      if (grid[r][c].symbol !== JAR_WILD) continue;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        const ci = clusterCellSet.get(`${nr},${nc}`);
        if (ci !== undefined) {
          clusters[ci].cells.push({ row: r, col: c });
          clusters[ci].hasJar = true;
          visited[r][c] = true;
          break;
        }
      }
    }
  }

  return clusters;
}

export function countScatters(grid: Grid): number {
  let count = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r]?.[c]?.symbol === SCATTER) count++;
    }
  }
  return count;
}
