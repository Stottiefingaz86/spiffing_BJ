import { Graphics, Texture, type Renderer } from 'pixi.js';
import {
  ALL_SYMBOLS,
  GalaxySymbol,
  SCATTER,
  SYMBOL_COLORS,
  WILD,
  type CellSymbol,
} from '../engine/symbols';

const TEXTURE_SIZE = 128;
const cache = new Map<string, Texture>();

function drawGlowOrb(g: Graphics, x: number, y: number, radius: number, core: number, glow: number) {
  g.circle(x, y, radius * 1.55);
  g.fill({ color: glow, alpha: 0.18 });
  g.circle(x, y, radius * 1.25);
  g.fill({ color: glow, alpha: 0.28 });
  g.circle(x, y, radius);
  g.fill({ color: core });
}

/** BAR — glossy gold plaque. */
function buildBarTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  g.circle(half, half, 48);
  g.fill({ color: 0xfff3a0, alpha: 0.18 });
  g.circle(half, half, 40);
  g.fill({ color: 0xffd45a, alpha: 0.3 });
  // Plaque
  g.roundRect(half - 40, half - 20, 80, 40, 8);
  g.fill({ color: 0xffaf1b });
  g.roundRect(half - 38, half - 18, 76, 36, 7);
  g.stroke({ color: 0x8a5a00, width: 2 });
  // "BAR" lettering
  g.roundRect(half - 32, half - 6, 14, 12, 2); g.fill({ color: 0xfff5be });
  g.roundRect(half - 14, half - 6, 14, 12, 2); g.fill({ color: 0xfff5be });
  g.roundRect(half + 4,  half - 6, 14, 12, 2); g.fill({ color: 0xfff5be });
  // Gloss
  g.roundRect(half - 36, half - 16, 72, 8, 4);
  g.fill({ color: 0xffffff, alpha: 0.35 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** 7 — blue-ringed red seven. */
function buildSevenTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Halo
  g.circle(half, half, 46);
  g.fill({ color: 0x3a8fff, alpha: 0.15 });
  // Blue ring
  g.circle(half, half, 40);
  g.stroke({ color: 0x1d5bd4, width: 6 });
  g.circle(half, half, 40);
  g.stroke({ color: 0x74b8ff, width: 2 });
  // Body of 7
  g.moveTo(half - 22, half - 20);
  g.lineTo(half + 22, half - 20);
  g.lineTo(half + 22, half - 10);
  g.lineTo(half - 2, half + 24);
  g.lineTo(half - 14, half + 24);
  g.lineTo(half + 12, half - 10);
  g.lineTo(half - 22, half - 10);
  g.closePath();
  g.fill({ color: 0xff303a });
  g.stroke({ color: 0x7a0d12, width: 2 });
  // Highlight
  g.moveTo(half - 20, half - 18);
  g.lineTo(half + 20, half - 18);
  g.lineTo(half + 12, half - 12);
  g.lineTo(half - 20, half - 12);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.3 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** Yellow faceted diamond. */
function buildDiamondTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const h = 46, w = 40;
  g.poly([half, half - h, half + w, half, half, half + h, half - w, half], true);
  g.fill({ color: 0xffeb3b });
  // Top facet (lighter)
  g.poly([half, half - h, half + w, half, half, half], true);
  g.fill({ color: 0xfff79a, alpha: 0.8 });
  // Left facet (darker)
  g.poly([half, half - h, half - w, half, half, half], true);
  g.fill({ color: 0xffd018, alpha: 0.6 });
  // Outline
  g.poly([half, half - h, half + w, half, half, half + h, half - w, half], true);
  g.stroke({ color: 0xc69600, width: 3 });
  // Shine
  g.moveTo(half - 8, half - h + 10);
  g.lineTo(half + 4, half - h + 8);
  g.lineTo(half, half - 4);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.7 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** Hexagonal gem with tint. */
function buildHexGem(renderer: Renderer, baseColor: number, lightColor: number, darkColor: number): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const r = 42;
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    pts.push(half + Math.cos(a) * r, half + Math.sin(a) * r);
  }
  g.poly(pts, true);
  g.fill({ color: baseColor });
  // Top lighter facet
  g.poly([pts[0], pts[1], pts[2], pts[3], half, half], true);
  g.fill({ color: lightColor, alpha: 0.8 });
  // Bottom darker facet
  g.poly([pts[6], pts[7], pts[8], pts[9], half, half], true);
  g.fill({ color: darkColor, alpha: 0.7 });
  g.poly(pts, true);
  g.stroke({ color: darkColor, width: 3 });
  // Highlight streak
  g.moveTo(pts[0] - 12, pts[1] + 14);
  g.lineTo(pts[0] + 8, pts[1] + 10);
  g.lineTo(pts[0] + 4, pts[1] + 28);
  g.lineTo(pts[0] - 16, pts[1] + 32);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.45 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildGreenTexture(r: Renderer) { return buildHexGem(r, 0x3dd26b, 0x9cff9b, 0x0c6b2c); }
function buildOrangeTexture(r: Renderer) { return buildHexGem(r, 0xff6a28, 0xffb08c, 0x8a2c00); }
function buildBlueTexture(r: Renderer) { return buildHexGem(r, 0x2d8cff, 0x88c3ff, 0x0d3f8c); }
function buildPurpleTexture(r: Renderer) { return buildHexGem(r, 0xa64aff, 0xd8a2ff, 0x4a1080); }

/** Wild — rainbow 8-point Starburst symbol. */
function buildWildTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const points = 8;
  const outer = 48;
  const inner = 18;
  for (let pass = 0; pass < 2; pass++) {
    const path: number[] = [];
    const rot = pass * (Math.PI / points);
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer - pass * 2 : inner + pass * 2;
      const a = (i / (points * 2)) * Math.PI * 2 + rot;
      path.push(half + Math.cos(a) * r, half + Math.sin(a) * r);
    }
    g.poly(path, true);
    g.fill({ color: pass === 0 ? 0xfff4c8 : 0xffffff, alpha: pass === 0 ? 0.55 : 0.9 });
  }
  // Rainbow rings
  const grad = [0xff5577, 0xffcc33, 0x77ff66, 0x33ccff, 0xaa66ff];
  for (let i = 0; i < grad.length; i++) {
    g.circle(half, half, 24 - i * 3.6);
    g.fill({ color: grad[i], alpha: 0.82 });
  }
  g.circle(half, half, 6);
  g.fill({ color: 0xffffff });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** Scatter — bright pink Galaxy Star orb. */
function buildScatterTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  drawGlowOrb(g, half, half, 36, 0xff2da0, 0xffcde9);
  // 6-point starburst
  const points = 6;
  const outer = 44;
  const inner = 14;
  const path: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    path.push(half + Math.cos(a) * r, half + Math.sin(a) * r);
  }
  g.poly(path, true);
  g.fill({ color: 0xff52b9 });
  g.poly(path, true);
  g.stroke({ color: 0x8a0050, width: 2 });
  g.circle(half, half, 12);
  g.fill({ color: 0xffffff });
  g.circle(half - 3, half - 3, 5);
  g.fill({ color: 0xffffff, alpha: 0.95 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildFallbackTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  const g = new Graphics();
  const color = SYMBOL_COLORS[symbol] ?? 0xffffff;
  const half = TEXTURE_SIZE / 2;
  const radius = half - 4;
  g.circle(half, half, radius);
  g.fill({ color, alpha: 1 });
  g.circle(half - radius * 0.3, half - radius * 0.3, radius * 0.55);
  g.fill({ color: 0xffffff, alpha: 0.22 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

export function getSymbolTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  let tex = cache.get(symbol);
  if (tex) return tex;
  switch (symbol) {
    case GalaxySymbol.Bar:     tex = buildBarTexture(renderer); break;
    case GalaxySymbol.Seven:   tex = buildSevenTexture(renderer); break;
    case GalaxySymbol.Diamond: tex = buildDiamondTexture(renderer); break;
    case GalaxySymbol.Green:   tex = buildGreenTexture(renderer); break;
    case GalaxySymbol.Orange:  tex = buildOrangeTexture(renderer); break;
    case GalaxySymbol.Blue:    tex = buildBlueTexture(renderer); break;
    case GalaxySymbol.Purple:  tex = buildPurpleTexture(renderer); break;
    case WILD:                 tex = buildWildTexture(renderer); break;
    case SCATTER:              tex = buildScatterTexture(renderer); break;
    default:                   tex = buildFallbackTexture(renderer, symbol); break;
  }
  cache.set(symbol, tex);
  return tex;
}

export async function preloadAllTextures(renderer: Renderer): Promise<void> {
  for (const sym of ALL_SYMBOLS) getSymbolTexture(renderer, sym);
  getSymbolTexture(renderer, WILD);
  getSymbolTexture(renderer, SCATTER);
}
