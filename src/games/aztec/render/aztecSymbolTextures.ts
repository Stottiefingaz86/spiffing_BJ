import { Assets, Texture } from 'pixi.js';
import { TempleSymbol } from '../engine/symbols';

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

/**
 * Stand-in texture key used while `AZTEC_SYMBOL1_FOR_ALL` is true.
 * Maps to `symbol3.png` (water droplet — lowest-tier art in this set).
 */
export const AZTEC_SYMBOL1_STANDIN = TempleSymbol.BirdBlue;

/**
 * Map engine symbols to `public/aztec/` PNGs (art order ≠ filename order).
 * Low pay → high: water, sun medallion, serpent, stone mask, sun mask, jaguar, purple eagle.
 */
export const AZTEC_SYMBOL_TEXTURES: Partial<Record<TempleSymbol, string>> = {
  [TempleSymbol.BirdBlue]: `${BASE}aztec/symbol3.png`,
  [TempleSymbol.BirdRed]: `${BASE}aztec/symbol6.png`,
  [TempleSymbol.CreatureTan]: `${BASE}aztec/symbol1.png`,
  [TempleSymbol.MaskPurple]: `${BASE}aztec/symbol7.png`,
  [TempleSymbol.MaskGold]: `${BASE}aztec/symbol5.png`,
  [TempleSymbol.MaskGreen]: `${BASE}aztec/symbol2.png`,
  [TempleSymbol.MaskSilver]: `${BASE}aztec/symbol4.png`,
  [TempleSymbol.Wild]: `${BASE}aztec/wild.png`,
  [TempleSymbol.Scatter]: `${BASE}aztec/scatter.png`,
};

/**
 * When true, every cell uses the stand-in texture only (quick art check).
 * When false, uses per-symbol PNGs above, then falls back to the stand-in for symbols not yet wired.
 */
export const AZTEC_SYMBOL1_FOR_ALL = false;

const cache = new Map<TempleSymbol, Texture | null>();
let loadPromise: Promise<void> | null = null;

export function preloadAztecSymbolTextures(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const entries = Object.entries(AZTEC_SYMBOL_TEXTURES) as [TempleSymbol, string][];
    await Promise.all(
      entries.map(async ([sym, url]) => {
        try {
          const tex = await Assets.load<Texture>(url);
          cache.set(sym, tex);
        } catch {
          cache.set(sym, null);
        }
      }),
    );
  })();
  return loadPromise;
}

export function getAztecSymbolTexture(sym: TempleSymbol): Texture | null {
  if (AZTEC_SYMBOL1_FOR_ALL) {
    return cache.get(AZTEC_SYMBOL1_STANDIN) ?? null;
  }
  return cache.get(sym) ?? cache.get(AZTEC_SYMBOL1_STANDIN) ?? null;
}
