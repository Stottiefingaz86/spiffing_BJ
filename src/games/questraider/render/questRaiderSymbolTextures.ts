import { Assets, Texture } from 'pixi.js';
import { TempleSymbol } from '../engine/symbols';

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

/** `symbol1.png` — stand-in texture key used while `QUEST_RAIDER_SYMBOL1_FOR_ALL` is true */
export const QUEST_RAIDER_SYMBOL1_STANDIN = TempleSymbol.BirdBlue;

/** Add `symbol2.png` etc. and map to enum as assets arrive */
export const QUEST_RAIDER_SYMBOL_TEXTURES: Partial<Record<TempleSymbol, string>> = {
  [QUEST_RAIDER_SYMBOL1_STANDIN]: `${BASE}quest_raiders/symbol1.png`,
};

/** Set false when each `TempleSymbol` has its own PNG wired in `QUEST_RAIDER_SYMBOL_TEXTURES`. */
export const QUEST_RAIDER_SYMBOL1_FOR_ALL = true;

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
  return cache.get(sym) ?? null;
}
