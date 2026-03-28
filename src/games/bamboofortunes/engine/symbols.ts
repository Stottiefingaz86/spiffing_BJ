export const GRID_COLS = 7;
export const GRID_ROWS = 7;

export enum BambooSymbol {
  Panda = 'panda',
  Dragon = 'dragon',
  Gong = 'gong',
  Bonsai = 'bonsai',
  Club = 'club',
  Heart = 'heart',
  Spade = 'spade',
}

export const WILD = 'wild' as const;
export const SCATTER = 'scatter' as const;
export type CellSymbol = BambooSymbol | typeof WILD | typeof SCATTER;

/** Paying symbols (7) — panda, dragon, gong, bonsai, club, heart, spade. Wild + scatter are extra. */
export const ALL_SYMBOLS: BambooSymbol[] = [
  BambooSymbol.Panda,
  BambooSymbol.Dragon,
  BambooSymbol.Gong,
  BambooSymbol.Bonsai,
  BambooSymbol.Club,
  BambooSymbol.Heart,
  BambooSymbol.Spade,
];

export const SYMBOL_COLORS: Record<CellSymbol, number> = {
  [BambooSymbol.Panda]:  0xffd700,
  [BambooSymbol.Dragon]: 0xff2222,
  [BambooSymbol.Gong]:   0xc9a227,
  [BambooSymbol.Bonsai]: 0x3d8c4a,
  [BambooSymbol.Club]:   0x2288dd,
  [BambooSymbol.Heart]:  0xdd2244,
  [BambooSymbol.Spade]:  0x9944cc,
  [WILD]:    0xffcc00,
  [SCATTER]: 0xcc4400,
};

export const SYMBOL_LABELS: Record<CellSymbol, string> = {
  [BambooSymbol.Panda]:  'PA',
  [BambooSymbol.Dragon]: 'DR',
  [BambooSymbol.Gong]:   'GO',
  [BambooSymbol.Bonsai]: 'BN',
  [BambooSymbol.Club]:   '♣',
  [BambooSymbol.Heart]:  '♥',
  [BambooSymbol.Spade]:  '♠',
  [WILD]:    'W',
  [SCATTER]: 'SC',
};

const PAYTABLE_TIERS: { min: number; max: number }[] = [
  { min: 5, max: 5 },
  { min: 6, max: 6 },
  { min: 7, max: 7 },
  { min: 8, max: 8 },
  { min: 9, max: 9 },
  { min: 10, max: 10 },
  { min: 11, max: 11 },
  { min: 12, max: 12 },
  { min: 13, max: 13 },
  { min: 14, max: 14 },
  { min: 15, max: Infinity },
];

const PAYOUT_BY_SYMBOL: Record<BambooSymbol | typeof SCATTER, number[]> = {
  [BambooSymbol.Panda]:  [1.0, 1.5, 1.75, 2.0, 2.5, 5.0, 7.5, 15.0, 35.0, 70.0, 150.0],
  [BambooSymbol.Dragon]: [0.75, 1.0, 1.25, 1.5, 2.0, 4.0, 6.0, 12.5, 30.0, 60.0, 100.0],
  [BambooSymbol.Gong]:   [0.38, 0.48, 0.7, 0.95, 1.2, 2.85, 4.65, 9.25, 17.5, 35.0, 70.0],
  [BambooSymbol.Bonsai]: [0.35, 0.45, 0.65, 0.9, 1.15, 2.75, 4.75, 9.5, 18.0, 36.0, 72.0],
  [BambooSymbol.Club]:   [0.3, 0.4, 0.5, 0.75, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0, 60.0],
  [BambooSymbol.Heart]:  [0.25, 0.3, 0.4, 0.5, 0.75, 1.5, 3.0, 6.0, 10.0, 20.0, 40.0],
  [BambooSymbol.Spade]:  [0.2, 0.25, 0.3, 0.4, 0.5, 1.0, 2.0, 4.0, 6.0, 10.0, 20.0],
  [SCATTER]:             [0.5, 0.75, 1.0, 1.25, 1.5, 3.0, 4.5, 10.0, 25.0, 50.0, 90.0],
};

export function getPayoutMultiplier(symbol: BambooSymbol | typeof SCATTER, clusterSize: number): number {
  if (clusterSize < 5) return 0;
  const tierIndex = PAYTABLE_TIERS.findIndex((t) => clusterSize >= t.min && clusterSize <= t.max);
  if (tierIndex === -1) return 0;
  return PAYOUT_BY_SYMBOL[symbol]?.[tierIndex] ?? 0;
}

const SYMBOL_WEIGHTS: [BambooSymbol, number][] = [
  [BambooSymbol.Panda, 9],
  [BambooSymbol.Dragon, 14],
  [BambooSymbol.Gong, 22],
  [BambooSymbol.Bonsai, 22],
  [BambooSymbol.Club, 17],
  [BambooSymbol.Heart, 17],
  [BambooSymbol.Spade, 18],
];

const TOTAL_WEIGHT = SYMBOL_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomFruit(): BambooSymbol {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [sym, w] of SYMBOL_WEIGHTS) {
    r -= w;
    if (r <= 0) return sym;
  }
  return BambooSymbol.Spade;
}

const WILD_SPAWN_CHANCE = 0.05;
const SCATTER_SPAWN_CHANCE = 0.04;

export function randomSymbol(): CellSymbol {
  const roll = Math.random();
  if (roll < SCATTER_SPAWN_CHANCE) return SCATTER;
  if (roll < SCATTER_SPAWN_CHANCE + WILD_SPAWN_CHANCE) return WILD;
  return randomFruit();
}

export const SCATTER_FREE_SPINS = 10;
export const SCATTER_TRIGGER = 12;
