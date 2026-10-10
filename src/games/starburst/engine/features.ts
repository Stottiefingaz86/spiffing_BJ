/**
 * Feature Generator features and Mega / Galaxy Star effects.
 * Every function mutates the grid in place and returns a snapshot of what changed.
 */

import {
  GalaxySymbol,
  SCATTER,
  SYMBOL_TIER,
  WILD,
  randomPaying,
} from './symbols';
import { cloneGrid, makeCell, type Grid } from './grid';

export enum FeatureType {
  Destroy = 'destroy',
  RandomWilds = 'randomWilds',
  ExpandingWilds = 'expandingWilds',
  LineTransform = 'lineTransform',
  Upgrade = 'upgrade',
  MegaStar = 'megaStar',
  GalaxyStar = 'galaxyStar',
}

/** The 5 Feature Generator features (in spec order). */
export const FEATURE_GEN_POOL: FeatureType[] = [
  FeatureType.Destroy,
  FeatureType.RandomWilds,
  FeatureType.ExpandingWilds,
  FeatureType.LineTransform,
  FeatureType.Upgrade,
];

export function randomGeneratorFeature(): FeatureType {
  return FEATURE_GEN_POOL[Math.floor(Math.random() * FEATURE_GEN_POOL.length)];
}

export interface FeatureApplication {
  type: FeatureType;
  gridBefore: Grid;
  gridAfter: Grid;
  changedCellIds: number[];
  newWildIds: number[];
}

function collectChangedIds(before: Grid, after: Grid): number[] {
  const ids: number[] = [];
  for (let r = 0; r < after.length; r++) {
    for (let c = 0; c < after[r].length; c++) {
      if (before[r]?.[c]?.id !== after[r]?.[c]?.id) ids.push(after[r][c].id);
    }
  }
  return ids;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** DESTROY — remove all cells of 1–2 random symbol types, refill with fresh paying symbols. */
export function applyDestroy(grid: Grid): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const present = new Set<GalaxySymbol>();
  for (const row of grid) for (const cell of row) {
    if (cell.symbol !== WILD && cell.symbol !== SCATTER) present.add(cell.symbol as GalaxySymbol);
  }
  const types = Array.from(present);
  if (types.length === 0) return { type: FeatureType.Destroy, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: [] };
  shuffle(types);
  const removeCount = Math.min(types.length, 1 + Math.floor(Math.random() * 2));
  const targets = new Set(types.slice(0, removeCount));
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (targets.has(grid[r][c].symbol as GalaxySymbol)) {
        grid[r][c] = makeCell(randomPaying());
      }
    }
  }
  const gridAfter = cloneGrid(grid);
  return { type: FeatureType.Destroy, gridBefore, gridAfter, changedCellIds: collectChangedIds(gridBefore, gridAfter), newWildIds: [] };
}

/** RANDOM WILDS — replace 3–9 random paying cells with Wilds. */
export function applyRandomWilds(grid: Grid): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const candidates: { r: number; c: number }[] = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c].symbol !== WILD && grid[r][c].symbol !== SCATTER) candidates.push({ r, c });
  shuffle(candidates);
  const count = Math.min(candidates.length, 3 + Math.floor(Math.random() * 7));
  const newIds: number[] = [];
  for (let i = 0; i < count; i++) {
    const { r, c } = candidates[i];
    grid[r][c] = makeCell(WILD);
    newIds.push(grid[r][c].id);
  }
  return { type: FeatureType.RandomWilds, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: newIds };
}

/** EXPANDING WILDS — each existing Wild becomes a stack of 3 Wilds vertically. */
export function applyExpandingWilds(grid: Grid): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const newIds: number[] = [];
  const rows = grid.length;
  const wildSeeds: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c].symbol === WILD) wildSeeds.push({ r, c });
  for (const { r, c } of wildSeeds) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dr === 0) continue;
      const nr = r + dr;
      if (nr < 0 || nr >= rows) continue;
      if (grid[nr][c].symbol === WILD || grid[nr][c].symbol === SCATTER) continue;
      grid[nr][c] = makeCell(WILD);
      newIds.push(grid[nr][c].id);
    }
  }
  return { type: FeatureType.ExpandingWilds, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: newIds };
}

/** LINE TRANSFORM — fill a random row or column with a single paying symbol (skipping scatters). */
export function applyLineTransform(grid: Grid): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const orientation: 'row' | 'col' = Math.random() < 0.5 ? 'row' : 'col';
  const sym = randomPaying();
  const changedIds: number[] = [];
  if (orientation === 'row') {
    const r = Math.floor(Math.random() * rows);
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].symbol === SCATTER) continue;
      grid[r][c] = makeCell(sym);
      changedIds.push(grid[r][c].id);
    }
  } else {
    const c = Math.floor(Math.random() * cols);
    for (let r = 0; r < rows; r++) {
      if (grid[r][c].symbol === SCATTER) continue;
      grid[r][c] = makeCell(sym);
      changedIds.push(grid[r][c].id);
    }
  }
  return { type: FeatureType.LineTransform, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: changedIds, newWildIds: [] };
}

/** UPGRADE — pick one symbol type and upgrade ALL of its instances to the next-higher tier. */
export function applyUpgrade(grid: Grid): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const tierIndex = new Map<GalaxySymbol, number>();
  SYMBOL_TIER.forEach((s, i) => tierIndex.set(s, i));
  const counts = new Map<GalaxySymbol, number>();
  for (const row of grid) for (const cell of row) {
    if (cell.symbol !== WILD && cell.symbol !== SCATTER) {
      const s = cell.symbol as GalaxySymbol;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  const upgradable = Array.from(counts.keys()).filter((s) => (tierIndex.get(s) ?? 0) > 0);
  if (upgradable.length === 0) return { type: FeatureType.Upgrade, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: [] };
  const fromSym = upgradable[Math.floor(Math.random() * upgradable.length)];
  const toSym = SYMBOL_TIER[(tierIndex.get(fromSym) ?? 1) - 1];
  const changedIds: number[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c].symbol === fromSym) {
        grid[r][c] = makeCell(toSym);
        changedIds.push(grid[r][c].id);
      }
    }
  }
  return { type: FeatureType.Upgrade, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: changedIds, newWildIds: [] };
}

/** MEGA STAR — place a 2×2 Wild block at a random valid location (no Scatter inside). */
export function applyMegaStar(grid: Grid): FeatureApplication {
  return placeWildBlock(grid, 2, FeatureType.MegaStar);
}

/** GALAXY STAR — place a 3×3 Wild block at a random valid location. */
export function applyGalaxyStar(grid: Grid): FeatureApplication {
  return placeWildBlock(grid, 3, FeatureType.GalaxyStar);
}

function placeWildBlock(grid: Grid, size: 2 | 3, type: FeatureType): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const blockId = Math.floor(Math.random() * 1_000_000);
  const candidates: { r: number; c: number }[] = [];
  for (let r = 0; r <= rows - size; r++) {
    for (let c = 0; c <= cols - size; c++) {
      let ok = true;
      for (let dr = 0; dr < size && ok; dr++) {
        for (let dc = 0; dc < size && ok; dc++) {
          if (grid[r + dr][c + dc]?.symbol === SCATTER) ok = false;
        }
      }
      if (ok) candidates.push({ r, c });
    }
  }
  if (candidates.length === 0) return { type, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: [] };
  const { r, c } = candidates[Math.floor(Math.random() * candidates.length)];
  const newIds: number[] = [];
  for (let dr = 0; dr < size; dr++) {
    for (let dc = 0; dc < size; dc++) {
      grid[r + dr][c + dc] = makeCell(WILD, { wildBlock: { id: blockId, size } });
      newIds.push(grid[r + dr][c + dc].id);
    }
  }
  return { type, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: newIds };
}

/** After Mega Star's own avalanche, add 2–5 extra random wilds. */
export function applyMegaStarExtraWilds(grid: Grid): FeatureApplication {
  return addRandomWilds(grid, 2, 5, FeatureType.MegaStar);
}

/** After Galaxy Star's own avalanche, add 4–8 extra random wilds. */
export function applyGalaxyStarExtraWilds(grid: Grid): FeatureApplication {
  return addRandomWilds(grid, 4, 8, FeatureType.GalaxyStar);
}

function addRandomWilds(grid: Grid, min: number, max: number, type: FeatureType): FeatureApplication {
  const gridBefore = cloneGrid(grid);
  const candidates: { r: number; c: number }[] = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c].symbol !== WILD && grid[r][c].symbol !== SCATTER) candidates.push({ r, c });
  shuffle(candidates);
  const count = Math.min(candidates.length, min + Math.floor(Math.random() * (max - min + 1)));
  const newIds: number[] = [];
  for (let i = 0; i < count; i++) {
    const { r, c } = candidates[i];
    grid[r][c] = makeCell(WILD);
    newIds.push(grid[r][c].id);
  }
  return { type, gridBefore, gridAfter: cloneGrid(grid), changedCellIds: [], newWildIds: newIds };
}

export function applyFeature(type: FeatureType, grid: Grid): FeatureApplication {
  switch (type) {
    case FeatureType.Destroy: return applyDestroy(grid);
    case FeatureType.RandomWilds: return applyRandomWilds(grid);
    case FeatureType.ExpandingWilds: return applyExpandingWilds(grid);
    case FeatureType.LineTransform: return applyLineTransform(grid);
    case FeatureType.Upgrade: return applyUpgrade(grid);
    case FeatureType.MegaStar: return applyMegaStar(grid);
    case FeatureType.GalaxyStar: return applyGalaxyStar(grid);
  }
}

/** Human-readable feature label for UI. */
export const FEATURE_LABELS: Record<FeatureType, string> = {
  [FeatureType.Destroy]:        'DESTROY',
  [FeatureType.RandomWilds]:    'RANDOM WILDS',
  [FeatureType.ExpandingWilds]: 'EXPANDING WILDS',
  [FeatureType.LineTransform]:  'LINE TRANSFORM',
  [FeatureType.Upgrade]:        'UPGRADE',
  [FeatureType.MegaStar]:       'MEGA STAR',
  [FeatureType.GalaxyStar]:     'GALAXY STAR',
};

export const FEATURE_COLORS: Record<FeatureType, number> = {
  [FeatureType.Destroy]:        0x4fc3ff,
  [FeatureType.RandomWilds]:    0xffcf4d,
  [FeatureType.ExpandingWilds]: 0xff6fa3,
  [FeatureType.LineTransform]:  0x4fffc2,
  [FeatureType.Upgrade]:        0xb05bff,
  [FeatureType.MegaStar]:       0x4c8dff,
  [FeatureType.GalaxyStar]:     0xff3bdc,
};
