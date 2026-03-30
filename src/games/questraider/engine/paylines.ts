import { REELS, type TempleSymbol } from './symbols';
import type { Grid } from './grid';
import { getLinePayout, isScatter, isWild } from './symbols';

/**
 * 20 fixed lines — row index per reel (0 = top, 2 = bottom).
 * Matches standard 5×3 “Gonzo-style” line map.
 */
export const PAYLINE_PATTERNS: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 2, 2, 2, 1],
  [1, 0, 0, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 1, 2, 2, 2],
  [2, 1, 0, 0, 0],
  [1, 0, 2, 0, 1],
];

export interface PaylineWin {
  lineIndex: number;
  symbol: TempleSymbol;
  count: number;
  payout: number;
  /** `reel` = column (0 left); `row` = vertical position (0 top). */
  positions: { reel: number; row: number }[];
}

export function evaluatePaylines(grid: Grid, bet: number): PaylineWin[] {
  const wins: PaylineWin[] = [];
  const coinValue = bet / PAYLINE_PATTERNS.length;

  for (let li = 0; li < PAYLINE_PATTERNS.length; li++) {
    const line = PAYLINE_PATTERNS[li];
    const symbols: TempleSymbol[] = [];
    for (let reel = 0; reel < REELS; reel++) {
      const row = line[reel];
      symbols.push(grid[row][reel].symbol);
    }

    const first = symbols[0];
    if (isScatter(first)) continue;

    let matchSym: TempleSymbol | null = null;
    for (const s of symbols) {
      if (!isWild(s) && !isScatter(s)) {
        matchSym = s;
        break;
      }
      if (isWild(s) && matchSym === null) matchSym = s;
    }
    if (!matchSym) continue;

    let count = 0;
    for (let reel = 0; reel < REELS; reel++) {
      const s = symbols[reel];
      if (s === matchSym || isWild(s)) {
        count++;
      } else {
        break;
      }
    }

    if (count < 3) continue;

    const coinPayout = getLinePayout(matchSym, count);
    if (coinPayout <= 0) continue;

    const payout = Math.round(coinValue * coinPayout);
    const positions: { reel: number; row: number }[] = [];
    for (let reel = 0; reel < count; reel++) {
      positions.push({ reel, row: line[reel] });
    }

    wins.push({ lineIndex: li, symbol: matchSym, count, payout, positions });
  }

  return wins;
}

/** True if this symbol counts toward a Free Fall trigger on a line (scatter, or wild standing in for it). */
function countsAsFreeFallAlongLine(sym: TempleSymbol): boolean {
  return isScatter(sym) || isWild(sym);
}

/**
 * NetEnt Gonzo's Quest™ rules (Game Sheet v1.0): 3+ Free Fall symbols **in succession on a bet line,
 * starting from the leftmost reel**. Wild substitutes for Free Fall symbols on bet lines.
 * Each qualifying line awards 10 Free Falls (e.g. two lines → 20).
 */
export function countFreeFallTriggerLines(grid: Grid): number {
  let qualifyingLines = 0;
  for (let li = 0; li < PAYLINE_PATTERNS.length; li++) {
    const line = PAYLINE_PATTERNS[li];
    let consec = 0;
    for (let reel = 0; reel < REELS; reel++) {
      const row = line[reel];
      const sym = grid[row][reel].symbol;
      if (countsAsFreeFallAlongLine(sym)) consec++;
      else break;
    }
    if (consec >= 3) qualifyingLines++;
  }
  return qualifyingLines;
}

/** 10 Free Falls per qualifying bet line (PDF). */
export function freeFallsAwardedForLineTriggers(triggerLineCount: number): number {
  if (triggerLineCount <= 0) return 0;
  return 10 * triggerLineCount;
}

export function countScatters(grid: Grid): number {
  let n = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (isScatter(grid[r][c].symbol)) n++;
    }
  }
  return n;
}
