import { Assets, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import {
  ALL_FRUITS,
  FruitSymbol,
  JAR_WILD,
  SCATTER,
  SYMBOL_COLORS,
  type CellSymbol,
} from '../engine/symbols';

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

const SYMBOL_IMAGE_MAP: Partial<Record<CellSymbol, string>> = {
  [FruitSymbol.Watermelon]:  `${BASE}frootshoot/symbols/s1.png`,
  [FruitSymbol.Pineapple]:   `${BASE}frootshoot/symbols/s2.png`,
  [FruitSymbol.Peach]:       `${BASE}frootshoot/symbols/s3.png`,
  [FruitSymbol.Blueberry]:   `${BASE}frootshoot/symbols/s4.png`,
  [FruitSymbol.Grape]:       `${BASE}frootshoot/symbols/s5.png`,
  [FruitSymbol.Pomegranate]: `${BASE}frootshoot/symbols/s6.png`,
  [JAR_WILD]:                `${BASE}frootshoot/symbols/jar.png`,
};

const TEXTURE_SIZE = 128;
const cache = new Map<string, Texture>();
let pngTexturesLoaded = false;

export async function loadSymbolPNGs(): Promise<void> {
  if (pngTexturesLoaded) return;
  const entries = Object.entries(SYMBOL_IMAGE_MAP) as [CellSymbol, string][];
  await Promise.all(
    entries.map(async ([symbol, url]) => {
      try {
        const tex = await Assets.load<Texture>(url);
        cache.set(symbol, tex);
      } catch {
        // Falls back to generated texture
      }
    }),
  );
  pngTexturesLoaded = true;
}

function buildJarTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const w = TEXTURE_SIZE - 8;
  const h = TEXTURE_SIZE - 8;

  g.roundRect(4, 16, w, h - 12, 16);
  g.fill({ color: 0xfdd835, alpha: 0.9 });

  g.roundRect(14, 4, w - 20, 18, 6);
  g.fill({ color: 0xf9a825 });

  g.roundRect(14, 28, w * 0.35, h * 0.5, 8);
  g.fill({ color: 0xffffff, alpha: 0.25 });

  const bandColors = [0xe53935, 0xff9800, 0xfdd835, 0x66bb6a, 0x42a5f5, 0xab47bc];
  const bandW = (w - 16) / bandColors.length;
  for (let i = 0; i < bandColors.length; i++) {
    g.rect(12 + i * bandW, h - 8, bandW, 12);
    g.fill({ color: bandColors[i], alpha: 0.7 });
  }

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildScatterTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const outer = half - 6;
  const inner = outer * 0.42;
  const points = 5;

  const starPath: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / 2) * -1 + (Math.PI / points) * i;
    const r = i % 2 === 0 ? outer : inner;
    starPath.push({ x: half + Math.cos(angle) * r, y: half + Math.sin(angle) * r });
  }

  g.moveTo(starPath[0].x, starPath[0].y);
  for (let i = 1; i < starPath.length; i++) {
    g.lineTo(starPath[i].x, starPath[i].y);
  }
  g.closePath();
  g.fill({ color: 0xffc107 });

  g.circle(half - outer * 0.15, half - outer * 0.15, outer * 0.35);
  g.fill({ color: 0xffffff, alpha: 0.2 });

  g.circle(half, half, outer * 0.18);
  g.fill({ color: 0xffe082, alpha: 0.6 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildFallbackTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  const g = new Graphics();
  const color = SYMBOL_COLORS[symbol];
  const half = TEXTURE_SIZE / 2;
  const radius = half - 4;

  g.circle(half, half, radius);
  g.fill({ color, alpha: 1 });

  g.circle(half - radius * 0.25, half - radius * 0.25, radius * 0.55);
  g.fill({ color: 0xffffff, alpha: 0.18 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

export function getSymbolTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  let tex = cache.get(symbol);
  if (tex) return tex;

  if (symbol === JAR_WILD) tex = buildJarTexture(renderer);
  else if (symbol === SCATTER) tex = buildScatterTexture(renderer);
  else tex = buildFallbackTexture(renderer, symbol);

  cache.set(symbol, tex);
  return tex;
}

export async function preloadAllTextures(renderer: Renderer): Promise<void> {
  await loadSymbolPNGs();
  getSymbolTexture(renderer, JAR_WILD);
  getSymbolTexture(renderer, SCATTER);
}
