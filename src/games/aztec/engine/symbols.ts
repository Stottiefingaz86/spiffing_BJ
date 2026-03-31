import {
  getParLinePayout,
  isAztecParMathEnabled,
  parRandomStripSymbol,
} from '../math/aztecParMath';

export const REELS = 5;
export const ROWS = 3;

/**
 * Wild can land on any reel. (Middle-reels-only was used when a separate free-fall/scatter existed on outer reels;
 * PAR strips have no scatter, so wilds must be able to hit reel 1 for “3+ from the left” free falls.)
 */
export const WILD_MIN_COL = 0;
export const WILD_MAX_COL = 4;

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
  [TempleSymbol.Scatter]: 0x4ade80,
  [TempleSymbol.MaskSilver]: 0x7dd3fc,
  [TempleSymbol.MaskGreen]: 0x34d399,
  [TempleSymbol.MaskGold]: 0xf59e0b,
  [TempleSymbol.MaskPurple]: 0xa78bfa,
  [TempleSymbol.CreatureTan]: 0xd4a574,
  [TempleSymbol.BirdRed]: 0xea580c,
  [TempleSymbol.BirdBlue]: 0x38bdf8,
};

/** Short labels on placeholder tiles */
export const SYMBOL_LABELS: Record<TempleSymbol, string> = {
  [TempleSymbol.Wild]: '?',
  [TempleSymbol.Scatter]: '★',
  [TempleSymbol.MaskSilver]: 'M',
  [TempleSymbol.MaskGreen]: 'S',
  [TempleSymbol.MaskGold]: '☀',
  [TempleSymbol.MaskPurple]: 'E',
  [TempleSymbol.CreatureTan]: '◎',
  [TempleSymbol.BirdRed]: 'J',
  [TempleSymbol.BirdBlue]: '◇',
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
  if (isAztecParMathEnabled()) return getParLinePayout(symbol, count);
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

/** New symbol for column `col` (wild only on middle reels). No scatter — not on PAR strips. */
export function randomSymbolForColumn(col: number): TempleSymbol {
  const r = Math.random();
  if (col >= WILD_MIN_COL && col <= WILD_MAX_COL && r < 0.055) {
    return TempleSymbol.Wild;
  }
  if (isAztecParMathEnabled()) return parRandomStripSymbol(col);
  return randomPaying();
}
