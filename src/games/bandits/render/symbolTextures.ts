import { Assets, Graphics, Texture, type Renderer } from 'pixi.js';
import { BanditSymbol, SYMBOL_COLORS } from '../engine/symbols';

const TEXTURE_SIZE = 128;
const cache = new Map<string, Texture>();
let wildPngTexture: Texture | null = null;
let scatterPngTexture: Texture | null = null;
let jackPngTexture: Texture | null = null;
let queenPngTexture: Texture | null = null;
let kingPngTexture: Texture | null = null;
let acePngTexture: Texture | null = null;
let skullPngTexture: Texture | null = null;
let flashPngTexture: Texture | null = null;
let dynamitePngTexture: Texture | null = null;
let goldbagPngTexture: Texture | null = null;
let bullionPngTexture: Texture | null = null;

function buildWildTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const r = half - 6;

  // Sheriff star
  const points = 5;
  const outer = r;
  const inner = r * 0.45;
  g.moveTo(half, half - outer);
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (Math.PI / points) * (i + 1);
    const radius = i % 2 === 0 ? inner : outer;
    g.lineTo(half + Math.cos(angle) * radius, half + Math.sin(angle) * radius);
  }
  g.closePath();
  g.fill({ color: 0xffd700 });

  g.circle(half, half, r * 0.22);
  g.fill({ color: 0xffffff, alpha: 0.3 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildScatterFallback(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  g.roundRect(half - 38, half - 42, 76, 84, 4);
  g.fill({ color: 0xf5e6c8 });
  g.roundRect(half - 35, half - 38, 70, 76, 2);
  g.stroke({ color: 0x8b6914, width: 2 });
  g.rect(half - 28, half - 34, 56, 12);
  g.fill({ color: 0xcc3333 });
  g.circle(half, half + 5, 16);
  g.fill({ color: 0x2a1a0a, alpha: 0.7 });
  g.roundRect(half - 14, half + 15, 28, 16, 4);
  g.fill({ color: 0x2a1a0a, alpha: 0.5 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildRevolverTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;

  // Barrel
  g.roundRect(half - 5, half - 30, 10, 35, 3);
  g.fill({ color: 0x555555 });

  // Cylinder
  g.circle(half, half + 8, 12);
  g.fill({ color: 0x777777 });
  g.circle(half, half + 8, 8);
  g.stroke({ color: 0x444444, width: 2 });

  // Grip
  g.roundRect(half - 8, half + 15, 16, 28, 6);
  g.fill({ color: 0x6b3a1f });

  // Trigger guard
  g.arc(half, half + 18, 10, 0, Math.PI, false);
  g.stroke({ color: 0x555555, width: 2 });

  // Highlight
  g.circle(half - 2, half - 15, 3);
  g.fill({ color: 0xffffff, alpha: 0.3 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildShotgunTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;

  // Double barrels
  g.roundRect(half - 8, half - 40, 6, 50, 2);
  g.fill({ color: 0x555555 });
  g.roundRect(half + 2, half - 40, 6, 50, 2);
  g.fill({ color: 0x555555 });

  // Stock
  g.roundRect(half - 10, half + 10, 20, 32, 4);
  g.fill({ color: 0x8b5e3c });

  // Trigger
  g.roundRect(half - 2, half + 8, 4, 8, 1);
  g.fill({ color: 0x444444 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildDynamiteTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;

  // Sticks
  for (let i = -1; i <= 1; i++) {
    g.roundRect(half + i * 12 - 5, half - 20, 10, 42, 3);
    g.fill({ color: 0xe04020 });
    g.roundRect(half + i * 12 - 5, half - 20, 10, 42, 3);
    g.stroke({ color: 0xcc3020, width: 1 });
  }

  // Band
  g.rect(half - 20, half + 5, 40, 6);
  g.fill({ color: 0x8b6914 });

  // Fuse
  g.moveTo(half, half - 20);
  g.quadraticCurveTo(half + 10, half - 35, half + 5, half - 42);
  g.stroke({ color: 0x333333, width: 2 });

  // Spark
  g.circle(half + 5, half - 42, 4);
  g.fill({ color: 0xffcc00 });
  g.circle(half + 5, half - 42, 2);
  g.fill({ color: 0xffffff, alpha: 0.8 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildBootsTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;

  // Boot shape
  g.roundRect(half - 18, half - 30, 16, 50, 4);
  g.fill({ color: 0x6b3a1f });
  g.roundRect(half - 24, half + 15, 26, 10, 3);
  g.fill({ color: 0x6b3a1f });

  // Second boot
  g.roundRect(half + 2, half - 25, 16, 45, 4);
  g.fill({ color: 0x8b5a3f });
  g.roundRect(half - 2, half + 15, 26, 10, 3);
  g.fill({ color: 0x8b5a3f });

  // Spurs
  g.circle(half - 20, half + 20, 3);
  g.fill({ color: 0xc0a040 });
  g.circle(half + 2, half + 20, 3);
  g.fill({ color: 0xc0a040 });

  // Boot straps
  g.rect(half - 17, half - 10, 14, 3);
  g.fill({ color: 0x4a2a10 });
  g.rect(half + 3, half - 5, 14, 3);
  g.fill({ color: 0x5a3a20 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildHorseshoeTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;

  // Horseshoe arc
  g.arc(half, half - 5, 30, Math.PI * 0.15, Math.PI * 0.85, false);
  g.stroke({ color: 0xc0a040, width: 10 });

  // Left nail
  g.circle(half - 26, half + 15, 4);
  g.fill({ color: 0x888888 });

  // Right nail
  g.circle(half + 26, half + 15, 4);
  g.fill({ color: 0x888888 });

  // Highlight
  g.arc(half, half - 5, 24, Math.PI * 0.3, Math.PI * 0.6, false);
  g.stroke({ color: 0xffffff, width: 3, alpha: 0.25 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildLetterTexture(renderer: Renderer, color: number): Texture {
  const g = new Graphics();

  g.roundRect(8, 8, TEXTURE_SIZE - 16, TEXTURE_SIZE - 16, 16);
  g.fill({ color, alpha: 0.85 });

  g.roundRect(14, 14, TEXTURE_SIZE - 28, TEXTURE_SIZE - 28, 12);
  g.stroke({ color: 0xffffff, width: 2, alpha: 0.3 });

  const half = TEXTURE_SIZE / 2;
  const r = half - 8;
  g.circle(half - r * 0.2, half - r * 0.25, r * 0.35);
  g.fill({ color: 0xffffff, alpha: 0.15 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function buildThumbTexture(renderer: Renderer, up: boolean): Texture {
  const g = new Graphics();
  const half = TEXTURE_SIZE / 2;
  const color = up ? 0x4caf50 : 0xf44336;

  g.circle(half, half, half - 6);
  g.fill({ color, alpha: 0.9 });

  const thumbY = up ? -8 : 8;
  g.roundRect(half - 12, half + thumbY - 15, 24, 30, 8);
  g.fill({ color: 0xffffff, alpha: 0.9 });

  const arrowY = up ? half - 25 : half + 25;
  g.moveTo(half, arrowY + (up ? -8 : 8));
  g.lineTo(half - 8, arrowY + (up ? 4 : -4));
  g.lineTo(half + 8, arrowY + (up ? 4 : -4));
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.8 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

export function getSymbolTexture(renderer: Renderer, symbol: BanditSymbol): Texture {
  let tex = cache.get(symbol);
  if (tex) return tex;

  switch (symbol) {
    case BanditSymbol.Wild:       tex = wildPngTexture ?? buildWildTexture(renderer); break;
    case BanditSymbol.Scatter:    tex = scatterPngTexture ?? buildScatterFallback(renderer); break;
    case BanditSymbol.Revolver:   tex = bullionPngTexture ?? buildRevolverTexture(renderer); break;
    case BanditSymbol.Shotgun:    tex = flashPngTexture ?? buildShotgunTexture(renderer); break;
    case BanditSymbol.Dynamite:   tex = dynamitePngTexture ?? buildDynamiteTexture(renderer); break;
    case BanditSymbol.Boots:      tex = goldbagPngTexture ?? buildBootsTexture(renderer); break;
    case BanditSymbol.Horseshoe:  tex = skullPngTexture ?? buildHorseshoeTexture(renderer); break;
    case BanditSymbol.King:       tex = kingPngTexture ?? buildLetterTexture(renderer, 0xdaa520); break;
    case BanditSymbol.Queen:      tex = queenPngTexture ?? buildLetterTexture(renderer, 0xcd5c5c); break;
    case BanditSymbol.Jack:       tex = jackPngTexture ?? buildLetterTexture(renderer, 0x6b8e9b); break;
    case BanditSymbol.Ace:        tex = acePngTexture ?? buildLetterTexture(renderer, 0x9b7cb8); break;
    case BanditSymbol.ThumbsUp:   tex = buildThumbTexture(renderer, true); break;
    case BanditSymbol.ThumbsDown: tex = buildThumbTexture(renderer, false); break;
    default: {
      const g = new Graphics();
      g.circle(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 4);
      g.fill({ color: SYMBOL_COLORS[symbol] ?? 0x888888 });
      tex = renderer.generateTexture(g);
      g.destroy();
    }
  }

  cache.set(symbol, tex);
  return tex;
}

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
      // No transparent border to trim - use image as-is
      return Texture.from(c);
    }

    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = tw;
    trimmed.height = th;
    const tctx = trimmed.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(c, minX, minY, tw, th, 0, 0, tw, th);

    return Texture.from(trimmed);
  } catch (e) {
    console.warn('loadTrimmedTexture failed:', url, e);
    return null;
  }
}

export async function preloadAllTextures(renderer: Renderer): Promise<void> {
  cache.clear();

  const loads = await Promise.all([
    loadTrimmedTexture('/bandits/WILD.png'),
    loadTrimmedTexture('/bandits/scatter.png'),
    loadTrimmedTexture('/bandits/J.png'),
    loadTrimmedTexture('/bandits/q.png'),
    loadTrimmedTexture('/bandits/k.png'),
    loadTrimmedTexture('/bandits/a.png'),
    loadTrimmedTexture('/bandits/SKULL_SYMBOL.png'),
    loadTrimmedTexture('/bandits/FLASH.png'),
    loadTrimmedTexture('/bandits/DYNAMITE.png'),
    loadTrimmedTexture('/bandits/goldbag.png'),
    loadTrimmedTexture('/bandits/bullion.png'),
  ]);

  wildPngTexture = loads[0];
  scatterPngTexture = loads[1];
  jackPngTexture = loads[2];
  queenPngTexture = loads[3];
  kingPngTexture = loads[4];
  acePngTexture = loads[5];
  skullPngTexture = loads[6];
  flashPngTexture = loads[7];
  dynamitePngTexture = loads[8];
  goldbagPngTexture = loads[9];
  bullionPngTexture = loads[10];

  const allSymbols: BanditSymbol[] = Object.values(BanditSymbol);
  for (const sym of allSymbols) {
    getSymbolTexture(renderer, sym);
  }
}
