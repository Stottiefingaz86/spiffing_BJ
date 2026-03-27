export const GRID_COLS = 8;
export const GRID_ROWS = 8;

export enum FruitSymbol {
  Pomegranate = 'pomegranate',
  Pineapple = 'pineapple',
  Watermelon = 'watermelon',
  Peach = 'peach',
  Grape = 'grape',
  Blueberry = 'blueberry',
}

export const JAR_WILD = 'jar' as const;
export const SCATTER = 'scatter' as const;
export type CellSymbol = FruitSymbol | typeof JAR_WILD | typeof SCATTER;

export const ALL_FRUITS: FruitSymbol[] = [
  FruitSymbol.Pomegranate,
  FruitSymbol.Pineapple,
  FruitSymbol.Watermelon,
  FruitSymbol.Peach,
  FruitSymbol.Grape,
  FruitSymbol.Blueberry,
];

export const SYMBOL_COLORS: Record<CellSymbol, number> = {
  [FruitSymbol.Pomegranate]: 0xff4444,
  [FruitSymbol.Pineapple]: 0xffee33,
  [FruitSymbol.Watermelon]: 0x88ff44,
  [FruitSymbol.Peach]: 0xff44aa,
  [FruitSymbol.Grape]: 0xcc55ff,
  [FruitSymbol.Blueberry]: 0x44aaff,
  [JAR_WILD]: 0xffee33,
  [SCATTER]: 0xffcc00,
};

export const SYMBOL_LABELS: Record<CellSymbol, string> = {
  [FruitSymbol.Pomegranate]: 'P',
  [FruitSymbol.Pineapple]: 'A',
  [FruitSymbol.Watermelon]: 'W',
  [FruitSymbol.Peach]: 'H',
  [FruitSymbol.Grape]: 'G',
  [FruitSymbol.Blueberry]: 'B',
  [JAR_WILD]: 'J',
  [SCATTER]: 'S',
};

/** Cluster-size tiers and payout multipliers (times total bet). */
const PAYTABLE_TIERS: { min: number; max: number }[] = [
  { min: 5, max: 5 },
  { min: 6, max: 6 },
  { min: 7, max: 7 },
  { min: 8, max: 8 },
  { min: 9, max: 9 },
  { min: 10, max: 11 },
  { min: 12, max: 14 },
  { min: 15, max: 16 },
  { min: 17, max: 19 },
  { min: 20, max: 21 },
  { min: 22, max: 24 },
  { min: 25, max: 31 },
  { min: 32, max: Infinity },
];

const PAYOUT_BY_FRUIT: Record<FruitSymbol, number[]> = {
  [FruitSymbol.Pomegranate]: [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 8.0, 15.0, 25.0, 50.0, 100.0, 1000.0],
  [FruitSymbol.Pineapple]:   [1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0, 12.0, 20.0, 40.0, 80.0, 600.0],
  [FruitSymbol.Watermelon]:  [0.2, 0.4, 0.5, 0.7, 1.0, 1.2, 2.0, 3.0, 6.0, 8.0, 16.0, 35.0, 200.0],
  [FruitSymbol.Peach]:       [0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.5, 2.5, 5.0, 7.0, 14.0, 30.0, 150.0],
  [FruitSymbol.Grape]:       [0.2, 0.2, 0.3, 0.4, 0.6, 0.8, 1.2, 2.0, 4.0, 6.0, 12.0, 25.0, 125.0],
  [FruitSymbol.Blueberry]:   [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.0, 1.5, 3.0, 5.0, 10.0, 20.0, 100.0],
};

/** Returns the payout multiplier (times bet) for a given fruit and cluster size. */
export function getPayoutMultiplier(fruit: FruitSymbol, clusterSize: number): number {
  if (clusterSize < 5) return 0;
  const tierIndex = PAYTABLE_TIERS.findIndex((t) => clusterSize >= t.min && clusterSize <= t.max);
  if (tierIndex === -1) return 0;
  return PAYOUT_BY_FRUIT[fruit][tierIndex];
}

/** Weighted random fruit selection. Lower-value fruits appear more often. */
const FRUIT_WEIGHTS: [FruitSymbol, number][] = [
  [FruitSymbol.Pomegranate, 12],
  [FruitSymbol.Pineapple, 14],
  [FruitSymbol.Watermelon, 16],
  [FruitSymbol.Peach, 17],
  [FruitSymbol.Grape, 18],
  [FruitSymbol.Blueberry, 19],
];

const TOTAL_WEIGHT = FRUIT_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomFruit(): FruitSymbol {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [fruit, w] of FRUIT_WEIGHTS) {
    r -= w;
    if (r <= 0) return fruit;
  }
  return FruitSymbol.Blueberry;
}

const JAR_SPAWN_CHANCE = 0.02;
const SCATTER_SPAWN_CHANCE = 0.007;

export function randomSymbol(): CellSymbol {
  const roll = Math.random();
  if (roll < SCATTER_SPAWN_CHANCE) return SCATTER;
  if (roll < SCATTER_SPAWN_CHANCE + JAR_SPAWN_CHANCE) return JAR_WILD;
  return randomFruit();
}
