import {
  getParLinePayout,
  isQuestParMathEnabled,
  parRandomStripSymbol,
} from '../math/parMath';

export const REELS = 5;
export const ROWS = 3;

/** Wild may only be placed on middle three reels (0-based cols 1–3). */
export const WILD_MIN_COL = 1;
export const WILD_MAX_COL = 3;

export enum TempleSymbol {
  Wild = 'wild',
  Scatter = 'scatter',
  /** Silver / blue mask — top pay */
  MaskSilver = 'maskSilver',
  MaskGreen = 'maskGreen',
  MaskGold = 'maskGold',
  MaskPurple = 'maskPurple',
  CreatureTan = 'creatureTan',
  BirdRed = 'birdRed',
  BirdBlue = 'birdBlue',
}

export const PAYING_SYMBOLS: TempleSymbol[] = [
  TempleSymbol.MaskSilver,
  TempleSymbol.MaskGreen,
  TempleSymbol.MaskGold,
  TempleSymbol.MaskPurple,
  TempleSymbol.CreatureTan,
  TempleSymbol.BirdRed,
  TempleSymbol.BirdBlue,
];

export const SYMBOL_COLORS: Record<TempleSymbol, number> = {
  [TempleSymbol.Wild]: 0xc9a227,
  [TempleSymbol.Scatter]: 0xffd54a,
  [TempleSymbol.MaskSilver]: 0x9aa8b8,
  [TempleSymbol.MaskGreen]: 0x6bbf7a,
  [TempleSymbol.MaskGold]: 0xd4a64a,
  [TempleSymbol.MaskPurple]: 0xb565d8,
  [TempleSymbol.CreatureTan]: 0xc4956a,
  [TempleSymbol.BirdRed]: 0xe07050,
  [TempleSymbol.BirdBlue]: 0x7eb8d8,
};

/** Short labels on placeholder tiles */
export const SYMBOL_LABELS: Record<TempleSymbol, string> = {
  [TempleSymbol.Wild]: '?',
  [TempleSymbol.Scatter]: '★',
  [TempleSymbol.MaskSilver]: 'Sv',
  [TempleSymbol.MaskGreen]: 'Gn',
  [TempleSymbol.MaskGold]: 'Gd',
  [TempleSymbol.MaskPurple]: 'Pu',
  [TempleSymbol.CreatureTan]: 'Sn',
  [TempleSymbol.BirdRed]: 'R',
  [TempleSymbol.BirdBlue]: 'B',
};

export interface PaytableEntry {
  three: number;
  four: number;
  five: number;
}

/** Coin payouts per line (× line bet / coin unit), Gonzo-style scale. */
export const PAYTABLE: Partial<Record<TempleSymbol, PaytableEntry>> = {
  [TempleSymbol.Wild]: { three: 125, four: 625, five: 6250 },
  [TempleSymbol.MaskSilver]: { three: 125, four: 625, five: 6250 },
  [TempleSymbol.MaskGreen]: { three: 50, four: 250, five: 2500 },
  [TempleSymbol.MaskGold]: { three: 38, four: 125, five: 1250 },
  [TempleSymbol.MaskPurple]: { three: 25, four: 62, five: 500 },
  [TempleSymbol.CreatureTan]: { three: 12, four: 50, five: 250 },
  [TempleSymbol.BirdRed]: { three: 10, four: 38, five: 188 },
  [TempleSymbol.BirdBlue]: { three: 8, four: 25, five: 125 },
};

export function getLinePayout(symbol: TempleSymbol, count: number): number {
  if (isQuestParMathEnabled()) return getParLinePayout(symbol, count);
  if (count < 3) return 0;
  const entry = PAYTABLE[symbol];
  if (!entry) return 0;
  if (count === 3) return entry.three;
  if (count === 4) return entry.four;
  return entry.five;
}

export function isWild(sym: TempleSymbol): boolean {
  return sym === TempleSymbol.Wild;
}

export function isScatter(sym: TempleSymbol): boolean {
  return sym === TempleSymbol.Scatter;
}

const PAY_WEIGHTS: { sym: TempleSymbol; w: number }[] = [
  { sym: TempleSymbol.BirdBlue, w: 22 },
  { sym: TempleSymbol.BirdRed, w: 20 },
  { sym: TempleSymbol.CreatureTan, w: 18 },
  { sym: TempleSymbol.MaskPurple, w: 14 },
  { sym: TempleSymbol.MaskGold, w: 10 },
  { sym: TempleSymbol.MaskGreen, w: 8 },
  { sym: TempleSymbol.MaskSilver, w: 5 },
];

function randomPaying(): TempleSymbol {
  const t = PAY_WEIGHTS.reduce((s, x) => s + x.w, 0) * Math.random();
  let c = 0;
  for (const { sym, w } of PAY_WEIGHTS) {
    c += w;
    if (t < c) return sym;
  }
  return TempleSymbol.BirdBlue;
}

/** New symbol for column `col` (wild only on middle reels). */
export function randomSymbolForColumn(col: number): TempleSymbol {
  if (isQuestParMathEnabled()) return parRandomStripSymbol(col);
  const r = Math.random();
  if (col >= WILD_MIN_COL && col <= WILD_MAX_COL && r < 0.055) {
    return TempleSymbol.Wild;
  }
  if (r < 0.06) return TempleSymbol.Scatter;
  return randomPaying();
}
