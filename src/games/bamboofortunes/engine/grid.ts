import {
  GRID_COLS, GRID_ROWS,
  WILD, SCATTER,
  randomSymbol, randomFruit,
  getPayoutMultiplier,
  type CellSymbol, type BambooSymbol,
} from './symbols';
import { getSymbolMultiplier, type SymbolMultiplier } from './symbolMultipliers';

let nextId = 1;

export interface Cell {
  symbol: CellSymbol;
  id: number;
}

export function makeCell(symbol: CellSymbol): Cell {
  return { symbol, id: nextId++ };
}

export type Grid = (Cell | null)[][];

export function createGrid(): Grid {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => makeCell(randomSymbol())),
  );
}

export function createFruitGrid(): Grid {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => makeCell(randomFruit())),
  );
}

/** 12 scatters in three separate 2×2 blobs (cluster size 4 each → no line pay). Used for bonus-buy reel reveal. */
export function createBonusBuyRevealGrid(): Grid {
  const scatterKeys = new Set<string>([
    '0,0', '0,1', '1,0', '1,1',
    '0,4', '0,5', '1,4', '1,5',
    '3,0', '3,1', '4,0', '4,1',
  ]);
  return Array.from({ length: GRID_ROWS }, (_, r) =>
    Array.from({ length: GRID_COLS }, (_, c) =>
      scatterKeys.has(`${r},${c}`) ? makeCell(SCATTER) : makeCell(randomFruit()),
    ),
  );
}

export interface ClusterCell {
  id: number;
  row: number;
  col: number;
}

export interface Cluster {
  symbol: BambooSymbol | typeof SCATTER;
  cells: ClusterCell[];
}

export function detectClusters(grid: Grid): Cluster[] {
  const visited = new Set<number>();
  const clusters: Cluster[] = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r]?.[c];
      if (!cell || visited.has(cell.id)) continue;
      if (cell.symbol === WILD) continue;

      const targetSymbol = cell.symbol as BambooSymbol | typeof SCATTER;
      const clusterCells: ClusterCell[] = [];
      const queue: [number, number][] = [[r, c]];
      const seen = new Set<number>();
      seen.add(cell.id);

      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        const curr = grid[cr]?.[cc];
        if (!curr) continue;

        clusterCells.push({ id: curr.id, row: cr, col: cc });

        const neighbors: [number, number][] = [
          [cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
          const neighbor = grid[nr]?.[nc];
          if (!neighbor || seen.has(neighbor.id)) continue;
          if (neighbor.symbol === targetSymbol || neighbor.symbol === WILD) {
            seen.add(neighbor.id);
            queue.push([nr, nc]);
          }
        }
      }

      if (clusterCells.length >= 5) {
        for (const cl of clusterCells) visited.add(cl.id);
        clusters.push({ symbol: targetSymbol, cells: clusterCells });
      }
    }
  }

  return clusters;
}

export function countScatters(grid: Grid): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell?.symbol === SCATTER) count++;
    }
  }
  return count;
}

export function countScattersInColumns(grid: Grid, cols: Set<number>): number {
  let count = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (const c of cols) {
      if (grid[r]?.[c]?.symbol === SCATTER) count++;
    }
  }
  return count;
}

export function computePayout(clusters: Cluster[], multipliers: SymbolMultiplier[]): number {
  let total = 0;
  for (const cluster of clusters) {
    const baseMult = getPayoutMultiplier(cluster.symbol, cluster.cells.length);
    if (baseMult <= 0) continue;
    const symMult = cluster.symbol === SCATTER ? 1 : getSymbolMultiplier(multipliers, cluster.symbol as BambooSymbol);
    total += baseMult * symMult;
  }
  return total;
}
