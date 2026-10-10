/**
 * Starburst Galaxy — 5×5 (expanding to 7×7) line-pay slot.
 * Wins are paid on 3+ adjacent same-symbol cells in a horizontal or vertical line.
 * Wild substitutes for any paying symbol. Scatter triggers Mega Star & carries multipliers.
 */

export const BASE_GRID_COLS = 5;
export const BASE_GRID_ROWS = 5;
export const EXPANDED_GRID_COLS = 7;
export const EXPANDED_GRID_ROWS = 7;

export enum GalaxySymbol {
  Bar = 'bar',
  Seven = 'seven',
  Diamond = 'diamond',
  Green = 'green',
  Orange = 'orange',
  Blue = 'blue',
  Purple = 'purple',
}

/** Tier order — index 0 = highest paying. Used by Upgrade feature. */
export const SYMBOL_TIER: GalaxySymbol[] = [
  GalaxySymbol.Bar,
  GalaxySymbol.Seven,
  GalaxySymbol.Diamond,
  GalaxySymbol.Green,
  GalaxySymbol.Orange,
  GalaxySymbol.Blue,
  GalaxySymbol.Purple,
];

export const WILD = 'wild' as const;
export const SCATTER = 'scatter' as const;
export type CellSymbol = GalaxySymbol | typeof WILD | typeof SCATTER;

export const ALL_SYMBOLS: GalaxySymbol[] = SYMBOL_TIER.slice();

/** Payout per run length [3, 4, 5, 6, 7]. Applied as multiplier × bet. */
const PAYTABLE: Record<GalaxySymbol, [number, number, number, number, number]> = {
  [GalaxySymbol.Bar]:     [0.20, 0.80, 4.00, 20.00, 50.00],
  [GalaxySymbol.Seven]:   [0.15, 0.60, 3.00,  6.00, 10.00],
  [GalaxySymbol.Diamond]: [0.15, 0.45, 2.00,  4.00,  8.00],
  [GalaxySymbol.Green]:   [0.10, 0.30, 1.00,  2.00,  6.00],
  [GalaxySymbol.Orange]:  [0.10, 0.20, 0.50,  1.00,  4.00],
  [GalaxySymbol.Blue]:    [0.05, 0.10, 0.40,  0.80,  2.00],
  [GalaxySymbol.Purple]:  [0.05, 0.10, 0.40,  0.80,  2.00],
};

export function getPayoutMultiplier(symbol: GalaxySymbol, runLength: number): number {
  if (runLength < 3) return 0;
  const clamped = Math.min(Math.max(runLength, 3), 7);
  return PAYTABLE[symbol][clamped - 3] ?? 0;
}

const SYMBOL_WEIGHTS: [GalaxySymbol, number][] = [
  [GalaxySymbol.Bar, 3],
  [GalaxySymbol.Seven, 6],
  [GalaxySymbol.Diamond, 9],
  [GalaxySymbol.Green, 12],
  [GalaxySymbol.Orange, 15],
  [GalaxySymbol.Blue, 18],
  [GalaxySymbol.Purple, 20],
];
const TOTAL_WEIGHT = SYMBOL_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomPaying(): GalaxySymbol {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [sym, w] of SYMBOL_WEIGHTS) {
    r -= w;
    if (r <= 0) return sym;
  }
  return GalaxySymbol.Purple;
}

const WILD_SPAWN_CHANCE = 0.01;
const SCATTER_SPAWN_CHANCE = 0.025;

export function randomSymbol(opts?: { scatterChance?: number; wildChance?: number }): CellSymbol {
  const scatterChance = opts?.scatterChance ?? SCATTER_SPAWN_CHANCE;
  const wildChance = opts?.wildChance ?? WILD_SPAWN_CHANCE;
  const roll = Math.random();
  if (roll < scatterChance) return SCATTER;
  if (roll < scatterChance + wildChance) return WILD;
  return randomPaying();
}

/** Scatter multiplier values (appear on some Scatters during Mega Star). */
export const SCATTER_MULTIPLIERS = [2, 3, 5, 10, 25] as const;
export type ScatterMultiplier = (typeof SCATTER_MULTIPLIERS)[number];

export function randomScatterMultiplier(): ScatterMultiplier {
  const weights: [ScatterMultiplier, number][] = [
    [2, 40], [3, 28], [5, 18], [10, 10], [25, 4],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [m, w] of weights) {
    r -= w;
    if (r <= 0) return m;
  }
  return 2;
}

/** Visual tint per symbol (used by procedural textures). */
export const SYMBOL_COLORS: Record<CellSymbol, number> = {
  [GalaxySymbol.Bar]:     0xffc94a,
  [GalaxySymbol.Seven]:   0xff3b4a,
  [GalaxySymbol.Diamond]: 0xffeb3b,
  [GalaxySymbol.Green]:   0x3dd26b,
  [GalaxySymbol.Orange]:  0xff6a28,
  [GalaxySymbol.Blue]:    0x2d8cff,
  [GalaxySymbol.Purple]:  0xa64aff,
  [WILD]:                 0xffffff,
  [SCATTER]:              0xff7ad6,
};

export const SYMBOL_LABELS: Record<CellSymbol, string> = {
  [GalaxySymbol.Bar]:     'BAR',
  [GalaxySymbol.Seven]:   '7',
  [GalaxySymbol.Diamond]: 'DI',
  [GalaxySymbol.Green]:   'GR',
  [GalaxySymbol.Orange]:  'OR',
  [GalaxySymbol.Blue]:    'BL',
  [GalaxySymbol.Purple]:  'PU',
  [WILD]:                 'W',
  [SCATTER]:              '★',
};
