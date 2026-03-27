import { GRID_COLS, GRID_ROWS, JAR_WILD } from './symbols';
import type { Cluster, Grid } from './grid';

export interface JarState {
  row: number;
  col: number;
  multiplier: number;
  /** Unique ID for tracking across animations. */
  id: number;
}

let nextJarId = 0;

export function createJarState(row: number, col: number): JarState {
  return { row, col, multiplier: 1, id: nextJarId++ };
}

/** Sync jar states with actual jar positions on the grid. */
export function syncJarStates(grid: Grid, existing: JarState[]): JarState[] {
  const states: JarState[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c]?.symbol === JAR_WILD) {
        const prev = existing.find((j) => j.row === r && j.col === c);
        if (prev) {
          states.push(prev);
        } else {
          states.push(createJarState(r, c));
        }
      }
    }
  }
  return states;
}

/** All 8 directions — used for adjacency checks (e.g. cluster detection). */
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** Lateral + downward only — jars never move upward against gravity. */
const MOVE_DIRS = [
  [1, 0],   // down
  [0, -1],  // left
  [0, 1],   // right
  [1, -1],  // down-left
  [1, 1],   // down-right
];

/** Increment multipliers for jars that participated in winning clusters. */
export function processJarWins(grid: Grid, clusters: Cluster[], jarStates: JarState[]): void {
  const winningJarPositions = new Set<string>();
  for (const cluster of clusters) {
    for (const { row, col } of cluster.cells) {
      if (grid[row][col]?.symbol === JAR_WILD) {
        winningJarPositions.add(`${row},${col}`);
      }
    }
  }

  for (const jar of jarStates) {
    if (winningJarPositions.has(`${jar.row},${jar.col}`)) {
      jar.multiplier += 1;
    }
  }
}

/** Move jars to random adjacent empty tiles after a cascade step. */
export function moveJars(grid: Grid, jarStates: JarState[]): void {
  for (const jar of jarStates) {
    const candidates: { r: number; c: number }[] = [];
    for (const [dr, dc] of MOVE_DIRS) {
      const nr = jar.row + dr;
      const nc = jar.col + dc;
      if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS) {
        if (grid[nr][nc] === null || (grid[nr][nc]?.symbol !== JAR_WILD)) {
          const occupiedByOtherJar = jarStates.some(
            (j) => j !== jar && j.row === nr && j.col === nc,
          );
          if (!occupiedByOtherJar) {
            candidates.push({ r: nr, c: nc });
          }
        }
      }
    }

    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      // Move the jar in the grid
      (grid[jar.row] as any)[jar.col] = null;
      grid[target.r][target.c] = { symbol: JAR_WILD, id: grid[jar.row]?.[jar.col]?.id ?? jar.id } as any;
      jar.row = target.r;
      jar.col = target.c;
    }
  }
}
