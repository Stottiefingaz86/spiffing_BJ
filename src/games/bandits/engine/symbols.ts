export const REELS = 5;
export const ROWS = 3;

export enum BanditSymbol {
  Wild = 'wild',
  Scatter = 'scatter',
  Revolver = 'revolver',
  Shotgun = 'shotgun',
  Dynamite = 'dynamite',
  Boots = 'boots',
  Horseshoe = 'horseshoe',
  King = 'king',
  Queen = 'queen',
  Jack = 'jack',
  Ace = 'ace',
  ThumbsUp = 'thumbsUp',
  ThumbsDown = 'thumbsDown',
}

export const ALL_BASE_SYMBOLS: BanditSymbol[] = [
  BanditSymbol.Wild,
  BanditSymbol.Scatter,
  BanditSymbol.Revolver,
  BanditSymbol.Shotgun,
  BanditSymbol.Dynamite,
  BanditSymbol.Boots,
  BanditSymbol.Horseshoe,
  BanditSymbol.King,
  BanditSymbol.Queen,
  BanditSymbol.Jack,
  BanditSymbol.Ace,
];

export const SYMBOL_COLORS: Record<BanditSymbol, number> = {
  [BanditSymbol.Wild]: 0xffd700,
  [BanditSymbol.Scatter]: 0xff6633,
  [BanditSymbol.Revolver]: 0xcc3333,
  [BanditSymbol.Shotgun]: 0x8b6914,
  [BanditSymbol.Dynamite]: 0xe04020,
  [BanditSymbol.Boots]: 0x8b5e3c,
  [BanditSymbol.Horseshoe]: 0xc0a040,
  [BanditSymbol.King]: 0xdaa520,
  [BanditSymbol.Queen]: 0xcd5c5c,
  [BanditSymbol.Jack]: 0x6b8e9b,
  [BanditSymbol.Ace]: 0x9b7cb8,
  [BanditSymbol.ThumbsUp]: 0x4caf50,
  [BanditSymbol.ThumbsDown]: 0xf44336,
};

export const SYMBOL_LABELS: Record<BanditSymbol, string> = {
  [BanditSymbol.Wild]: '',
  [BanditSymbol.Scatter]: '',
  [BanditSymbol.Revolver]: '',
  [BanditSymbol.Shotgun]: '',
  [BanditSymbol.Dynamite]: '',
  [BanditSymbol.Boots]: '',
  [BanditSymbol.Horseshoe]: '',
  [BanditSymbol.King]: '',
  [BanditSymbol.Queen]: '',
  [BanditSymbol.Jack]: '',
  [BanditSymbol.Ace]: '',
  [BanditSymbol.ThumbsUp]: '👍',
  [BanditSymbol.ThumbsDown]: '👎',
};

export interface PaytableEntry {
  three: number;
  four: number;
  five: number;
}

export const PAYTABLE: Partial<Record<BanditSymbol, PaytableEntry>> = {
  [BanditSymbol.Wild]:      { three: 125, four: 1500, five: 5000 },
  [BanditSymbol.Revolver]:  { three: 125, four: 1500, five: 5000 },
  [BanditSymbol.Shotgun]:   { three: 75,  four: 1000, five: 2500 },
  [BanditSymbol.Dynamite]:  { three: 75,  four: 625,  five: 2000 },
  [BanditSymbol.Boots]:     { three: 75,  four: 500,  five: 1500 },
  [BanditSymbol.Horseshoe]: { three: 50,  four: 375,  five: 1250 },
  [BanditSymbol.King]:      { three: 50,  four: 125,  five: 500 },
  [BanditSymbol.Queen]:     { three: 25,  four: 75,   five: 375 },
  [BanditSymbol.Jack]:      { three: 25,  four: 75,   five: 250 },
  [BanditSymbol.Ace]:       { three: 25,  four: 50,   five: 125 },
};

export function getLinePayout(symbol: BanditSymbol, count: number): number {
  if (count < 3) return 0;
  const entry = PAYTABLE[symbol];
  if (!entry) return 0;
  if (count === 3) return entry.three;
  if (count === 4) return entry.four;
  return entry.five;
}

export function isWild(sym: BanditSymbol): boolean {
  return sym === BanditSymbol.Wild;
}

export function isScatter(sym: BanditSymbol): boolean {
  return sym === BanditSymbol.Scatter;
}

const BASE_REEL_WEIGHTS: [BanditSymbol, number][] = [
  [BanditSymbol.Wild, 2],
  [BanditSymbol.Scatter, 3],
  [BanditSymbol.Revolver, 6],
  [BanditSymbol.Shotgun, 8],
  [BanditSymbol.Dynamite, 9],
  [BanditSymbol.Boots, 10],
  [BanditSymbol.Horseshoe, 11],
  [BanditSymbol.King, 13],
  [BanditSymbol.Queen, 14],
  [BanditSymbol.Jack, 14],
  [BanditSymbol.Ace, 14],
];

const TOTAL_WEIGHT = BASE_REEL_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomBaseSymbol(): BanditSymbol {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [sym, w] of BASE_REEL_WEIGHTS) {
    r -= w;
    if (r <= 0) return sym;
  }
  return BanditSymbol.Ace;
}
