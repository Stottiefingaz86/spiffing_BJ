import { Assets, Graphics, type Renderer, type Texture } from 'pixi.js';
import {
  ALL_SYMBOLS,
  FiestaSymbol,
  JAR_WILD,
  SCATTER,
  SYMBOL_COLORS,
  type CellSymbol,
} from '../engine/symbols';

const TEXTURE_SIZE = 128;
const cache = new Map<string, Texture>();

function buildSombreroTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Brim
  g.ellipse(half, half + 12, 52, 16);
  g.fill({ color: 0xffd700 });
  g.ellipse(half, half + 12, 52, 16);
  g.stroke({ color: 0xe6b800, width: 2 });
  // Crown
  g.ellipse(half, half - 8, 28, 28);
  g.fill({ color: 0xffc107 });
  // Band
  g.rect(half - 28, half + 2, 56, 8);
  g.fill({ color: 0x9c27b0 });
  // Decorations
  for (let i = 0; i < 5; i++) {
    const x = half - 20 + i * 10;
    g.circle(x, half + 6, 2);
    g.fill({ color: [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff][i] });
  }
  // Highlight
  g.ellipse(half - 8, half - 18, 12, 10);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildTacoTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Shell
  g.arc(half, half + 10, 38, Math.PI, 0, false);
  g.fill({ color: 0xf4a460 });
  g.arc(half, half + 10, 38, Math.PI, 0, false);
  g.stroke({ color: 0xd2691e, width: 2 });
  // Filling
  g.arc(half, half + 6, 30, Math.PI, 0, false);
  g.fill({ color: 0x8bc34a });
  // Tomato pieces
  g.circle(half - 10, half - 4, 5);
  g.fill({ color: 0xff4444 });
  g.circle(half + 8, half - 8, 4);
  g.fill({ color: 0xff6644 });
  // Cheese
  g.circle(half, half - 12, 4);
  g.fill({ color: 0xffd700 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildBottleTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Body
  g.roundRect(half - 18, half - 14, 36, 42, 8);
  g.fill({ color: 0x40e0d0 });
  // Neck
  g.roundRect(half - 8, half - 30, 16, 20, 4);
  g.fill({ color: 0x40e0d0 });
  // Cap
  g.roundRect(half - 10, half - 36, 20, 10, 3);
  g.fill({ color: 0xff2222 });
  // Label design (chili)
  g.ellipse(half, half + 4, 10, 8);
  g.fill({ color: 0xff4444 });
  g.moveTo(half, half - 6);
  g.lineTo(half - 3, half + 4);
  g.lineTo(half + 3, half + 4);
  g.closePath();
  g.fill({ color: 0xff2222 });
  // Highlight
  g.roundRect(half - 14, half - 10, 6, 20, 3);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildChiliTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Body (curved)
  g.ellipse(half - 4, half + 8, 16, 28);
  g.fill({ color: 0xff2222 });
  // Stem
  g.roundRect(half - 4, half - 26, 8, 12, 3);
  g.fill({ color: 0x33cc33 });
  // Highlight
  g.ellipse(half - 12, half, 5, 14);
  g.fill({ color: 0xff6666, alpha: 0.5 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildDrumTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Body
  g.roundRect(half - 24, half - 16, 48, 36, 6);
  g.fill({ color: 0xff6633 });
  // Top
  g.ellipse(half, half - 16, 24, 8);
  g.fill({ color: 0xffe0b2 });
  // Decorations
  for (let i = 0; i < 3; i++) {
    const y = half - 4 + i * 10;
    g.moveTo(half - 20, y);
    g.lineTo(half + 20, y);
    g.stroke({ color: 0x33cc33, width: 2 });
  }
  // Triangle decorations
  for (let i = 0; i < 4; i++) {
    const x = half - 14 + i * 10;
    g.moveTo(x, half - 6);
    g.lineTo(x + 5, half + 4);
    g.lineTo(x - 5, half + 4);
    g.closePath();
    g.fill({ color: [0xff2222, 0x33cc33, 0xffd700, 0xff2222][i] });
  }
  // Drumsticks
  g.moveTo(half - 18, half - 28);
  g.lineTo(half - 6, half - 16);
  g.stroke({ color: 0x8d6e63, width: 3 });
  g.circle(half - 18, half - 28, 3);
  g.fill({ color: 0x4fc3f7 });
  g.moveTo(half + 18, half - 28);
  g.lineTo(half + 6, half - 16);
  g.stroke({ color: 0x8d6e63, width: 3 });
  g.circle(half + 18, half - 28, 3);
  g.fill({ color: 0x4fc3f7 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildCactusTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Main trunk
  g.roundRect(half - 10, half - 24, 20, 48, 8);
  g.fill({ color: 0x33cc33 });
  // Left arm
  g.roundRect(half - 28, half - 10, 22, 12, 6);
  g.fill({ color: 0x33cc33 });
  g.roundRect(half - 28, half - 20, 12, 16, 6);
  g.fill({ color: 0x33cc33 });
  // Right arm
  g.roundRect(half + 6, half - 4, 22, 12, 6);
  g.fill({ color: 0x33cc33 });
  g.roundRect(half + 16, half - 18, 12, 18, 6);
  g.fill({ color: 0x33cc33 });
  // Highlight
  g.roundRect(half - 6, half - 18, 4, 30, 2);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildMaracasTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Left maraca
  g.circle(half - 14, half - 8, 16);
  g.fill({ color: 0x4499ff });
  g.roundRect(half - 17, half + 6, 6, 22, 2);
  g.fill({ color: 0x8d6e63 });
  // Right maraca
  g.circle(half + 14, half - 12, 16);
  g.fill({ color: 0x4499ff });
  g.roundRect(half + 11, half + 2, 6, 22, 2);
  g.fill({ color: 0x8d6e63 });
  // Decorations
  g.circle(half - 14, half - 12, 4);
  g.fill({ color: 0xffd700 });
  g.circle(half - 8, half - 4, 3);
  g.fill({ color: 0xff4444 });
  g.circle(half + 14, half - 16, 4);
  g.fill({ color: 0xff4444 });
  g.circle(half + 20, half - 8, 3);
  g.fill({ color: 0xffd700 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildSkullTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Skull shape
  g.circle(half, half - 4, 32);
  g.fill({ color: 0xfaf0e6 });
  // Jaw
  g.roundRect(half - 20, half + 14, 40, 16, 8);
  g.fill({ color: 0xfaf0e6 });
  // Eye sockets
  g.circle(half - 12, half - 8, 10);
  g.fill({ color: 0x222222 });
  g.circle(half + 12, half - 8, 10);
  g.fill({ color: 0x222222 });
  // Flower decorations in eyes
  g.circle(half - 12, half - 8, 5);
  g.fill({ color: 0x9c27b0 });
  g.circle(half + 12, half - 8, 5);
  g.fill({ color: 0xffd700 });
  // Nose
  g.circle(half, half + 4, 3);
  g.fill({ color: 0x222222 });
  // Teeth
  for (let i = 0; i < 5; i++) {
    g.rect(half - 14 + i * 7, half + 16, 5, 8);
    g.fill({ color: 0xffffff });
    g.rect(half - 14 + i * 7, half + 16, 5, 8);
    g.stroke({ color: 0xcccccc, width: 0.5 });
  }
  // Forehead flower
  g.circle(half, half - 24, 6);
  g.fill({ color: 0xff4444 });
  g.circle(half, half - 24, 3);
  g.fill({ color: 0xffd700 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildMultiplierTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  // Fire/burst background
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = half + Math.cos(angle) * 30;
    const py = half + Math.sin(angle) * 30;
    g.circle(px, py, 18);
    g.fill({ color: 0xff6600, alpha: 0.4 });
  }
  // Center circle
  g.circle(half, half, 26);
  g.fill({ color: 0xff4400 });
  g.circle(half, half, 22);
  g.fill({ color: 0xff6600 });
  // Highlight
  g.circle(half - 6, half - 6, 10);
  g.fill({ color: 0xffffff, alpha: 0.2 });
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

  switch (symbol) {
    case FiestaSymbol.Sombrero: tex = buildSombreroTexture(renderer); break;
    case FiestaSymbol.Taco:     tex = buildTacoTexture(renderer); break;
    case FiestaSymbol.Bottle:   tex = buildBottleTexture(renderer); break;
    case FiestaSymbol.Chili:    tex = buildChiliTexture(renderer); break;
    case FiestaSymbol.Drum:     tex = buildDrumTexture(renderer); break;
    case FiestaSymbol.Cactus:   tex = buildCactusTexture(renderer); break;
    case FiestaSymbol.Maracas:  tex = buildMaracasTexture(renderer); break;
    case JAR_WILD:              tex = buildMultiplierTexture(renderer); break;
    case SCATTER:               tex = buildSkullTexture(renderer); break;
    default:                    tex = buildFallbackTexture(renderer, symbol); break;
  }

  cache.set(symbol, tex);
  return tex;
}

export async function preloadAllTextures(renderer: Renderer): Promise<void> {
  for (const sym of ALL_SYMBOLS) {
    getSymbolTexture(renderer, sym);
  }
  getSymbolTexture(renderer, JAR_WILD);
  getSymbolTexture(renderer, SCATTER);
}
