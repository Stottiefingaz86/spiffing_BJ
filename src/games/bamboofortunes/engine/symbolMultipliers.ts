import { ALL_SYMBOLS, type BambooSymbol } from './symbols';

export interface SymbolMultiplier {
  symbol: BambooSymbol;
  multiplier: number;
}

const MULTIPLIER_WEIGHTS: [number, number][] = [
  [2, 40],
  [3, 25],
  [5, 18],
  [10, 12],
  [50, 5],
];

const TOTAL_MULT_WEIGHT = MULTIPLIER_WEIGHTS.reduce((s, [, w]) => s + w, 0);

function randomMultiplier(): number {
  let r = Math.random() * TOTAL_MULT_WEIGHT;
  for (const [val, w] of MULTIPLIER_WEIGHTS) {
    r -= w;
    if (r <= 0) return val;
  }
  return 2;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rollSymbolMultipliers(inFreeSpins: boolean): SymbolMultiplier[] {
  const count = inFreeSpins ? 3 : (1 + Math.floor(Math.random() * 3));
  const picked = shuffle(ALL_SYMBOLS).slice(0, count);
  return picked.map((symbol) => ({ symbol, multiplier: randomMultiplier() }));
}

export function getSymbolMultiplier(
  multipliers: SymbolMultiplier[],
  symbol: BambooSymbol,
): number {
  const m = multipliers.find((e) => e.symbol === symbol);
  return m ? m.multiplier : 1;
}
