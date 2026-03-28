import { Graphics, Texture, type Renderer } from 'pixi.js';
import {
  ALL_SYMBOLS,
  BambooSymbol,
  WILD,
  SCATTER,
  SYMBOL_COLORS,
  type CellSymbol,
} from '../engine/symbols';

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

const SYMBOL_PNG_MAP: Partial<Record<CellSymbol, string>> = {
  [BambooSymbol.Panda]: `${BASE}bamboofortunes/panda.png`,
  [BambooSymbol.Dragon]: `${BASE}bamboofortunes/dragon.png`,
  [BambooSymbol.Gong]: `${BASE}bamboofortunes/gong.png`,
  [BambooSymbol.Bonsai]: `${BASE}bamboofortunes/bonsai.png`,
  [BambooSymbol.Heart]: `${BASE}bamboofortunes/heart_symbol.png`,
  [BambooSymbol.Spade]: `${BASE}bamboofortunes/spade_symbol.png`,
  [BambooSymbol.Club]: `${BASE}bamboofortunes/club_symbol.png`,
  [WILD]: `${BASE}bamboofortunes/wild.png`,
  [SCATTER]: `${BASE}bamboofortunes/scatter.png`,
};

const TEXTURE_SIZE = 128;
const cache = new Map<string, Texture>();
let pngTexturesLoaded = false;

async function loadTrimmedTexture(url: string): Promise<Texture | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });

    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;

    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      const tex = Texture.from(c);
      tex.source.scaleMode = 'linear';
      return tex;
    }

    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = tw;
    trimmed.height = th;
    const tctx = trimmed.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(c, minX, minY, tw, th, 0, 0, tw, th);

    const tex = Texture.from(trimmed);
    tex.source.scaleMode = 'linear';
    return tex;
  } catch {
    return null;
  }
}

async function loadSymbolPNGs(): Promise<void> {
  if (pngTexturesLoaded) return;
  const entries = Object.entries(SYMBOL_PNG_MAP) as [CellSymbol, string][];
  await Promise.all(
    entries.map(async ([symbol, url]) => {
      try {
        const tex = await loadTrimmedTexture(url);
        if (tex) cache.set(symbol, tex);
      } catch { /* falls back to generated */ }
    }),
  );
  pngTexturesLoaded = true;
}

function buildPandaTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.circle(h, h, 38);
  g.fill({ color: 0xfafafa });
  g.ellipse(h - 22, h - 30, 14, 12);
  g.fill({ color: 0x222222 });
  g.ellipse(h + 22, h - 30, 14, 12);
  g.fill({ color: 0x222222 });
  g.ellipse(h - 16, h - 4, 14, 12);
  g.fill({ color: 0x222222 });
  g.circle(h - 16, h - 4, 5);
  g.fill({ color: 0xffffff });
  g.circle(h - 14, h - 6, 2);
  g.fill({ color: 0x111111 });
  g.ellipse(h + 16, h - 4, 14, 12);
  g.fill({ color: 0x222222 });
  g.circle(h + 16, h - 4, 5);
  g.fill({ color: 0xffffff });
  g.circle(h + 18, h - 6, 2);
  g.fill({ color: 0x111111 });
  g.ellipse(h, h + 10, 8, 6);
  g.fill({ color: 0x333333 });
  g.ellipse(h, h + 18, 10, 5);
  g.fill({ color: 0xfafafa });
  g.moveTo(h, h + 14);
  g.lineTo(h - 4, h + 20);
  g.lineTo(h + 4, h + 20);
  g.closePath();
  g.fill({ color: 0xff6666 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildDragonTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.ellipse(h, h + 4, 32, 28);
  g.fill({ color: 0xcc2222 });
  g.moveTo(h - 20, h - 20);
  g.lineTo(h - 28, h - 38);
  g.lineTo(h - 12, h - 24);
  g.closePath();
  g.fill({ color: 0xcc2222 });
  g.moveTo(h + 20, h - 20);
  g.lineTo(h + 28, h - 38);
  g.lineTo(h + 12, h - 24);
  g.closePath();
  g.fill({ color: 0xcc2222 });
  g.circle(h - 12, h - 2, 6);
  g.fill({ color: 0xffdd00 });
  g.circle(h - 12, h - 2, 3);
  g.fill({ color: 0x111111 });
  g.circle(h + 12, h - 2, 6);
  g.fill({ color: 0xffdd00 });
  g.circle(h + 12, h - 2, 3);
  g.fill({ color: 0x111111 });
  g.ellipse(h, h + 14, 6, 3);
  g.fill({ color: 0x440000 });
  g.circle(h - 4, h + 8, 2);
  g.fill({ color: 0x440000 });
  g.circle(h + 4, h + 8, 2);
  g.fill({ color: 0x440000 });
  for (let i = 0; i < 5; i++) {
    const x = h - 14 + i * 7;
    g.roundRect(x, h + 6, 4, 6, 1);
    g.fill({ color: 0xffd700 });
  }
  g.ellipse(h - 6, h - 14, 8, 5);
  g.fill({ color: 0xff4444, alpha: 0.3 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildBonsaiTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.roundRect(h - 22, h + 20, 44, 14, 5);
  g.fill({ color: 0x5c4033 });
  g.roundRect(h - 20, h + 22, 40, 10, 3);
  g.fill({ color: 0x7a5540 });
  g.roundRect(h - 5, h - 2, 10, 30, 3);
  g.fill({ color: 0x4a3520 });
  g.circle(h, h - 20, 20);
  g.fill({ color: 0x2a6b32 });
  g.circle(h - 14, h - 12, 14);
  g.fill({ color: 0x3a9048 });
  g.circle(h + 14, h - 12, 14);
  g.fill({ color: 0x348040 });
  g.circle(h, h - 28, 10);
  g.fill({ color: 0x4caf60 });
  g.circle(h - 6, h - 24, 4);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildClubTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.circle(h, h - 16, 14);
  g.fill({ color: 0x2288dd });
  g.circle(h - 14, h + 2, 14);
  g.fill({ color: 0x2288dd });
  g.circle(h + 14, h + 2, 14);
  g.fill({ color: 0x2288dd });
  g.moveTo(h, h + 6);
  g.lineTo(h - 8, h + 28);
  g.lineTo(h + 8, h + 28);
  g.closePath();
  g.fill({ color: 0x2288dd });
  g.circle(h - 2, h - 18, 5);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildHeartTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.circle(h - 14, h - 8, 16);
  g.fill({ color: 0xdd2244 });
  g.circle(h + 14, h - 8, 16);
  g.fill({ color: 0xdd2244 });
  g.moveTo(h - 28, h - 2);
  g.lineTo(h, h + 30);
  g.lineTo(h + 28, h - 2);
  g.closePath();
  g.fill({ color: 0xdd2244 });
  g.circle(h - 8, h - 12, 6);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildSpadeTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.moveTo(h, h - 30);
  g.lineTo(h - 28, h + 4);
  g.lineTo(h + 28, h + 4);
  g.closePath();
  g.fill({ color: 0x9944cc });
  g.circle(h - 14, h + 8, 16);
  g.fill({ color: 0x9944cc });
  g.circle(h + 14, h + 8, 16);
  g.fill({ color: 0x9944cc });
  g.moveTo(h, h + 10);
  g.lineTo(h - 6, h + 30);
  g.lineTo(h + 6, h + 30);
  g.closePath();
  g.fill({ color: 0x9944cc });
  g.circle(h - 4, h - 16, 5);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildWildTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.roundRect(h - 32, h - 32, 64, 64, 12);
  g.fill({ color: 0xffd700 });
  g.roundRect(h - 28, h - 28, 56, 56, 10);
  g.fill({ color: 0xffcc00 });
  g.roundRect(h - 24, h - 24, 48, 48, 8);
  g.stroke({ color: 0xe6ac00, width: 2 });
  g.roundRect(h - 20, h - 14, 40, 28, 4);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildScatterTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const h = TEXTURE_SIZE / 2;
  g.circle(h, h, 36);
  g.fill({ color: 0xcc4400 });
  g.circle(h, h, 32);
  g.fill({ color: 0xff6600 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = h + Math.cos(angle) * 26;
    const py = h + Math.sin(angle) * 26;
    g.circle(px, py, 4);
    g.fill({ color: 0xffd700 });
  }
  g.circle(h, h, 18);
  g.fill({ color: 0xffd700 });
  g.circle(h, h, 14);
  g.fill({ color: 0xff8800 });
  g.circle(h - 4, h - 4, 6);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildFallbackTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  const g = new Graphics();
  const color = SYMBOL_COLORS[symbol];
  const h = TEXTURE_SIZE / 2;
  const radius = h - 4;
  g.circle(h, h, radius);
  g.fill({ color, alpha: 1 });
  g.circle(h - radius * 0.25, h - radius * 0.25, radius * 0.55);
  g.fill({ color: 0xffffff, alpha: 0.18 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

export function getSymbolTexture(renderer: Renderer, symbol: CellSymbol): Texture {
  let tex = cache.get(symbol);
  if (tex) return tex;

  switch (symbol) {
    case BambooSymbol.Panda:  tex = buildPandaTexture(renderer); break;
    case BambooSymbol.Dragon: tex = buildDragonTexture(renderer); break;
    case BambooSymbol.Bonsai: tex = buildBonsaiTexture(renderer); break;
    case BambooSymbol.Club:   tex = buildClubTexture(renderer); break;
    case BambooSymbol.Heart:  tex = buildHeartTexture(renderer); break;
    case BambooSymbol.Spade:  tex = buildSpadeTexture(renderer); break;
    case WILD:                tex = buildWildTexture(renderer); break;
    case SCATTER:             tex = buildScatterTexture(renderer); break;
    default:                  tex = buildFallbackTexture(renderer, symbol); break;
  }

  cache.set(symbol, tex);
  return tex;
}

export async function preloadAllTextures(renderer: Renderer): Promise<void> {
  await loadSymbolPNGs();
  for (const sym of ALL_SYMBOLS) {
    getSymbolTexture(renderer, sym);
  }
  getSymbolTexture(renderer, WILD);
  getSymbolTexture(renderer, SCATTER);
}
