import { REELS, ROWS, BanditSymbol, randomBaseSymbol, isScatter } from './symbols';
import type { ReelGrid } from './paylines';

const STRIP_LENGTH = 40;

function generateReelStrip(): BanditSymbol[] {
  const strip: BanditSymbol[] = [];
  for (let i = 0; i < STRIP_LENGTH; i++) {
    strip.push(randomBaseSymbol());
  }
  return strip;
}

let reelStrips: BanditSymbol[][] | null = null;

export function getReelStrips(): BanditSymbol[][] {
  if (!reelStrips) {
    reelStrips = [];
    for (let r = 0; r < REELS; r++) {
      reelStrips.push(generateReelStrip());
    }
  }
  return reelStrips;
}

export function regenerateStrips(): void {
  reelStrips = null;
}

export interface SpinResult {
  grid: ReelGrid;
  stopPositions: number[];
  strips: BanditSymbol[][];
}

export function generateSpin(): SpinResult {
  const strips = getReelStrips().map(() => generateReelStrip());
  reelStrips = strips;

  const grid: ReelGrid = [];
  const stopPositions: number[] = [];

  for (let r = 0; r < REELS; r++) {
    const stop = Math.floor(Math.random() * (strips[r].length - ROWS));
    stopPositions.push(stop);
    const reelSymbols: BanditSymbol[] = [];
    for (let row = 0; row < ROWS; row++) {
      reelSymbols.push(strips[r][(stop + row) % strips[r].length]);
    }
    grid.push(reelSymbols);
  }

  return { grid, stopPositions, strips };
}

export function generateFreeSpinResult(gambleMode: boolean): SpinResult {
  const result = generateSpin();

  if (gambleMode) {
    const thumbChance = 0.15;
    if (Math.random() < thumbChance) {
      const thumbRow = Math.floor(Math.random() * ROWS);
      result.grid[2][thumbRow] = Math.random() < 0.5
        ? BanditSymbol.ThumbsUp
        : BanditSymbol.ThumbsDown;
    }
  }

  return result;
}

export function getScatterReels(grid: ReelGrid): number[] {
  const reels: number[] = [];
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (isScatter(grid[r][row])) {
        reels.push(r);
        break;
      }
    }
  }
  return reels;
}
