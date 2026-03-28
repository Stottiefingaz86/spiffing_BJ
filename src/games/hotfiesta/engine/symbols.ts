export const GRID_COLS = 7;
export const GRID_ROWS = 7;

export enum FiestaSymbol {
  Sombrero = 'sombrero',
  Taco = 'taco',
  Bottle = 'bottle',
  Chili = 'chili',
  Drum = 'drum',
  Cactus = 'cactus',
  Maracas = 'maracas',
}

export const JAR_WILD = 'jar' as const;
export const SCATTER = 'scatter' as const;
export type CellSymbol = FiestaSymbol | typeof JAR_WILD | typeof SCATTER;

export const ALL_SYMBOLS: FiestaSymbol[] = [
  FiestaSymbol.Sombrero,
  FiestaSymbol.Taco,
  FiestaSymbol.Bottle,
  FiestaSymbol.Chili,
  FiestaSymbol.Drum,
  FiestaSymbol.Cactus,
  FiestaSymbol.Maracas,
];

export const SYMBOL_COLORS: Record<CellSymbol, number> = {
  [FiestaSymbol.Sombrero]: 0xffd700,
  [FiestaSymbol.Taco]:     0xff8c00,
  [FiestaSymbol.Bottle]:   0x40e0d0,
  [FiestaSymbol.Chili]:    0xff2222,
  [FiestaSymbol.Drum]:     0xff6633,
  [FiestaSymbol.Cactus]:   0x33cc33,
  [FiestaSymbol.Maracas]:  0x4499ff,
  [JAR_WILD]: 0xffee33,
  [SCATTER]:  0xddaaff,
};

export const SYMBOL_LABELS: Record<CellSymbol, string> = {
  [FiestaSymbol.Sombrero]: 'SO',
  [FiestaSymbol.Taco]:     'TA',
  [FiestaSymbol.Bottle]:   'BO',
  [FiestaSymbol.Chili]:    'CH',
  [FiestaSymbol.Drum]:     'DR',
  [FiestaSymbol.Cactus]:   'CA',
  [FiestaSymbol.Maracas]:  'MA',
  [JAR_WILD]: 'W',
  [SCATTER]:  'S',
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

const PAYOUT_BY_SYMBOL: Record<FiestaSymbol, number[]> = {
  [FiestaSymbol.Sombrero]: [1.0, 1.5, 1.75, 2.0, 2.5, 5.0, 7.5, 15.0, 35.0, 70.0, 150.0],
  [FiestaSymbol.Taco]:     [0.75, 1.0, 1.25, 1.5, 2.0, 4.0, 6.0, 12.5, 30.0, 60.0, 100.0],
  [FiestaSymbol.Bottle]:   [0.5, 0.75, 1.0, 1.25, 1.5, 3.0, 4.5, 10.0, 25.0, 50.0, 90.0],
  [FiestaSymbol.Chili]:    [0.4, 0.5, 0.75, 1.0, 1.25, 3.0, 5.0, 10.0, 20.0, 40.0, 80.0],
  [FiestaSymbol.Drum]:     [0.3, 0.4, 0.5, 0.75, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0, 60.0],
  [FiestaSymbol.Cactus]:   [0.25, 0.3, 0.4, 0.5, 0.75, 1.5, 3.0, 6.0, 10.0, 20.0, 40.0],
  [FiestaSymbol.Maracas]:  [0.2, 0.25, 0.3, 0.4, 0.5, 1.0, 2.0, 4.0, 6.0, 10.0, 20.0],
};

export function getPayoutMultiplier(symbol: FiestaSymbol, clusterSize: number): number {
  if (clusterSize < 5) return 0;
  const tierIndex = PAYTABLE_TIERS.findIndex((t) => clusterSize >= t.min && clusterSize <= t.max);
  if (tierIndex === -1) return 0;
  return PAYOUT_BY_SYMBOL[symbol][tierIndex];
}

const SYMBOL_WEIGHTS: [FiestaSymbol, number][] = [
  [FiestaSymbol.Sombrero, 10],
  [FiestaSymbol.Taco, 12],
  [FiestaSymbol.Bottle, 14],
  [FiestaSymbol.Chili, 15],
  [FiestaSymbol.Drum, 16],
  [FiestaSymbol.Cactus, 17],
  [FiestaSymbol.Maracas, 18],
];

const TOTAL_WEIGHT = SYMBOL_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomFruit(): FiestaSymbol {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [sym, w] of SYMBOL_WEIGHTS) {
    r -= w;
    if (r <= 0) return sym;
  }
  return FiestaSymbol.Maracas;
}

const JAR_SPAWN_CHANCE = 0.02;
const SCATTER_SPAWN_CHANCE = 0.007;

export function randomSymbol(): CellSymbol {
  const roll = Math.random();
  if (roll < SCATTER_SPAWN_CHANCE) return SCATTER;
  if (roll < SCATTER_SPAWN_CHANCE + JAR_SPAWN_CHANCE) return JAR_WILD;
  return randomFruit();
}

export const SCATTER_FREE_SPINS: Record<number, number> = {
  3: 10,
  4: 11,
  5: 12,
  6: 13,
  7: 14,
};
