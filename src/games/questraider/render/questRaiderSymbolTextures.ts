import { Assets, Texture } from 'pixi.js';
import { TempleSymbol } from '../engine/symbols';

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

/** `symbol1.png` — stand-in texture key used while `QUEST_RAIDER_SYMBOL1_FOR_ALL` is true */
export const QUEST_RAIDER_SYMBOL1_STANDIN = TempleSymbol.BirdBlue;

/** Map each `TempleSymbol` to `symbolN.png` as assets arrive; unmapped symbols use the stand-in texture. */
export const QUEST_RAIDER_SYMBOL_TEXTURES: Partial<Record<TempleSymbol, string>> = {
  [QUEST_RAIDER_SYMBOL1_STANDIN]: `${BASE}quest_raiders/symbol1.png`,
  [TempleSymbol.BirdRed]: `${BASE}quest_raiders/symbol2.png`,
  [TempleSymbol.CreatureTan]: `${BASE}quest_raiders/symbol3.png`,
  [TempleSymbol.MaskPurple]: `${BASE}quest_raiders/symbol4.png`,
  [TempleSymbol.MaskGold]: `${BASE}quest_raiders/symbol5.png`,
  [TempleSymbol.Wild]: `${BASE}quest_raiders/wild.png`,
  [TempleSymbol.Scatter]: `${BASE}quest_raiders/scatter.png`,
};

/**
 * When true, every cell uses the stand-in texture only (quick art check).
 * When false, uses per-symbol PNGs above, then falls back to the stand-in for symbols not yet wired.
 */
export const QUEST_RAIDER_SYMBOL1_FOR_ALL = false;

const cache = new Map<TempleSymbol, Texture | null>();
let loadPromise: Promise<void> | null = null;

export function preloadQuestRaiderSymbolTextures(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const entries = Object.entries(QUEST_RAIDER_SYMBOL_TEXTURES) as [TempleSymbol, string][];
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

export function getQuestRaiderSymbolTexture(sym: TempleSymbol): Texture | null {
  if (QUEST_RAIDER_SYMBOL1_FOR_ALL) {
    return cache.get(QUEST_RAIDER_SYMBOL1_STANDIN) ?? null;
  }
  return cache.get(sym) ?? cache.get(QUEST_RAIDER_SYMBOL1_STANDIN) ?? null;
}
