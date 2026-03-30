import type { Grid } from '../engine/grid';
import type { NullableGrid } from '../engine/grid';
import { REELS, ROWS, SYMBOL_COLORS, type TempleSymbol } from '../engine/symbols';

/**
 * Build fall moves from post-removal holes to final filled grid (Hot Fiesta–style).
 */
export function buildFallMovesFromRemoval(
  gridAfterRemoval: NullableGrid,
  gridAfterFill: Grid,
): { cellId: number; fromRow: number; toRow: number; col: number }[] {
  const moves: { cellId: number; fromRow: number; toRow: number; col: number }[] = [];

  for (let c = 0; c < REELS; c++) {
    let newCellCount = 0;
    for (let r = 0; r < ROWS; r++) {
      const cell = gridAfterFill[r]?.[c];
      if (!cell) continue;
      let foundInOld = false;
      for (let or = 0; or < ROWS; or++) {
        const oc = gridAfterRemoval[or]?.[c];
        if (oc && oc.id === cell.id) {
          foundInOld = true;
          break;
        }
      }
      if (!foundInOld) newCellCount++;
    }

    let newIdx = 0;
    for (let r = 0; r < ROWS; r++) {
      const cell = gridAfterFill[r]?.[c];
      if (!cell) continue;
      const oldCell = gridAfterRemoval[r]?.[c];
      if (oldCell && oldCell.id === cell.id) continue;

      let fromRow = -1;
      for (let or = 0; or < ROWS; or++) {
        const oc = gridAfterRemoval[or]?.[c];
        if (oc && oc.id === cell.id) {
          fromRow = or;
          break;
        }
      }
      if (fromRow === -1) {
        fromRow = -(newCellCount - newIdx);
        newIdx++;
      }
      if (fromRow !== r) {
        moves.push({ cellId: cell.id, fromRow, toRow: r, col: c });
      }
    }
  }

  return moves;
}

export function particleColorForCells(grid: Grid, cellIds: Iterable<number>): number {
  let c = 0xffcc66;
  for (const id of cellIds) {
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < REELS; col++) {
        const cell = grid[r][col];
        if (cell.id === id) {
          c = SYMBOL_COLORS[cell.symbol as TempleSymbol] ?? c;
          return c;
        }
      }
    }
  }
  return c;
}
