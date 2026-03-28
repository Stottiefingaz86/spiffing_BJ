import {
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  TextStyle,
  type Renderer,
} from 'pixi.js';
import { REELS, ROWS, BanditSymbol, SYMBOL_LABELS, randomBaseSymbol } from '../engine/symbols';
import { PAYLINE_PATTERNS, type PaylineWin, type ReelGrid } from '../engine/paylines';
import type { WildFeatureResult } from '../engine/wildFeatures';
import { getSymbolTexture } from './symbolTextures';
import type { ReelAnimState } from './reelAnimation';

// ── Frame asset ──

interface FrameData {
  texture: Texture;
  originalTexture: Texture;
  aspect: number;
  innerLeft: number;
  innerTop: number;
  innerRight: number;
  innerBottom: number;
  /** Pixel-perfect mask texture generated from mask.png green area */
  maskTexture: Texture | null;
}

let frameData: FrameData | null = null;

export async function loadFrameAsset(): Promise<void> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('frame load failed'));
      img.src = '/bandits/frame.png';
    });

    const w = img.width;
    const h = img.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;

    // First try: scan for green pixels (green screen version)
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let greenFound = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = px[idx], g = px[idx + 1], b = px[idx + 2];
        const isGreen = (g > 100 && g > r * 1.4 && g > b * 1.4) ||
                        (g > 180 && r < 150 && b < 150);
        if (isGreen) {
          greenFound = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!greenFound) {
      // Fallback: no green screen. Find the opaque bounding box,
      // then inset by the border thickness to estimate the interior.
      let opaqueL = w, opaqueT = h, opaqueR = 0, opaqueB = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] > 128) {
            if (x < opaqueL) opaqueL = x;
            if (x > opaqueR) opaqueR = x;
            if (y < opaqueT) opaqueT = y;
            if (y > opaqueB) opaqueB = y;
          }
        }
      }
      const frameW = opaqueR - opaqueL;
      const frameH = opaqueB - opaqueT;
      const insetX = Math.floor(frameW * 0.07);
      const insetTop = Math.floor(frameH * 0.13);
      const insetBottom = Math.floor(frameH * 0.08);
      minX = opaqueL + insetX;
      maxX = opaqueR - insetX;
      minY = opaqueT + insetTop;
      maxY = opaqueB - insetBottom;
    }

    const texture = Texture.from({ resource: img });
    const shrinkX = 3 / w;
    const shrinkY = 3 / h;

    // Load mask.png and create a pixel-perfect mask texture
    let maskTexture: Texture | null = null;
    try {
      const maskImg = new Image();
      maskImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        maskImg.onload = () => resolve();
        maskImg.onerror = () => reject(new Error('mask load failed'));
        maskImg.src = '/bandits/mask.png';
      });

      const mw = maskImg.width;
      const mh = maskImg.height;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = mw;
      maskCanvas.height = mh;
      const mctx = maskCanvas.getContext('2d')!;
      mctx.drawImage(maskImg, 0, 0);
      const mData = mctx.getImageData(0, 0, mw, mh);
      const mpx = mData.data;

      // Convert: green pixels → white (visible), everything else → transparent (hidden)
      for (let i = 0; i < mpx.length; i += 4) {
        const r = mpx[i], g = mpx[i + 1], b = mpx[i + 2];
        const isGreen = (g > 100 && g > r * 1.4 && g > b * 1.4) ||
                        (g > 180 && r < 150 && b < 150);
        if (isGreen) {
          mpx[i] = 255; mpx[i + 1] = 255; mpx[i + 2] = 255; mpx[i + 3] = 255;
        } else {
          mpx[i + 3] = 0;
        }
      }
      mctx.putImageData(mData, 0, 0);
      maskTexture = Texture.from({ resource: maskCanvas });
    } catch { /* mask.png not found, fall back to rectangle */ }

    frameData = {
      texture,
      originalTexture: texture,
      aspect: w / h,
      innerLeft: minX / w + shrinkX,
      innerTop: minY / h + shrinkY,
      innerRight: (maxX + 1) / w - shrinkX,
      innerBottom: (maxY + 1) / h - shrinkY,
      maskTexture,
    };
  } catch {
    frameData = null;
  }

}

const SYMBOL_INSET = 2;

export interface ReelLayout {
  gridX: number;
  gridY: number;
  cellW: number;
  cellH: number;
  gap: number;
  cellStep: number; // cellH + gap
  totalW: number;
  totalH: number;
  // Frame overlay dimensions (if frame loaded)
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
}

export function computeReelLayout(canvasW: number, canvasH: number): ReelLayout {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvasW / dpr;
  const isMobile = cssW < 768;
  const margin = 0;
  const gap = isMobile ? 1 : 3;

  let maxW: number, maxH: number;
  let frameX = 0, frameY = 0, frameW = 0, frameH = 0;

  if (frameData) {
    const innerFracW = frameData.innerRight - frameData.innerLeft;
    const innerFracH = frameData.innerBottom - frameData.innerTop;

    const availH = canvasH;
    const aspect = frameData.aspect;

    // On mobile, overshoot width so frame edges bleed off-screen
    // and symbols fill the visible area
    const overshoot = isMobile ? 1.15 : 1.0;
    frameW = canvasW * overshoot;
    frameH = frameW / aspect;
    if (frameH > availH) {
      frameH = availH;
      frameW = frameH * aspect;
    }

    frameX = Math.floor((canvasW - frameW) / 2);
    if (isMobile) {
      frameY = Math.floor((canvasH - frameH) * 0.35);
    } else {
      frameY = Math.floor((canvasH - frameH) / 2);
    }

    maxW = Math.floor(frameW * innerFracW);
    maxH = Math.floor(frameH * innerFracH);
  } else {
    const hPad = isMobile ? 8 : 40;
    const vPad = isMobile ? 20 : 40;
    maxW = canvasW - hPad * 2;
    maxH = canvasH - vPad * 2;
  }

  const totalGapW = gap * (REELS - 1);
  const totalGapH = gap * (ROWS - 1);

  const cellW = Math.floor((maxW - totalGapW) / REELS);
  const cellH = Math.floor((maxH - totalGapH) / ROWS);

  const cellStep = cellH + gap;
  const totalW = cellW * REELS + totalGapW;
  const totalH = cellH * ROWS + totalGapH;

  let gridX: number, gridY: number;

  if (frameData) {
    // Center grid within the frame's inner area
    const innerX = frameX + frameW * frameData.innerLeft;
    const innerY = frameY + frameH * frameData.innerTop;
    const innerPxW = frameW * (frameData.innerRight - frameData.innerLeft);
    const innerPxH = frameH * (frameData.innerBottom - frameData.innerTop);
    gridX = Math.floor(innerX + (innerPxW - totalW) / 2);
    gridY = Math.floor(innerY + (innerPxH - totalH) / 2);
  } else {
    gridX = Math.floor((canvasW - totalW) / 2);
    gridY = Math.floor((canvasH - totalH) / 2);
  }

  return { gridX, gridY, cellW, cellH, gap, cellStep, totalW, totalH, frameX, frameY, frameW, frameH };
}

// ── Per-reel strip state ──

const STRIP_SIZE = ROWS + 2; // 1 buffer above + 3 visible + 1 buffer below

/** Length of the pre-generated visual strip per reel. Must be longer than
 *  the total cells scrolled during a spin (~20 typical). */
const VISUAL_STRIP_LENGTH = 300;

/** How many cell cycles needed for all 3 result symbols to scroll into view
 *  from the top buffer position. */
const LANDING_CYCLES = 4;

interface ReelStrip {
  container: Container;
  mask: Sprite | Graphics;
  sprites: Sprite[];
  labels: Text[];
  /** The 5 symbols currently mapped to sprites (1 buffer + 3 visible + 1 buffer) */
  symbols: BanditSymbol[];
  /** Pre-generated fixed strip of symbols for this spin. */
  visualStrip: BanditSymbol[];
  /** Next index to pull from visualStrip */
  stripCursor: number;
  /** Tracks totalCells from last update to detect wraps */
  lastTotalCells: number;
  /** True once result symbols have been injected into the visual strip */
  landingStarted: boolean;
  /** Cell cycles remaining until result symbols are in visible positions */
  landingCyclesLeft: number;
  /** True when result symbols are in their final visible positions */
  landed: boolean;
  /** True when ready for bounce (no further symbol shifting needed) */
  finalized: boolean;
}

// ── Scene state ──

let sceneRoot: Container | null = null;
let frameOverlay: Sprite | null = null;
let reelStrips: ReelStrip[] = [];
let paylineGfx: Graphics | null = null;
let wildFeatureGfx: Graphics | null = null;
let winTextObj: Text | null = null;
let lastLayoutKey = '';

function layoutKey(l: ReelLayout, inFreeSpins: boolean): string {
  return `${l.gridX},${l.gridY},${l.cellW},${l.cellH},${l.gap},${inFreeSpins ? 1 : 0}`;
}

export function initReelScene(
  parent: Container,
  renderer: Renderer,
  grid: ReelGrid,
  layout: ReelLayout,
  inFreeSpins: boolean,
): void {
  if (sceneRoot) {
    parent.removeChild(sceneRoot);
    sceneRoot.destroy({ children: true });
  }

  sceneRoot = new Container();
  parent.addChild(sceneRoot);

  // 1) Frame as BOTTOM layer (background behind symbols)
  if (frameData) {
    frameOverlay = new Sprite(frameData.texture);
    frameOverlay.x = layout.frameX;
    frameOverlay.y = layout.frameY;
    frameOverlay.width = layout.frameW;
    frameOverlay.height = layout.frameH;
    sceneRoot.addChild(frameOverlay);
  }

  // 2) Symbols ON TOP of frame, masked to inner area
  let reelMask: Sprite | Graphics;
  if (frameData?.maskTexture) {
    const maskSprite = new Sprite(frameData.maskTexture);
    // mask.png is the inner shape only — position it at the frame's inner area
    const innerX = layout.frameX + layout.frameW * frameData.innerLeft;
    const innerY = layout.frameY + layout.frameH * frameData.innerTop;
    const innerW = layout.frameW * (frameData.innerRight - frameData.innerLeft);
    const innerH = layout.frameH * (frameData.innerBottom - frameData.innerTop);
    maskSprite.x = innerX;
    maskSprite.y = innerY;
    maskSprite.width = innerW;
    maskSprite.height = innerH;
    reelMask = maskSprite;
  } else {
    const gridMask = new Graphics();
    gridMask.rect(layout.gridX, layout.gridY, layout.totalW, layout.totalH);
    gridMask.fill({ color: 0xffffff });
    reelMask = gridMask;
  }

  const reelRoot = new Container();
  reelRoot.mask = reelMask;
  sceneRoot.addChild(reelMask);
  sceneRoot.addChild(reelRoot);

  reelStrips = [];

  for (let r = 0; r < REELS; r++) {
    const rx = layout.gridX + r * (layout.cellW + layout.gap);

    const container = new Container();
    reelRoot.addChild(container);

    const sprites: Sprite[] = [];
    const labels: Text[] = [];
    const symbols: BanditSymbol[] = [
      randomBaseSymbol(),
      grid[r]?.[0] ?? BanditSymbol.Ace,
      grid[r]?.[1] ?? BanditSymbol.Ace,
      grid[r]?.[2] ?? BanditSymbol.Ace,
      randomBaseSymbol(),
    ];

    for (let i = 0; i < STRIP_SIZE; i++) {
      const sym = symbols[i];
      const tex = getSymbolTexture(renderer, sym);
      const sprite = new Sprite(tex);
      sprite.x = rx + SYMBOL_INSET;
      sprite.y = layout.gridY + (i - 1) * layout.cellStep + SYMBOL_INSET;
      sprite.width = layout.cellW - SYMBOL_INSET * 2;
      sprite.height = layout.cellH - SYMBOL_INSET * 2;
      container.addChild(sprite);
      sprites.push(sprite);

      const label = new Text({
        text: SYMBOL_LABELS[sym] ?? '',
        style: new TextStyle({
          fontSize: Math.min((layout.cellW - SYMBOL_INSET * 2) * 0.35, 26),
          fontFamily: 'Arial Black, sans-serif',
          fontWeight: 'bold',
          fill: 0xffffff,
          dropShadow: { alpha: 0.5, blur: 2, distance: 1, color: 0x000000 },
        }),
      });
      label.anchor.set(0.5);
      label.x = rx + layout.cellW / 2;
      label.y = sprite.y + sprite.height / 2;
      container.addChild(label);
      labels.push(label);
    }

    reelStrips.push({
      container,
      mask: reelMask,
      sprites,
      labels,
      symbols,
      visualStrip: [],
      stripCursor: 0,
      lastTotalCells: 0,
      landingStarted: false,
      landingCyclesLeft: 0,
      landed: true,
      finalized: true,
    });
  }

  paylineGfx = new Graphics();
  sceneRoot.addChild(paylineGfx);

  wildFeatureGfx = new Graphics();
  sceneRoot.addChild(wildFeatureGfx);

  winTextObj = new Text({
    text: '',
    style: new TextStyle({
      fontSize: 24,
      fontFamily: 'Arial Black, sans-serif',
      fontWeight: 'bold',
      fill: 0x6ee7b7,
      dropShadow: { alpha: 0.7, blur: 4, distance: 2, color: 0x000000 },
      stroke: { color: 0x000000, width: 3 },
    }),
  });
  winTextObj.anchor.set(0.5);
  winTextObj.visible = false;
  sceneRoot.addChild(winTextObj);

  lastLayoutKey = layoutKey(layout, inFreeSpins);
}


/** Call when spin starts to pre-generate a fixed visual strip per reel. */
export function startReelSpin(): void {
  for (const strip of reelStrips) {
    strip.lastTotalCells = 0;
    strip.landingStarted = false;
    strip.landingCyclesLeft = 0;
    strip.landed = false;
    strip.finalized = false;

    strip.visualStrip = [];
    for (let i = 0; i < VISUAL_STRIP_LENGTH; i++) {
      strip.visualStrip.push(randomBaseSymbol());
    }
    strip.stripCursor = 0;

    // Keep current visible symbols (previous result) — the cycling will
    // naturally scroll them out as the reel accelerates, so there's no
    // visible "swap" at spin start.
  }
}

/**
 * Inject the result symbols into the visual strip so they scroll into view
 * naturally over the next few cell cycles. No textures are changed — the
 * normal cycling code pulls them from the strip as the reel decelerates.
 */
export function prepareReelLanding(
  reelIndex: number,
  resultSymbols: BanditSymbol[],
  _renderer: Renderer,
): boolean {
  const strip = reelStrips[reelIndex];
  if (!strip || strip.landingStarted) return false;

  strip.landingStarted = true;
  strip.landingCyclesLeft = LANDING_CYCLES;

  // Downward scroll: each cycle pop()s bottom, unshift()s from strip at top.
  // After 4 cycles: symbols = [new3, new2, new1, new0, old0]
  // visible (1,2,3) = [new2, new1, new0]
  // So to get visible = [R0, R1, R2]: inject R2, R1, R0, buffer
  const c = strip.stripCursor;
  while (strip.visualStrip.length < c + LANDING_CYCLES) {
    strip.visualStrip.push(randomBaseSymbol());
  }
  strip.visualStrip[c]     = resultSymbols[2] ?? BanditSymbol.Ace;
  strip.visualStrip[c + 1] = resultSymbols[1] ?? BanditSymbol.Ace;
  strip.visualStrip[c + 2] = resultSymbols[0] ?? BanditSymbol.Ace;
  strip.visualStrip[c + 3] = randomBaseSymbol();

  return true;
}

export function updateReelScene(
  renderer: Renderer,
  grid: ReelGrid,
  layout: ReelLayout,
  animStates: ReelAnimState[],
  inFreeSpins: boolean,
  paylineWins?: PaylineWin[],
  currentPayline?: number,
  _wildFeature?: WildFeatureResult | null,
  spinWin?: number,
  highlightWilds?: { reel: number; row: number }[],
  anticipatingReels?: Set<number>,
): void {
  if (!sceneRoot) return;

  const lk = layoutKey(layout, inFreeSpins);
  if (lk !== lastLayoutKey) {
    const parent = sceneRoot.parent;
    if (parent) {
      initReelScene(parent, renderer, grid, layout, inFreeSpins);
    }
    return;
  }

  for (let r = 0; r < REELS; r++) {
    const strip = reelStrips[r];
    const anim = animStates[r];
    if (!strip) continue;

    const rx = layout.gridX + r * (layout.cellW + layout.gap);

    const g0 = grid[r]?.[0] ?? BanditSymbol.Ace;
    const g1 = grid[r]?.[1] ?? BanditSymbol.Ace;
    const g2 = grid[r]?.[2] ?? BanditSymbol.Ace;

    if (anim.spinning) {
      // ── Spinning: scroll symbols downward through the reel ──

      // Cycle symbols from visual strip as cells scroll past
      if (!strip.landed) {
        const cellsDelta = anim.totalCells - strip.lastTotalCells;
        if (cellsDelta > 0) {
          for (let wrap = 0; wrap < cellsDelta; wrap++) {
            strip.symbols.pop();
            const next = strip.visualStrip[strip.stripCursor % strip.visualStrip.length];
            strip.stripCursor++;
            strip.symbols.unshift(next);

            if (strip.landingStarted && strip.landingCyclesLeft > 0) {
              strip.landingCyclesLeft--;
              if (strip.landingCyclesLeft === 0) {
                strip.landed = true;
                strip.finalized = true;
                break;
              }
            }
          }
          strip.lastTotalCells = anim.totalCells;
        }
      }

      // Safety: only force grid values after the cycling has completed
      if (strip.landed) {
        strip.symbols[1] = g0;
        strip.symbols[2] = g1;
        strip.symbols[3] = g2;
      }

      for (let i = 0; i < STRIP_SIZE; i++) {
        const sym = strip.symbols[i];
        const tex = getSymbolTexture(renderer, sym);
        if (strip.sprites[i].texture !== tex) strip.sprites[i].texture = tex;
        const lt = SYMBOL_LABELS[sym] ?? '';
        if (strip.labels[i].text !== lt) strip.labels[i].text = lt;
      }

      // Downward scroll: sprites move down as cellOffset increases
      const pixelOffset = anim.cellOffset * layout.cellStep;

      const isAnticipating = anticipatingReels?.has(r) ?? false;
      let alpha: number;
      if (anim.isLanding) {
        alpha = 1;
      } else if (isAnticipating) {
        alpha = 0.3;
      } else if (anim.speed > 0.25) {
        alpha = 0.65;
      } else if (anim.speed > 0.1) {
        alpha = 0.8;
      } else {
        alpha = 1;
      }

      for (let i = 0; i < STRIP_SIZE; i++) {
        const baseY = layout.gridY + (i - 1) * layout.cellStep;
        strip.sprites[i].x = rx + SYMBOL_INSET;
        strip.sprites[i].y = baseY + pixelOffset + SYMBOL_INSET;
        strip.sprites[i].width = layout.cellW - SYMBOL_INSET * 2;
        strip.sprites[i].height = layout.cellH - SYMBOL_INSET * 2;
        strip.sprites[i].alpha = alpha;

        strip.labels[i].x = rx + layout.cellW / 2;
        strip.labels[i].y = baseY + pixelOffset + layout.cellH / 2;
        strip.labels[i].visible = anim.isLanding || anim.speed < 0.15;
      }
    } else {
      // ── Stopped or bouncing: lock symbols to grid values ──
      if (!strip.finalized) {
        strip.symbols[0] = randomBaseSymbol();
        strip.symbols[4] = randomBaseSymbol();
      }
      strip.symbols[1] = g0;
      strip.symbols[2] = g1;
      strip.symbols[3] = g2;
      strip.landed = true;
      strip.finalized = true;

      for (let i = 0; i < STRIP_SIZE; i++) {
        const sym = strip.symbols[i];
        const tex = getSymbolTexture(renderer, sym);
        if (strip.sprites[i].texture !== tex) strip.sprites[i].texture = tex;

        const baseY = layout.gridY + (i - 1) * layout.cellStep;
        strip.sprites[i].x = rx + SYMBOL_INSET;
        strip.sprites[i].y = baseY + anim.bounceY + SYMBOL_INSET;
        strip.sprites[i].width = layout.cellW - SYMBOL_INSET * 2;
        strip.sprites[i].height = layout.cellH - SYMBOL_INSET * 2;
        strip.sprites[i].alpha = 1;

        const lt = SYMBOL_LABELS[sym] ?? '';
        if (strip.labels[i].text !== lt) strip.labels[i].text = lt;
        strip.labels[i].x = rx + layout.cellW / 2;
        strip.labels[i].y = baseY + anim.bounceY + layout.cellH / 2;
        strip.labels[i].visible = true;
      }
    }
  }

  // ── Payline highlight (rope style) ──
  if (paylineGfx) {
    paylineGfx.clear();
  }
  if (paylineWins && currentPayline !== undefined && currentPayline >= 0 && currentPayline < paylineWins.length && paylineGfx) {
    const win = paylineWins[currentPayline];
    const linePattern = PAYLINE_PATTERNS[win.lineIndex];

    // Build points array for the payline path
    const pts: { x: number; y: number }[] = [];
    for (let r = 0; r < win.count; r++) {
      const row = linePattern[r];
      pts.push({
        x: layout.gridX + r * (layout.cellW + layout.gap) + layout.cellW / 2,
        y: layout.gridY + row * layout.cellStep + layout.cellH / 2,
      });
    }

    // White line connecting winning symbols
    for (let i = 0; i < pts.length - 1; i++) {
      paylineGfx.moveTo(pts[i].x, pts[i].y);
      paylineGfx.lineTo(pts[i + 1].x, pts[i + 1].y);
    }
    paylineGfx.stroke({ color: 0xffffff, width: 4, alpha: 0.9 });

    // White border around winning cells
    for (const pos of win.positions) {
      const x = layout.gridX + pos.reel * (layout.cellW + layout.gap);
      const y = layout.gridY + pos.row * layout.cellStep;
      paylineGfx.roundRect(x - 2, y - 2, layout.cellW + 4, layout.cellH + 4, 6);
      paylineGfx.stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
    }
  }

  // ── Wild feature highlight ──
  if (wildFeatureGfx) {
    wildFeatureGfx.clear();
    if (highlightWilds && highlightWilds.length > 0) {
      const t = (performance.now() % 1000) / 1000;
      const pulse = 0.5 + Math.sin(t * Math.PI * 2) * 0.3;

      for (const pos of highlightWilds) {
        const x = layout.gridX + pos.reel * (layout.cellW + layout.gap);
        const y = layout.gridY + pos.row * layout.cellStep;
        wildFeatureGfx.roundRect(x - 4, y - 4, layout.cellW + 8, layout.cellH + 8, 10);
        wildFeatureGfx.stroke({ color: 0xffd700, width: 4, alpha: pulse });
      }
    } else if (anticipatingReels && anticipatingReels.size > 0) {
      const t = (performance.now() % 600) / 600;
      const pulse = 0.4 + Math.sin(t * Math.PI * 2) * 0.35;

      for (const r of anticipatingReels) {
        const x = layout.gridX + r * (layout.cellW + layout.gap);
        const y = layout.gridY;
        wildFeatureGfx.roundRect(x - 6, y - 6, layout.cellW + 12, layout.totalH + 12, 12);
        wildFeatureGfx.fill({ color: 0xffd700, alpha: pulse * 0.15 });
      }
    }
  }

  // ── Win text ──
  if (winTextObj) {
    if (spinWin && spinWin > 0) {
      winTextObj.text = `+$${(spinWin / 100).toFixed(2)}`;
      winTextObj.x = layout.gridX + layout.totalW / 2;
      winTextObj.y = layout.gridY + layout.totalH + 30;
      winTextObj.visible = true;
    } else {
      winTextObj.visible = false;
    }
  }
}

export function destroyReelScene(): void {
  if (sceneRoot) {
    sceneRoot.destroy({ children: true });
    sceneRoot = null;
  }
  frameOverlay = null;
  reelStrips = [];
  paylineGfx = null;
  wildFeatureGfx = null;
  winTextObj = null;
  lastLayoutKey = '';
}
