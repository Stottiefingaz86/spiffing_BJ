import { GRID_COLS, GRID_ROWS, JAR_WILD, randomFruit } from './symbols';
import { detectClusters, makeCell, type Cluster, type Grid } from './grid';
import { processJarWins, moveJars, type JarState, type JarMove } from './jarWild';
import { getPayoutMultiplier } from './symbols';

export interface CascadeStep {
  clusters: Cluster[];
  payoutMultiplier: number;
  /** Grid state before any removal — the grid with winning clusters still visible. */
  gridBefore: Grid;
  gridAfterRemoval: Grid;
  /** Grid state after gravity + new symbols (fully settled). */
  gridAfterFill: Grid;
  /** Jar states after multiplier bump but BEFORE removal — for display during highlight. */
  jarStatesBefore: JarState[];
  /** Jar states after removal + gravity — surviving jars. */
  jarStates: JarState[];
  /** Jar movements that occurred this step (for animation). */
  jarMoves: JarMove[];
}

/** Remove all cluster cells from the grid, including jars that participated. */
function removeClusterCells(grid: Grid, clusters: Cluster[]): void {
  for (const cluster of clusters) {
    for (const { row, col } of cluster.cells) {
      (grid[row] as any)[col] = null;
    }
  }
}

/** Apply gravity: symbols fall down to fill nulls. Returns count of cells that moved. */
function applyGravity(grid: Grid): void {
  for (let c = 0; c < GRID_COLS; c++) {
    let writeRow = GRID_ROWS - 1;
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      if (grid[r][c] !== null) {
        if (r !== writeRow) {
          grid[writeRow][c] = grid[r][c];
          (grid[r] as any)[c] = null;
        }
        writeRow--;
      }
    }
  }
}

/** Fill null cells at the top with new random symbols. */
function fillEmpty(grid: Grid): void {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] === null) {
        grid[r][c] = makeCell(randomFruit());
      }
    }
  }
}

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : cell)));
}

const MAX_CASCADE_DEPTH = 12;

/**
 * Run the full cascade loop on a grid. Returns all cascade steps.
 * The grid is mutated in place.
 */
export function runCascadeLoop(grid: Grid, jarStates: JarState[]): CascadeStep[] {
  const steps: CascadeStep[] = [];

  while (steps.length < MAX_CASCADE_DEPTH) {
    const clusters = detectClusters(grid);
    if (clusters.length === 0) break;

    processJarWins(grid, clusters, jarStates);

    const jarStatesBefore = jarStates.map((j) => ({ ...j }));

    let stepPayout = 0;
    for (const cluster of clusters) {
      const baseMult = getPayoutMultiplier(cluster.fruit, cluster.cells.length);
      const jarMult = getJarMultiplier(grid, cluster, jarStates);
      stepPayout += baseMult * jarMult;
    }

    const gridBefore = cloneGrid(grid);

    removeClusterCells(grid, clusters);

    // Re-place destroyed jars — they always stick through cascades
    for (const jar of jarStates) {
      if (!grid[jar.row]?.[jar.col]) {
        grid[jar.row][jar.col] = makeCell(JAR_WILD);
      }
    }

    // Move jars to random adjacent positions after each win
    const jarMoveData = moveJars(grid, jarStates);

    const gridAfterRemoval = cloneGrid(grid);

    // Map cell IDs to jar states before gravity shifts positions
    const cellIdToJar = new Map<number, JarState>();
    for (const jar of jarStates) {
      const cell = grid[jar.row]?.[jar.col];
      if (cell && cell.symbol === JAR_WILD) {
        cellIdToJar.set(cell.id, jar);
      }
    }

    applyGravity(grid);

    // Re-sync jar positions after gravity
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = grid[r]?.[c];
        if (cell && cell.symbol === JAR_WILD) {
          const jar = cellIdToJar.get(cell.id);
          if (jar) {
            jar.row = r;
            jar.col = c;
          }
        }
      }
    }

    fillEmpty(grid);

    const gridAfterFill = cloneGrid(grid);

    steps.push({
      clusters,
      payoutMultiplier: stepPayout,
      gridBefore,
      gridAfterRemoval,
      gridAfterFill,
      jarStatesBefore,
      jarStates: jarStates.map((j) => ({ ...j })),
      jarMoves: jarMoveData,
    });
  }

  return steps;
}

/** Get the combined jar multiplier for a cluster. */
function getJarMultiplier(grid: Grid, cluster: Cluster, jarStates: JarState[]): number {
  let mult = 1;
  for (const { row, col } of cluster.cells) {
    if (grid[row][col]?.symbol === 'jar') {
      const jar = jarStates.find((j) => j.row === row && j.col === col);
      if (jar) mult *= jar.multiplier;
    }
  }
  return mult;
}
