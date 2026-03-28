import { REELS, ROWS, BanditSymbol } from './symbols';
import type { ReelGrid } from './paylines';

export enum WildFeatureType {
  Lasso = 'lasso',
  DynamiteBlast = 'dynamiteBlast',
  ShotgunSpray = 'shotgunSpray',
}

export interface WildFeatureResult {
  type: WildFeatureType;
  positions: { reel: number; row: number }[];
  targetReel?: number;
  targetRow?: number;
}

const WILD_FEATURE_CHANCE = 0.12;

export function shouldTriggerWildFeature(): boolean {
  return Math.random() < WILD_FEATURE_CHANCE;
}

export function pickWildFeature(): WildFeatureType {
  const roll = Math.random();
  if (roll < 0.33) return WildFeatureType.Lasso;
  if (roll < 0.66) return WildFeatureType.DynamiteBlast;
  return WildFeatureType.ShotgunSpray;
}

/** Lasso: wraps an entire reel with Wilds. */
function applyLasso(grid: ReelGrid): WildFeatureResult {
  const reel = Math.floor(Math.random() * REELS);
  const positions: { reel: number; row: number }[] = [];
  for (let row = 0; row < ROWS; row++) {
    grid[reel][row] = BanditSymbol.Wild;
    positions.push({ reel, row });
  }
  return { type: WildFeatureType.Lasso, positions, targetReel: reel };
}

/** Dynamite Blast: 2x2 block of wilds. */
function applyDynamiteBlast(grid: ReelGrid): WildFeatureResult {
  const maxReel = REELS - 2;
  const maxRow = ROWS - 2;
  const reel = Math.floor(Math.random() * (maxReel + 1));
  const row = Math.floor(Math.random() * (maxRow + 1));
  const positions: { reel: number; row: number }[] = [];

  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      grid[reel + dr][row + dc] = BanditSymbol.Wild;
      positions.push({ reel: reel + dr, row: row + dc });
    }
  }
  return { type: WildFeatureType.DynamiteBlast, positions, targetReel: reel, targetRow: row };
}

/** Shotgun Spray: 2-5 random wilds. */
function applyShotgunSpray(grid: ReelGrid): WildFeatureResult {
  const count = 2 + Math.floor(Math.random() * 4);
  const allPositions: { reel: number; row: number }[] = [];
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      allPositions.push({ reel: r, row });
    }
  }

  for (let i = allPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
  }

  const chosen = allPositions.slice(0, count);
  for (const pos of chosen) {
    grid[pos.reel][pos.row] = BanditSymbol.Wild;
  }

  return { type: WildFeatureType.ShotgunSpray, positions: chosen };
}

export function applyWildFeature(grid: ReelGrid, featureType: WildFeatureType): WildFeatureResult {
  switch (featureType) {
    case WildFeatureType.Lasso: return applyLasso(grid);
    case WildFeatureType.DynamiteBlast: return applyDynamiteBlast(grid);
    case WildFeatureType.ShotgunSpray: return applyShotgunSpray(grid);
  }
}
