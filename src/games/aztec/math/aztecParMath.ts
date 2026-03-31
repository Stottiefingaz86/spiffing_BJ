/**
 * Aztec — optional PAR-driven reel strips + paytable (from extracted xlsx).
 * Uses `import type` only from engine/symbols so there is no circular runtime import.
 */

import type { TempleSymbol } from '../engine/symbols';
import { PAR_PAYTABLE_BY_CODE, PAR_REEL_STRIP_CODES } from './parGenerated';

const REELS = 5;
const ROWS = 3;

/** Build default when no dev override is set (`import.meta.env.DEV` only). */
export const QUEST_AZTEC_USE_PAR_MATH = true;

/** `null` = follow `QUEST_AZTEC_USE_PAR_MATH`; only consulted in dev. */
let devParMathOverride: boolean | null = null;

const CODE_TO_SYMBOL: Record<string, TempleSymbol> = {
  A: 'wild',
  '2': 'birdBlue',
  '3': 'birdRed',
  '4': 'creatureTan',
  '5': 'maskPurple',
  '6': 'maskGold',
  '7': 'maskGreen',
  '8': 'maskSilver',
};

const SYMBOL_PAY_CODE: Partial<Record<TempleSymbol, string>> = {
  birdBlue: '2',
  birdRed: '3',
  creatureTan: '4',
  maskPurple: '5',
  maskGold: '6',
  maskGreen: '7',
  maskSilver: '8',
};

export function isAztecParMathEnabled(): boolean {
  if (import.meta.env.DEV && devParMathOverride !== null) return devParMathOverride;
  return QUEST_AZTEC_USE_PAR_MATH;
}

/** Dev-only: force PAR strips/paytable on or off, or `null` to use `QUEST_AZTEC_USE_PAR_MATH` again. */
export function setAztecParMathDevOverride(value: boolean | null): void {
  if (!import.meta.env.DEV) return;
  devParMathOverride = value;
}

export function parCodeToSymbol(code: string): TempleSymbol {
  const s = CODE_TO_SYMBOL[code.trim() as keyof typeof CODE_TO_SYMBOL];
  if (!s) {
    console.warn('[Aztec PAR] unknown symbol code:', code);
    return 'birdBlue';
  }
  return s;
}

/** Uniform random visible window: one stop per reel, rows 0..ROWS-1 read consecutive strip positions. */
export function dealParSymbolWindow(): TempleSymbol[][] {
  const grid: TempleSymbol[][] = [];
  const stops: number[] = [];
  for (let c = 0; c < REELS; c++) {
    const strip = PAR_REEL_STRIP_CODES[c];
    const L = strip.length;
    stops[c] = Math.floor(Math.random() * L);
  }
  for (let r = 0; r < ROWS; r++) {
    const row: TempleSymbol[] = [];
    for (let c = 0; c < REELS; c++) {
      const strip = PAR_REEL_STRIP_CODES[c];
      const L = strip.length;
      const code = strip[(stops[c] + r) % L];
      row.push(parCodeToSymbol(code));
    }
    grid.push(row);
  }
  return grid;
}

/** New symbols entering from above during avalanche — strip-frequency matched by uniform stop pick. */
export function parRandomStripSymbol(col: number): TempleSymbol {
  const strip = PAR_REEL_STRIP_CODES[col];
  const L = strip.length;
  const code = strip[Math.floor(Math.random() * L)];
  return parCodeToSymbol(code);
}

/**
 * PAR paytable coins (per line bet unit). Wild has no direct row in PAR.
 */
export function getParLinePayout(symbol: TempleSymbol, count: number): number {
  const code = SYMBOL_PAY_CODE[symbol];
  if (!code) return 0;
  const entry = PAR_PAYTABLE_BY_CODE[code];
  if (!entry) return 0;
  const min = entry.minMatch ?? 3;
  if (count < min) return 0;
  if (count === 3) return entry.three;
  if (count === 4) return entry.four;
  return entry.five;
}
