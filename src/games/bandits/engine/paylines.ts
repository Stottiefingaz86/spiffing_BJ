import { REELS, ROWS, type BanditSymbol, isWild, isScatter, getLinePayout } from './symbols';

export const PAYLINE_PATTERNS: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 2, 2, 1],
  [2, 1, 0, 0, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
];

export interface PaylineWin {
  lineIndex: number;
  symbol: BanditSymbol;
  count: number;
  payout: number;
  positions: { reel: number; row: number }[];
}

export type ReelGrid = BanditSymbol[][];

export function evaluatePaylines(grid: ReelGrid, bet: number): PaylineWin[] {
  const wins: PaylineWin[] = [];
  const coinValue = bet / 25;

  for (let li = 0; li < PAYLINE_PATTERNS.length; li++) {
    const line = PAYLINE_PATTERNS[li];
    const symbols: BanditSymbol[] = [];
    for (let r = 0; r < REELS; r++) {
      symbols.push(grid[r][line[r]]);
    }

    const first = symbols[0];
    if (isScatter(first)) continue;

    let matchSym: BanditSymbol | null = null;
    for (const s of symbols) {
      if (!isWild(s) && !isScatter(s)) {
        matchSym = s;
        break;
      }
      if (isWild(s) && matchSym === null) matchSym = s;
    }
    if (!matchSym) continue;

    let count = 0;
    for (let r = 0; r < REELS; r++) {
      const s = symbols[r];
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
    for (let r = 0; r < count; r++) {
      positions.push({ reel: r, row: line[r] });
    }

    wins.push({ lineIndex: li, symbol: matchSym, count, payout, positions });
  }

  return wins;
}

export function countScatters(grid: ReelGrid): number {
  let count = 0;
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (isScatter(grid[r][row])) count++;
    }
  }
  return count;
}

export function getScatterPositions(grid: ReelGrid): { reel: number; row: number }[] {
  const positions: { reel: number; row: number }[] = [];
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (isScatter(grid[r][row])) {
        positions.push({ reel: r, row });
      }
    }
  }
  return positions;
}
