import { Graphics, type Renderer, type Texture } from 'pixi.js';
import {
  ALL_FRUITS,
  JAR_WILD,
  SCATTER,
  SYMBOL_COLORS,
  SYMBOL_LABELS,
  type CellSymbol,
} from '../engine/symbols';

const TEXTURE_SIZE = 128;
const cache = new Map<string, Texture>();

function buildFruitTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  const g = new Graphics();
  const color = SYMBOL_COLORS[symbol];
  const half = TEXTURE_SIZE / 2;
  const radius = half - 4;

  // Main circle with gradient-like effect
  g.circle(half, half, radius);
  g.fill({ color, alpha: 1 });

  // Highlight (top-left sheen)
  g.circle(half - radius * 0.25, half - radius * 0.25, radius * 0.55);
  g.fill({ color: 0xffffff, alpha: 0.18 });

  // Inner shadow (bottom-right)
  g.circle(half + radius * 0.1, half + radius * 0.1, radius * 0.85);
  g.fill({ color: 0x000000, alpha: 0.08 });

  // Label
  const label = SYMBOL_LABELS[symbol];
  g.circle(half, half, radius * 0.38);
  g.fill({ color: 0xffffff, alpha: 0.2 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildJarTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const w = TEXTURE_SIZE - 8;
  const h = TEXTURE_SIZE - 8;

  // Jar body (rounded rectangle)
  g.roundRect(4, 16, w, h - 12, 16);
  g.fill({ color: 0xfdd835, alpha: 0.9 });

  // Jar lid
  g.roundRect(14, 4, w - 20, 18, 6);
  g.fill({ color: 0xf9a825 });

  // Jar shine
  g.roundRect(14, 28, w * 0.35, h * 0.5, 8);
  g.fill({ color: 0xffffff, alpha: 0.25 });

  // Rainbow band
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

  // 5-pointed star
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

  // Inner highlight
  g.circle(half - outer * 0.15, half - outer * 0.15, outer * 0.35);
  g.fill({ color: 0xffffff, alpha: 0.2 });

  // Center dot
  g.circle(half, half, outer * 0.18);
  g.fill({ color: 0xffe082, alpha: 0.6 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

export function getSymbolTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  const key = symbol;
  let tex = cache.get(key);
  if (!tex) {
    if (symbol === JAR_WILD) tex = buildJarTexture(renderer);
    else if (symbol === SCATTER) tex = buildScatterTexture(renderer);
    else tex = buildFruitTexture(renderer, symbol);
    cache.set(key, tex);
  }
  return tex;
}

export function preloadAllTextures(renderer: Renderer): void {
  for (const fruit of ALL_FRUITS) {
    getSymbolTexture(renderer, fruit);
  }
  getSymbolTexture(renderer, JAR_WILD);
  getSymbolTexture(renderer, SCATTER);
}
