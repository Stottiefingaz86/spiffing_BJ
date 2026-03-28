/**
 * Retained-mode grid renderer for Bamboo Fortunes.
 * Supports reel-spinning columns, cluster highlight, and scatter meter.
 */

import { Container, Graphics, Sprite, Text, TextStyle, Texture, type Renderer } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, WILD, SCATTER, SCATTER_TRIGGER } from '../engine/symbols';
import type { Grid } from '../engine/grid';
import type { SymbolMultiplier } from '../engine/symbolMultipliers';
import { getSymbolTexture } from './symbolTextures';
import {
  getColumnSpinInfo,
  getRandomSpinSymbol,
  getCellHighlightState,
  easeOutBack,
} from './gridAnimations';

const FRAME_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

/** Pixel size of `frame.png` (do not change unless the asset is replaced). */
const FRAME_NAT_W = 1536;
const FRAME_NAT_H = 1024;
/**
 * Inner window in texture space (pixels): maps to masked grid (gridW × gridH).
 * Larger OUTSET → wider inner in tex → lower scale → thinner gold. Was over-corrected with negative
 * values; ~10 tex narrower inner vs 44 ≈ a few screen px thicker gold (not the old −42 blow-up).
 */
const FRAME_INNER_OUTSET = 19;
const FRAME_INNER_X = 322 - FRAME_INNER_OUTSET;
const FRAME_INNER_Y = 127 - FRAME_INNER_OUTSET;
const FRAME_INNER_W = 898 + FRAME_INNER_OUTSET * 2;
const FRAME_INNER_H = 789 + FRAME_INNER_OUTSET * 2;

/**
 * `frame.png` often has transparent padding on the right; meter X is anchored inside that trim.
 * Texture px inward from full sprite right — larger = meter sits closer to the board.
 */
const FRAME_METER_ANCHOR_TRIM_X = 168;

/** Extra drawn height below the PNG (screen px) — lengthens the bottom gold ledge without retouching art. */
const FRAME_BOTTOM_EXTEND_PX = 2;

/**
 * Map the texture inner window to a screen rect slightly larger than the masked grid so the board
 * sits comfortably inside the art (fixes cramped bottom / bottom rail feeling clipped vs constants).
 */
const FRAME_INNER_PAD_X_FRAC = 0.055;
const FRAME_INNER_PAD_TOP_FRAC = 0.05;
/** Extra inner gap below cells vs top (art reads tight at bottom); keep moderate to limit total frame height on canvas. */
const FRAME_INNER_PAD_BOTTOM_FRAC = 0.1;

/**
 * Undersize the playfield so the ornate frame (taller than the inner mask) fits inside the Pixi
 * canvas; the host is flex‑1 in a dvh column so a few extra px of bottom gold were clipping.
 */
const GRID_LAYOUT_SCALE = 0.925;

/** Reserve space at bottom of canvas when vertically centering so frame overhang stays visible. */
const LAYOUT_BOTTOM_RESERVE_DESKTOP_FRAC = 0.034;
const LAYOUT_BOTTOM_RESERVE_DESKTOP_MIN = 36;

let frameTexture: Texture | null = null;
let frameTextureLoading = false;

async function loadFrameTexture(): Promise<void> {
  if (frameTexture || frameTextureLoading) return;
  frameTextureLoading = true;
  try {
    const url = `${FRAME_BASE}bamboofortunes/frame.png`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
    frameTexture = Texture.from(img);
    frameTexture.source.scaleMode = 'linear';
  } catch {
    frameTexture = null;
  }
  frameTextureLoading = false;
}

const METER_SEGMENTS = SCATTER_TRIGGER;

/** Vertical gap between meter bottom and grid mask top (mobile). 0 = flush / touching. */
const MOBILE_SCATTER_METER_GAP = 0;

/** Min space from canvas top to scatter meter (mobile), as fraction of canvas height. */
const MOBILE_METER_TOP_MARGIN_FRAC = 0.05;

function mobileScatterMeterBandHeight(canvasW: number): number {
  return Math.max(40, Math.min(52, Math.round(canvasW * 0.102)));
}

export interface GridLayout {
  gridX: number;
  gridY: number;
  cellSize: number;
  gap: number;
  isMobile: boolean;
  /** Y of top edge of scatter meter band (mobile only; 0 on desktop). */
  scatterMeterTop: number;
  /** Inner band height for horizontal meter (mobile only; 0 on desktop). */
  mobileMeterBandH: number;
}

export function computeGridLayout(canvasW: number, canvasH: number): GridLayout {
  const isMobile = canvasW < 768;
  const hPad = isMobile ? canvasW * 0.02 : canvasW * 0.065;
  const vPad = isMobile ? canvasH * 0.008 : canvasH * 0.056;
  const mobileBottomReserve = isMobile ? Math.max(64, Math.round(canvasH * 0.065)) : 0;
  const layoutBottomReserve = isMobile
    ? 0
    : Math.max(LAYOUT_BOTTOM_RESERVE_DESKTOP_MIN, Math.round(canvasH * LAYOUT_BOTTOM_RESERVE_DESKTOP_FRAC));

  const mobileMeterBandH = isMobile ? mobileScatterMeterBandHeight(canvasW) : 0;
  const mobileMeterTopMargin = isMobile
    ? Math.round(canvasH * MOBILE_METER_TOP_MARGIN_FRAC)
    : 0;
  /** Reserve top margin + horizontal meter + gap + ~2× mask pad (mobile). */
  const mobileMeterBlock = isMobile
    ? mobileMeterTopMargin +
      mobileMeterBandH +
      MOBILE_SCATTER_METER_GAP +
      Math.max(14, Math.round(canvasW * 0.036))
    : 0;

  const meterExtra = isMobile ? 0 : canvasW * 0.035;
  const availW = canvasW - hPad * 2 - meterExtra;
  const availH = canvasH - vPad * 2 - mobileBottomReserve - mobileMeterBlock;
  const totalGapRatio = 0.06;
  const cellWithGapW = availW / GRID_COLS;
  const cellWithGapH = availH / GRID_ROWS;
  const cellWithGap = Math.min(cellWithGapW, cellWithGapH) * GRID_LAYOUT_SCALE;
  const gap = cellWithGap * totalGapRatio;
  const cellSize = cellWithGap - gap;
  const totalW = GRID_COLS * (cellSize + gap) - gap;
  const totalH = GRID_ROWS * (cellSize + gap) - gap;
  const bgPad = Math.max(cellSize * 0.03, gap * 0.98);
  const gridBodyH = totalH + bgPad * 2;

  const gridX = isMobile ? (canvasW - totalW) / 2 : (canvasW - totalW - meterExtra) / 2;

  let gridY: number;
  let scatterMeterTop = 0;
  if (isMobile) {
    const innerH = canvasH - mobileBottomReserve;
    const contentH = mobileMeterBandH + MOBILE_SCATTER_METER_GAP + gridBodyH;
    const centeredMeterTop = Math.max(vPad * 0.5, (innerH - contentH) / 2);
    scatterMeterTop = Math.max(mobileMeterTopMargin, centeredMeterTop);
    gridY = scatterMeterTop + mobileMeterBandH + MOBILE_SCATTER_METER_GAP + bgPad;
  } else {
    gridY =
      (canvasH - mobileBottomReserve - layoutBottomReserve - totalH) / 2 - 6;
  }

  return {
    gridX: Math.round(gridX),
    gridY: Math.round(gridY),
    cellSize,
    gap,
    isMobile,
    scatterMeterTop: Math.round(scatterMeterTop),
    mobileMeterBandH,
  };
}

const CELL_COUNT = GRID_ROWS * GRID_COLS;
const BASE_LABEL_SIZE = 32;
const BASE_BADGE_SIZE = 20;
const BASE_METER_SIZE = 18;

let _root: Container | null = null;

let frameSprite: Sprite;
let bgGfx: Graphics;
let cellBgGfx: Graphics;
let maskGfx: Graphics;
let symContainer: Container;
let glowGfx: Graphics;

const cellSprites: Sprite[] = [];
const cellLabels: Text[] = [];
const multBadgeBgs: Graphics[] = [];
const multBadgeTexts: Text[] = [];

let particleGfx: Graphics;

let meterGfx: Graphics;
const meterNumTexts: Text[] = [];

let prevLayoutKey = '';
let prevWinKey = '';
let prevMeterKey = '';
const prevCellSyms: (string | null)[] = [];

export function initGridScene(root: Container, _renderer: Renderer): void {
  destroyGridScene();
  _root = root;

  loadFrameTexture();

  bgGfx = new Graphics();
  root.addChild(bgGfx);

  cellBgGfx = new Graphics();
  root.addChild(cellBgGfx);

  maskGfx = new Graphics();
  root.addChild(maskGfx);

  symContainer = new Container();
  symContainer.mask = maskGfx;
  root.addChild(symContainer);

  glowGfx = new Graphics();
  symContainer.addChild(glowGfx);

  const labelStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_LABEL_SIZE,
    fontWeight: '800',
    fill: 0xffffff,
    align: 'center',
  });
  const badgeStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_BADGE_SIZE,
    fontWeight: '900',
    fill: 0xffe44a,
    stroke: { color: 0xc9a008, width: 1 },
    dropShadow: {
      alpha: 0.9,
      angle: Math.PI / 4,
      blur: 0,
      color: 0xcc3d00,
      distance: 2.5,
    },
  });

  for (let i = 0; i < CELL_COUNT; i++) {
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.visible = false;
    symContainer.addChild(sp);
    cellSprites.push(sp);

    const lb = new Text({ text: '', style: labelStyle });
    lb.anchor.set(0.5);
    lb.visible = false;
    symContainer.addChild(lb);
    cellLabels.push(lb);

    const bbg = new Graphics();
    bbg.visible = false;
    symContainer.addChild(bbg);
    multBadgeBgs.push(bbg);

    const bt = new Text({ text: '', style: badgeStyle });
    bt.anchor.set(0.5);
    bt.visible = false;
    symContainer.addChild(bt);
    multBadgeTexts.push(bt);
  }

  particleGfx = new Graphics();
  root.addChild(particleGfx);

  frameSprite = new Sprite();
  frameSprite.visible = false;
  root.addChild(frameSprite);

  // Scatter meter (above frame so numbers stay readable)
  meterGfx = new Graphics();
  root.addChild(meterGfx);

  const meterStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_METER_SIZE,
    fontWeight: '900',
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 3 },
  });
  for (let i = 0; i < METER_SEGMENTS; i++) {
    const mt = new Text({ text: `${i + 1}`, style: meterStyle });
    mt.anchor.set(0.5);
    root.addChild(mt);
    meterNumTexts.push(mt);
  }

  prevLayoutKey = '';
  prevWinKey = '';
  prevMeterKey = '';
  prevCellSyms.length = CELL_COUNT;
  prevCellSyms.fill(null);
}

export function updateGridScene(
  renderer: Renderer,
  grid: Grid,
  symbolMultipliers: SymbolMultiplier[],
  layout: GridLayout,
  winningCellIds?: Set<number>,
  inFreeSpins?: boolean,
  scatterCount?: number,
): void {
  if (!_root) return;

  const { gridX, gridY, cellSize, gap, isMobile, scatterMeterTop, mobileMeterBandH } = layout;
  const step = cellSize + gap;
  /** Margin inside the mask; keep small so playfield hugs the frame (was gap*2). */
  const bgPad = Math.max(cellSize * 0.03, gap * 0.98);
  const gridW = GRID_COLS * step - gap + bgPad * 2;
  const gridH = GRID_ROWS * step - gap + bgPad * 2;

  const framePadX = Math.max(2, cellSize * FRAME_INNER_PAD_X_FRAC);
  const framePadTop = Math.max(2, cellSize * FRAME_INNER_PAD_TOP_FRAC);
  const framePadBottom = Math.max(3, cellSize * FRAME_INNER_PAD_BOTTOM_FRAC);
  const innerScreenW = gridW + framePadX * 2;
  const innerScreenH = gridH + framePadTop + framePadBottom;
  const innerOriginX = gridX - bgPad - framePadX;
  const innerOriginY = gridY - bgPad - framePadTop;

  const borderW = Math.max(18, cellSize * 0.24);
  const outerPad = bgPad + borderW;
  const outerW = gridW + borderW * 2;
  const outerH = gridH + borderW * 2;
  const outerR = 18;
  const innerR = 12;

  const frameOuter = inFreeSpins ? 0xffcc44 : 0xdaa520;
  const frameMid = inFreeSpins ? 0xcc9900 : 0xb8860b;
  const frameInner = inFreeSpins ? 0x8b6914 : 0x704a0a;
  const multSymbols = new Set(symbolMultipliers.map((m) => m.symbol as string));
  const multMap = new Map(symbolMultipliers.map((m) => [m.symbol as string, m.multiplier]));

  /** PNG frame bounds from layout only — sprite + meter anchor stay aligned when `frame.png` loads after first paint. */
  const frameScaleX = innerScreenW / FRAME_INNER_W;
  const frameScaleY = innerScreenH / FRAME_INNER_H;
  const frameFw = FRAME_NAT_W * frameScaleX;
  const frameFhBase = FRAME_NAT_H * frameScaleY;
  const frameFh = frameFhBase + FRAME_BOTTOM_EXTEND_PX;
  const syDisplay = frameFh / FRAME_NAT_H;
  const frameFx = innerOriginX - FRAME_INNER_X * frameScaleX;
  /** Keep inner top aligned; extra height hangs below (bottom ledge ~2px longer). */
  const frameFy = innerOriginY - FRAME_INNER_Y * syDisplay;
  /** Visible gold rim ~trim inside full texture width — meter sits here so it does not float in PNG padding. */
  const frameMeterAnchorX =
    frameFx + frameFw - FRAME_METER_ANCHOR_TRIM_X * frameScaleX;

  const lk = `${gridX | 0}:${gridY | 0}:${cellSize | 0}:${inFreeSpins ? 1 : 0}:${isMobile ? 1 : 0}`;
  const layoutChanged = lk !== prevLayoutKey;

  let winKey = '';
  if (winningCellIds && winningCellIds.size > 0) {
    const arr: number[] = [];
    for (const id of winningCellIds) arr.push(id);
    arr.sort((a, b) => a - b);
    winKey = arr.join(',');
  }
  const winChanged = winKey !== prevWinKey;

  // ── Grid background + frame (on layout change) ──
  if (layoutChanged) {
    prevLayoutKey = lk;
    bgGfx.clear();

    const ox = gridX - outerPad;
    const oy = gridY - outerPad;

    if (frameTexture) {
      frameSprite.texture = frameTexture;
      frameSprite.x = frameFx;
      frameSprite.y = frameFy;
      frameSprite.width = frameFw;
      frameSprite.height = frameFh;
      frameSprite.visible = true;
    } else {
      frameSprite.visible = false;
      bgGfx.roundRect(ox - 3, oy - 3, outerW + 6, outerH + 6, outerR + 2);
      bgGfx.fill({ color: frameMid, alpha: 0.35 });

      const layers = 6;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const inset = borderW * t;
        const w = borderW / layers + 1;
        const r = outerR - (outerR - innerR) * t;
        const color = t < 0.33 ? frameOuter : t < 0.66 ? frameMid : frameInner;
        bgGfx.roundRect(ox + inset, oy + inset, outerW - inset * 2, outerH - inset * 2, Math.max(r, 4));
        bgGfx.stroke({ color, width: w });
      }

      bgGfx.roundRect(ox, oy, outerW, outerH, outerR);
      bgGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.3 });
    }

    bgGfx.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, innerR);
    bgGfx.fill({ color: inFreeSpins ? 0x1a0d06 : 0x0a1a0e, alpha: 0.85 });

    maskGfx.clear();
    maskGfx.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, innerR);
    maskGfx.fill({ color: 0xffffff });
  } else if (frameTexture && !frameSprite.visible) {
    // Frame loaded async — apply it on next layout pass
    prevLayoutKey = '';
  }

  // ── Scatter meter (redraws on layout or count change) ──
  const sc = scatterCount ?? 0;
  const meterKey = `${lk}:${sc}`;
  if (layoutChanged) prevMeterKey = '';
  if (meterKey !== prevMeterKey) {
    prevMeterKey = meterKey;
    meterGfx.clear();

    if (isMobile) {
      const mTop = scatterMeterTop;
      const meterTotalH = mobileMeterBandH;
      const mx = gridX - bgPad;
      const mw = gridW;
      const meterBorderW = Math.max(5, meterTotalH * 0.15);
      const mr = 8;

      meterGfx.roundRect(mx - 2, mTop - 2, mw + 4, meterTotalH + 4, mr + 2);
      meterGfx.fill({ color: frameMid, alpha: 0.35 });

      const mLayers = 5;
      for (let i = 0; i < mLayers; i++) {
        const t = i / (mLayers - 1);
        const inset = meterBorderW * t;
        const w = meterBorderW / mLayers + 0.5;
        const r = mr - (mr - 4) * t;
        const color = t < 0.33 ? frameOuter : t < 0.66 ? frameMid : frameInner;
        meterGfx.roundRect(mx + inset, mTop + inset, mw - inset * 2, meterTotalH - inset * 2, Math.max(r, 3));
        meterGfx.stroke({ color, width: w });
      }

      meterGfx.roundRect(mx, mTop, mw, meterTotalH, mr);
      meterGfx.stroke({ color: 0xffffff, width: 1.25, alpha: 0.28 });

      const bx = mx + meterBorderW;
      const by = mTop + meterBorderW;
      const bw = mw - meterBorderW * 2;
      const bh = meterTotalH - meterBorderW * 2;
      const br = 5;

      const trackFill = inFreeSpins ? 0x1a0d06 : 0x0a140f;
      meterGfx.roundRect(bx, by, bw, bh, br);
      meterGfx.fill({ color: trackFill, alpha: 0.92 });
      meterGfx.roundRect(bx, by, bw, bh, br);
      meterGfx.stroke({ color: 0x0a1a08, width: 2 });
      meterGfx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, br - 1);
      meterGfx.stroke({ color: frameMid, width: 1, alpha: 0.45 });

      const segPad = 2;
      const segGap = 1.25;
      const segTotalW = bw - segPad * 2;
      const segW = (segTotalW - segGap * (METER_SEGMENTS - 1)) / METER_SEGMENTS;
      const segH = bh - segPad * 2;
      const textScale = Math.min(segW * 0.58, segH * 0.72) / BASE_METER_SIZE;

      for (let i = 0; i < METER_SEGMENTS; i++) {
        const num = i + 1;
        const filled = num <= sc;
        const sx = bx + segPad + i * (segW + segGap);

        if (filled) {
          const goldT = num / METER_SEGMENTS;
          const goldBright = goldT < 0.5 ? 0xffd700 : 0xcc8800;
          meterGfx.roundRect(sx, by + segPad, segW, segH, 3);
          meterGfx.fill({ color: goldBright });
          meterGfx.roundRect(sx + 1, by + segPad + 1, segW - 2, segH * 0.42, 2);
          meterGfx.fill({ color: 0xffee88, alpha: 0.4 });
        } else {
          const dimT = num / METER_SEGMENTS;
          const dimColor = dimT > 0.55 ? 0x2a1810 : 0x352218;
          meterGfx.roundRect(sx, by + segPad, segW, segH, 3);
          meterGfx.fill({ color: dimColor });
          meterGfx.roundRect(sx + 1, by + segPad + 1, segW - 2, segH * 0.32, 2);
          meterGfx.fill({ color: 0x5c3d24, alpha: 0.22 });
        }

        const mt = meterNumTexts[num - 1];
        mt.x = sx + segW / 2;
        mt.y = by + segPad + segH / 2;
        mt.scale.set(textScale);
        (mt.style as TextStyle).fill = filled ? 0x2a1a00 : 0xf5edd8;
        (mt.style as TextStyle).stroke = filled
          ? { color: 0xffee88, width: 1.5 }
          : { color: 0x000000, width: 2 };
      }
    } else {
      const meterInnerW = Math.max(26, cellSize * 0.48);
      const meterBorderW = Math.max(9, borderW * 0.5);
      const meterGap = Math.max(0, borderW * 0.012);
      const meterTotalW = meterInnerW + meterBorderW * 2;

      const mx = frameMeterAnchorX + meterGap;
      const meterVPad = Math.max(18, frameFh * 0.08);
      const my = frameFy + meterVPad;
      const mh = frameFh - meterVPad * 2;
      const mr = 12;

      meterGfx.roundRect(mx - 3, my - 3, meterTotalW + 6, mh + 6, mr + 3);
      meterGfx.fill({ color: frameMid, alpha: 0.35 });

      const mLayers = 6;
      for (let i = 0; i < mLayers; i++) {
        const t = i / (mLayers - 1);
        const inset = meterBorderW * t;
        const w = meterBorderW / mLayers + 0.6;
        const r = mr - (mr - 5) * t;
        const color = t < 0.33 ? frameOuter : t < 0.66 ? frameMid : frameInner;
        meterGfx.roundRect(mx + inset, my + inset, meterTotalW - inset * 2, mh - inset * 2, Math.max(r, 4));
        meterGfx.stroke({ color, width: w });
      }

      meterGfx.roundRect(mx, my, meterTotalW, mh, mr);
      meterGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.28 });

      const bx = mx + meterBorderW;
      const by = my + meterBorderW;
      const bw = meterInnerW;
      const bh = mh - meterBorderW * 2;
      const br = 6;

      const trackFill = inFreeSpins ? 0x1a0d06 : 0x0a140f;
      meterGfx.roundRect(bx, by, bw, bh, br);
      meterGfx.fill({ color: trackFill, alpha: 0.92 });
      meterGfx.roundRect(bx, by, bw, bh, br);
      meterGfx.stroke({ color: 0x0a1a08, width: 2.5 });
      meterGfx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, br - 1);
      meterGfx.stroke({ color: frameMid, width: 1, alpha: 0.45 });

      const segPad = 2;
      const segGap = 1.5;
      const segTotalH = bh - segPad * 2;
      const segH = (segTotalH - segGap * (METER_SEGMENTS - 1)) / METER_SEGMENTS;
      const segW = bw - segPad * 2;

      const textScale = Math.min(segH * 0.65, segW * 0.6) / BASE_METER_SIZE;

      for (let i = 0; i < METER_SEGMENTS; i++) {
        const num = METER_SEGMENTS - i;
        const filled = num <= sc;
        const sy = by + segPad + i * (segH + segGap);

        if (filled) {
          const goldT = num / METER_SEGMENTS;
          const goldBright = goldT < 0.5 ? 0xffd700 : 0xcc8800;
          meterGfx.roundRect(bx + segPad, sy, segW, segH, 3);
          meterGfx.fill({ color: goldBright });
          meterGfx.roundRect(bx + segPad + 1, sy + 1, segW - 2, segH * 0.45, 2);
          meterGfx.fill({ color: 0xffee88, alpha: 0.4 });
        } else {
          const dimT = num / METER_SEGMENTS;
          const dimColor = dimT > 0.55 ? 0x2a1810 : 0x352218;
          meterGfx.roundRect(bx + segPad, sy, segW, segH, 3);
          meterGfx.fill({ color: dimColor });
          meterGfx.roundRect(bx + segPad + 1, sy + 1, segW - 2, segH * 0.35, 2);
          meterGfx.fill({ color: 0x5c3d24, alpha: 0.22 });
        }

        const mt = meterNumTexts[num - 1];
        mt.x = bx + bw / 2;
        mt.y = sy + segH / 2;
        mt.scale.set(textScale);
        (mt.style as TextStyle).fill = filled ? 0x2a1a00 : 0xf5edd8;
        (mt.style as TextStyle).stroke = filled
          ? { color: 0xffee88, width: 2 }
          : { color: 0x000000, width: 2.5 };
      }
    }
  }

  const hasWinners = winningCellIds && winningCellIds.size > 0;

  // ── Cell backgrounds ──
  if (layoutChanged || winChanged) {
    prevWinKey = winKey;
    cellBgGfx.clear();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cx = gridX + c * step;
        const cy = gridY + r * step;
        const cell = grid[r]?.[c];
        const isWin = cell && winningCellIds?.has(cell.id);
        if (isWin) {
          // Green neon glow — outer
          cellBgGfx.roundRect(cx - 4, cy - 4, cellSize + 8, cellSize + 8, 12);
          cellBgGfx.fill({ color: 0x00ff44, alpha: 0.15 });
          // Green neon glow — mid
          cellBgGfx.roundRect(cx - 2, cy - 2, cellSize + 4, cellSize + 4, 10);
          cellBgGfx.fill({ color: 0x00ff44, alpha: 0.2 });
          // Dark cell bg
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x0a1a0e, alpha: 0.7 });
          // Bright green neon border
          cellBgGfx.roundRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2, 7);
          cellBgGfx.stroke({ color: 0x44ff66, width: 2.5 });
          // Inner white highlight
          cellBgGfx.roundRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4, 6);
          cellBgGfx.stroke({ color: 0xaaffbb, width: 1, alpha: 0.4 });
        } else if (hasWinners) {
          // Heavily dimmed non-winning cells
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x030806, alpha: 0.75 });
        } else {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x0d1a10, alpha: 0.5 });
          cellBgGfx.roundRect(cx + 0.5, cy + 0.5, cellSize - 1, cellSize - 1, 7.5);
          cellBgGfx.stroke({ color: 0x1a2e1e, width: 1, alpha: 0.3 });
        }
      }
    }
  }

  glowGfx.clear();

  // ── Draw cells (reel spin or static) ──
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      const cell = grid[r]?.[c];
      const sp = cellSprites[i];
      const lb = cellLabels[i];
      const bbg = multBadgeBgs[i];
      const bt = multBadgeTexts[i];

      if (!cell) {
        sp.visible = false;
        lb.visible = false;
        bbg.visible = false;
        bt.visible = false;
        continue;
      }

      const colSpin = getColumnSpinInfo(c);
      const bx = gridX + c * step + cellSize / 2;
      const by = gridY + r * step + cellSize / 2;

      if (colSpin && colSpin.phase === 'spinning') {
        const randomSym = getRandomSpinSymbol(colSpin.seed, colSpin.cycleIndex, r, c);
        sp.texture = getSymbolTexture(renderer, randomSym);
        sp.visible = true;
        sp.x = bx;
        const oscillation = colSpin.anticipation
          ? Math.sin(colSpin.cycleIndex * 2.5 + r * 0.3) * 6
          : Math.sin(colSpin.cycleIndex * 0.8 + r * 0.5) * 2;
        sp.y = by + oscillation;
        const targetSize = cellSize * 0.92;
        const texW = sp.texture.width || 1;
        const texH = sp.texture.height || 1;
        const aspect = texW / texH;
        if (aspect >= 1) { sp.width = targetSize; sp.height = targetSize / aspect; }
        else { sp.height = targetSize; sp.width = targetSize * aspect; }
        sp.alpha = colSpin.anticipation ? 0.35 : 0.7;

        lb.visible = false;
        bbg.visible = false;
        bt.visible = false;
        prevCellSyms[i] = null;
        continue;
      }

      if (colSpin && colSpin.phase === 'landing') {
        const t = colSpin.landProgress;
        const ease = easeOutBack(t);
        const startY = by - cellSize * 1.5;
        const currentY = startY + (by - startY) * ease;
        const scaleEase = 0.5 + 0.5 * Math.min(1, t * 2);

        sp.texture = getSymbolTexture(renderer, cell.symbol);
        sp.visible = true;
        sp.x = bx;
        sp.y = currentY;
        const landScale = cell.symbol === WILD ? 0.96 : 0.92;
        const targetSize = cellSize * landScale * scaleEase;
        const texW = sp.texture.width || 1;
        const texH = sp.texture.height || 1;
        const aspect = texW / texH;
        if (aspect >= 1) { sp.width = targetSize; sp.height = targetSize / aspect; }
        else { sp.height = targetSize; sp.width = targetSize * aspect; }
        sp.alpha = 1;

        lb.visible = false;
        bbg.visible = false;
        bt.visible = false;
        prevCellSyms[i] = null;
        continue;
      }

      // Stopped or no spin — normal rendering
      if (prevCellSyms[i] !== cell.symbol) {
        sp.texture = getSymbolTexture(renderer, cell.symbol);
        prevCellSyms[i] = cell.symbol;
      }

      const highlight = getCellHighlightState(cell.id);
      let scale = 1;
      let alpha = 1;
      if (highlight) {
        scale = highlight.scale;
        alpha = highlight.alpha;
      }

      // No per-frame circle glow for wins — green neon border handles it

      const isWinCell = winningCellIds?.has(cell.id);
      const dimFactor = hasWinners && !isWinCell ? 0.25 : 1;

      const spriteScale = cell.symbol === WILD ? 0.96 : 0.92;
      sp.visible = true;
      sp.x = bx;
      sp.y = by;
      const targetSize = cellSize * spriteScale * scale;
      const texW = sp.texture.width || 1;
      const texH = sp.texture.height || 1;
      const aspect = texW / texH;
      if (aspect >= 1) { sp.width = targetSize; sp.height = targetSize / aspect; }
      else { sp.height = targetSize; sp.width = targetSize * aspect; }
      sp.alpha = alpha * dimFactor;

      lb.visible = false;

      const hasMultiplier = cell.symbol !== WILD && cell.symbol !== SCATTER && multSymbols.has(cell.symbol);
      if (hasMultiplier && !colSpin) {
        const mult = multMap.get(cell.symbol) ?? 1;
        const barW = cellSize * 0.86;
        const barH = Math.max(16, cellSize * 0.2);
        const cellTop = gridY + r * step;
        const left = bx - barW / 2;
        const top = cellTop + cellSize - barH - cellSize * 0.06;

        bbg.clear();
        bbg.roundRect(left, top, barW, barH, 3);
        bbg.fill({ color: 0x120a08, alpha: 0.82 });
        bbg.roundRect(left, top, barW, barH, 3);
        bbg.stroke({ color: 0xff9a2e, width: 1.2, alpha: 0.55 });

        const lineH = Math.max(1.5, barH * 0.12);
        bbg.rect(left + 2, top + 1.5, barW - 4, lineH);
        bbg.fill({ color: 0xffcc66, alpha: 0.95 });
        bbg.rect(left + 2, top + 2.2, barW - 4, lineH * 0.45);
        bbg.fill({ color: 0xfff0b0, alpha: 0.35 });

        bbg.rect(left + 2, top + barH - 1.5 - lineH, barW - 4, lineH);
        bbg.fill({ color: 0xff9933, alpha: 0.9 });
        bbg.rect(left + 2, top + barH - 1.5 - lineH * 0.55, barW - 4, lineH * 0.45);
        bbg.fill({ color: 0xffe4a0, alpha: 0.4 });

        bbg.visible = true;
        bbg.alpha = alpha;

        const ms = `X${mult}`;
        if (bt.text !== ms) bt.text = ms;
        bt.x = bx;
        bt.y = top + barH / 2;
        bt.scale.set(Math.min((barW * 0.42) / BASE_BADGE_SIZE, (barH * 0.62) / BASE_BADGE_SIZE));
        bt.visible = true;
        bt.alpha = alpha;
      } else {
        bbg.visible = false;
        bt.visible = false;
      }
    }
  }

  particleGfx.clear();
}

export function destroyGridScene(): void {
  cellSprites.length = 0;
  cellLabels.length = 0;
  multBadgeBgs.length = 0;
  multBadgeTexts.length = 0;
  meterNumTexts.length = 0;
  if (_root && !(_root as any).destroyed) {
    _root.removeChildren();
  }
  _root = null;
  prevLayoutKey = '';
  prevWinKey = '';
  prevMeterKey = '';
  prevCellSyms.length = 0;
}

export function drawGridScene(
  root: Container,
  renderer: Renderer,
  grid: Grid,
  symbolMultipliers: SymbolMultiplier[],
  layout: GridLayout,
  winningCellIds?: Set<number>,
  inFreeSpins?: boolean,
  scatterCount?: number,
): void {
  if (!_root || _root !== root) initGridScene(root, renderer);
  updateGridScene(renderer, grid, symbolMultipliers, layout, winningCellIds, inFreeSpins, scatterCount);
}
