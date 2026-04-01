import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type Renderer,
} from 'pixi.js';
import { REELS, ROWS, SYMBOL_COLORS, SYMBOL_LABELS, TempleSymbol } from '../engine/symbols';
import type { Grid } from '../engine/grid';
import { isSpinPaddingCell } from '../engine/grid';
import {
  getCascadeFallTileSymbol,
  getCellAnimState,
  getFallAnimForCell,
  getParticles,
  getFloatingWins,
  getSpinExplodeOrphans,
} from './gridAnimations';
import { getAztecSymbolTexture } from './aztecSymbolTextures';
import { AZTEC_FRAME_SPRITE_TOP_OUTSET_PX, QR_DEBUG_SHOW_REEL_MASK } from './aztecLayout';
import {
  computeAztecStageLayout,
  type AztecStageLayout,
} from './aztecStageLayout';
import { aztecPublicBase } from './aztecPublicBase';

export type { AztecStageLayout };

export interface GridLayout {
  gridX: number;
  gridY: number;
  /** Cells tile the mask window on `frame.png` (5×3); Pixi mask matches that opening. */
  cellW: number;
  cellH: number;
  gap: number;
}

export function computeGridLayout(canvasW: number, canvasH: number): GridLayout {
  const s = computeAztecStageLayout(canvasW, canvasH);
  return {
    gridX: s.gridX,
    gridY: s.gridY,
    cellW: s.cellW,
    cellH: s.cellH,
    gap: s.gap,
  };
}

const FRAME_URL = `${aztecPublicBase()}aztec/frame.png`;

/** Draw frame art slightly past the layout box: +2px each side, small top (see `AZTEC_FRAME_SPRITE_TOP_OUTSET_PX`), +3px below. */
const AZTEC_FRAME_OUTSET_X = 2;
const AZTEC_FRAME_OUTSET_BOTTOM = 7;

let cachedFrameTex: Texture | null | undefined;
let frameSprite: Sprite | null = null;

/** Linear + mipmaps + anisotropy before first GPU bind — smoother frame edges when scaled. */
function configureAztecFrameSampling(tex: Texture): void {
  const src = tex.source;
  src.autoGenerateMipmaps = true;
  src.scaleMode = 'linear';
  src.maxAnisotropy = 8;
}

export async function loadAztecFrameTexture(): Promise<void> {
  if (cachedFrameTex === undefined) {
    try {
      cachedFrameTex = await Assets.load<Texture>(FRAME_URL);
      if (cachedFrameTex) configureAztecFrameSampling(cachedFrameTex);
    } catch {
      cachedFrameTex = null;
    }
  }
  if (frameSprite && cachedFrameTex) {
    frameSprite.texture = cachedFrameTex;
    frameSprite.visible = true;
    configureAztecFrameSampling(cachedFrameTex);
  }
}

function minCellDim(layout: GridLayout): number {
  return Math.min(layout.cellW, layout.cellH);
}

/** Base game avalanche caps at ×5; free falls use ×3 steps up to ×15. */
const MULT_TIERS_BASE = [1, 2, 3, 4, 5] as const;
const MULT_TIERS_FREE = [3, 6, 9, 12, 15] as const;

function parseMultiplierFromLabel(label: string): number {
  const normalized = label.replace(/[×✕]/g, 'x').trim();
  const xm = normalized.match(/x\s*(\d+)/i);
  if (xm) return Math.max(1, parseInt(xm[1], 10));
  const any = normalized.match(/(\d+)/);
  if (any) return Math.max(1, parseInt(any[1], 10));
  return 1;
}

const CELL_COUNT = REELS * ROWS;
/** Spin clear can overlap many explode drop-outs; pool must cover full grid so tiles don’t vanish mid-fall. */
const SPIN_ORPHAN_POOL = CELL_COUNT;
const BASE_LABEL = 22;

/** Text placeholders only — textures stay geometrically centered (avoids gap above PNG tiles). */
function symbolLabelOffsetY(minDim: number): number {
  return Math.max(4, Math.min(16, Math.round(minDim * 0.035)));
}

/**
 * Scale factor so bitmap **covers** the cell (clips overflow). `Math.min` (contain) preserves
 * aspect ratio but letterboxes → dark strips between tiles read as gaps.
 * Exported for Bandits-style reel strips (`aztecDrawReels`) to match settled grid sizing.
 */
export function symbolTextureCoverFit(maxW: number, maxH: number, texW: number, texH: number): number {
  return Math.max(maxW / texW, maxH / texH) * 1.015;
}

/** Vertical nudge for symbol art in cell (0 = geometric center; tweak if a PNG sits optically low). */
export function symbolTextureOpticalOffsetY(_minDim: number): number {
  return 0;
}

/** Keep glyphs inside small cells (mobile / short playfield). */
function symbolFitForCellSize(cellSize: number): { padRatio: number; fontPx: number; strokeW: number } {
  const baseFont = BASE_LABEL * (cellSize / 72);
  const maxByCell = cellSize * 0.32;
  let fontPx = Math.round(Math.max(10, Math.min(baseFont, maxByCell)));
  let padRatio = 0.1;
  let strokeW = Math.max(2, cellSize * 0.038);
  if (cellSize < 46) {
    padRatio = 0.2;
    fontPx = Math.round(Math.min(fontPx, cellSize * 0.26));
    strokeW = Math.max(1, cellSize * 0.045);
  } else if (cellSize < 58) {
    padRatio = 0.16;
    fontPx = Math.round(Math.min(fontPx, cellSize * 0.29));
    strokeW = Math.max(1.25, cellSize * 0.042);
  } else if (cellSize < 72) {
    padRatio = 0.13;
    strokeW = Math.max(1.5, cellSize * 0.04);
  }
  return { padRatio, fontPx, strokeW };
}

let _root: Container | null = null;
let bgGfx: Graphics;
/** Fallback rect clip until `mask.png` loads; removed after shaped mask is ready. */
let reelClipMask: Graphics | null = null;
/** Shaped reel window from processed `mask.png` (Pixi uses red channel). */
let reelMaskSprite: Sprite | null = null;
let reelShapeMaskLoaded = false;
let symContainer: Container | null = null;
/** Sibling of symContainer — Bandits-style reel strips during spin; same mask as symContainer. */
let reelSpinOverlay: Container | null = null;
/** Darkens the inner edges of the reel window so symbols read recessed (frame art is opaque, not an overlay). */
let recessGfx: Graphics | null = null;
let glowGfx: Graphics;
const cellBacks: Graphics[] = [];
const cellSymbolSprites: Sprite[] = [];
const cellLabels: Text[] = [];
const orphanCellBacks: Graphics[] = [];
const orphanSymSprites: Sprite[] = [];
const orphanCellLabels: Text[] = [];
let particleGfx: Graphics;
const floatTexts: Text[] = [];
let multPill: Container;
let multBg: Graphics;
let multTitle: Text;
const multSegTexts: Text[] = [];
/** Debug: magenta tint of shaped mask, or rect fallback before load. */
let debugReelMaskSprite: Sprite | null = null;
let debugReelMaskGfx: Graphics | null = null;

let prevLayoutKey = '';
let prevCellIds: (number | null)[] = [];

export function initGridScene(root: Container): void {
  destroyGridScene();
  _root = root;

  frameSprite = new Sprite(Texture.WHITE);
  frameSprite.visible = false;
  /** Warm stone toward jungle bg; eases harsh grey vs bg grade mismatch */
  frameSprite.tint = 0xd8d0c8;

  bgGfx = new Graphics();
  root.addChild(bgGfx);

  reelClipMask = new Graphics();
  root.addChild(reelClipMask);

  reelMaskSprite = new Sprite();
  reelMaskSprite.visible = false;
  root.addChild(reelMaskSprite);

  symContainer = new Container();
  /** Rect fallback first; swapped to `reelMaskSprite` when `mask.png` is processed. */
  symContainer.mask = reelClipMask;
  root.addChild(symContainer);

  reelSpinOverlay = new Container();
  reelSpinOverlay.mask = reelClipMask;
  reelSpinOverlay.visible = false;
  root.addChild(reelSpinOverlay);

  recessGfx = new Graphics();
  symContainer.addChild(recessGfx);

  glowGfx = new Graphics();

  const labelStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_LABEL,
    fontWeight: '800',
    fill: 0xf5f0e6,
    align: 'center',
    stroke: { color: 0x1a1208, width: 3 },
  });

  /** All backs first, then glow, then sprites — so scaled symbols are not covered by neighboring cell backs. */
  for (let i = 0; i < CELL_COUNT; i++) {
    const g = new Graphics();
    symContainer.addChild(g);
    cellBacks.push(g);
  }
  symContainer.addChild(glowGfx);
  for (let i = 0; i < CELL_COUNT; i++) {
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.visible = false;
    symContainer.addChild(sp);
    cellSymbolSprites.push(sp);
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    const lb = new Text({ text: '', style: labelStyle });
    lb.anchor.set(0.5);
    symContainer.addChild(lb);
    cellLabels.push(lb);
  }

  for (let i = 0; i < SPIN_ORPHAN_POOL; i++) {
    const g = new Graphics();
    symContainer.addChild(g);
    orphanCellBacks.push(g);
  }
  for (let i = 0; i < SPIN_ORPHAN_POOL; i++) {
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.visible = false;
    symContainer.addChild(sp);
    orphanSymSprites.push(sp);
  }
  for (let i = 0; i < SPIN_ORPHAN_POOL; i++) {
    const lb = new Text({ text: '', style: labelStyle });
    lb.anchor.set(0.5);
    symContainer.addChild(lb);
    orphanCellLabels.push(lb);
  }

  /** Above reels, below particles / multiplier — stone frame overlaps tile edges like a real bezel. */
  root.addChild(frameSprite);

  particleGfx = new Graphics();
  root.addChild(particleGfx);

  const floatStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: 26,
    fontWeight: '900',
    fill: 0xffd78a,
    stroke: { color: 0x000000, width: 3 },
    align: 'center',
  });
  for (let i = 0; i < 8; i++) {
    const ft = new Text({ text: '', style: floatStyle });
    ft.anchor.set(0.5);
    ft.visible = false;
    root.addChild(ft);
    floatTexts.push(ft);
  }

  multPill = new Container();
  multBg = new Graphics();
  multPill.addChild(multBg);
  multTitle = new Text({
    text: 'MULTIPLIER',
    style: new TextStyle({
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2.5,
      fill: 0xf2eee6,
      align: 'center',
    }),
  });
  multTitle.anchor.set(0.5, 0);
  multPill.addChild(multTitle);
  multSegTexts.length = 0;
  for (let i = 0; i < 5; i++) {
    const t = new Text({
      text: '×1',
      style: new TextStyle({
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        fontSize: 18,
        fontWeight: '900',
        fill: 0x8f8c86,
        stroke: { color: 0x0c0b09, width: 3 },
        align: 'center',
        lineJoin: 'round',
      }),
    });
    t.anchor.set(0.5, 0.5);
    multSegTexts.push(t);
    multPill.addChild(t);
  }
  multPill.visible = true;
  root.addChild(multPill);

  if (QR_DEBUG_SHOW_REEL_MASK) {
    debugReelMaskGfx = new Graphics();
    root.addChild(debugReelMaskGfx);
    debugReelMaskSprite = new Sprite();
    debugReelMaskSprite.visible = false;
    debugReelMaskSprite.alpha = 0.3;
    debugReelMaskSprite.tint = 0xff00ff;
    root.addChild(debugReelMaskSprite);
  }

  prevLayoutKey = '';
  prevCellIds = Array(CELL_COUNT).fill(null);

  if (symContainer) symContainer.visible = true;
  if (reelSpinOverlay) reelSpinOverlay.visible = false;
}

/** Call after `loadAztecGridMaskTexture()` — shaped mask matches `QR_PLAYFIELD` on the scaled frame. */
export function setAztecReelMaskTexture(tex: Texture): void {
  if (!reelMaskSprite || !symContainer) return;
  reelMaskSprite.texture = tex;
  reelMaskSprite.visible = true;
  symContainer.mask = reelMaskSprite;
  if (reelSpinOverlay) reelSpinOverlay.mask = reelMaskSprite;
  reelShapeMaskLoaded = true;
  if (reelClipMask) {
    reelClipMask.destroy();
    reelClipMask = null;
  }
}

/** Hide slab grid while Bandits-style reel overlay runs. */
export function setAztecGridLayerVisibleForBanditSpin(visible: boolean): void {
  if (symContainer) symContainer.visible = visible;
}

export function setAztecReelSpinOverlayVisible(visible: boolean): void {
  if (reelSpinOverlay) reelSpinOverlay.visible = visible;
}

export function getAztecReelSpinOverlay(): Container | null {
  return reelSpinOverlay;
}

export function destroyGridScene(): void {
  reelShapeMaskLoaded = false;
  if (symContainer) {
    symContainer.mask = null;
  }
  for (const sp of cellSymbolSprites) {
    sp.destroy();
  }
  cellSymbolSprites.length = 0;
  for (const sp of orphanSymSprites) {
    sp.destroy();
  }
  orphanSymSprites.length = 0;
  orphanCellBacks.length = 0;
  orphanCellLabels.length = 0;
  if (reelClipMask) {
    reelClipMask.destroy();
    reelClipMask = null;
  }
  if (reelSpinOverlay) {
    reelSpinOverlay.destroy({ children: true });
    reelSpinOverlay = null;
  }
  if (reelMaskSprite) {
    reelMaskSprite.destroy({ texture: false });
    reelMaskSprite = null;
  }
  if (frameSprite) {
    frameSprite.destroy({ texture: false });
    frameSprite = null;
  }
  if (recessGfx) {
    recessGfx.destroy();
    recessGfx = null;
  }
  if (debugReelMaskGfx) {
    debugReelMaskGfx.destroy();
    debugReelMaskGfx = null;
  }
  if (debugReelMaskSprite) {
    debugReelMaskSprite.destroy({ texture: false });
    debugReelMaskSprite = null;
  }
  _root = null;
  prevCellIds = [];
}

export function updateGridScene(
  renderer: Renderer,
  grid: Grid,
  _layout: GridLayout,
  winningCellIds?: Set<number>,
  multiplierLabel?: string,
  inFreeSpins?: boolean,
): void {
  if (!_root) return;

  const stage = computeAztecStageLayout(renderer.width, renderer.height);
  const layout: GridLayout = {
    gridX: stage.gridX,
    gridY: stage.gridY,
    cellW: stage.cellW,
    cellH: stage.cellH,
    gap: stage.gap,
  };

  const { gridX, gridY, cellW, cellH, gap } = layout;
  const stepX = cellW + gap;
  const stepY = cellH + gap;
  const totalW = REELS * cellW;
  const totalH = ROWS * cellH;
  const minDim = minCellDim(layout);
  const clipR = Math.max(4, minDim * 0.05);

  if (QR_DEBUG_SHOW_REEL_MASK) {
    if (reelShapeMaskLoaded && debugReelMaskSprite && reelMaskSprite?.texture) {
      debugReelMaskSprite.texture = reelMaskSprite.texture;
      debugReelMaskSprite.position.set(stage.innerX, stage.innerY);
      debugReelMaskSprite.width = stage.innerW;
      debugReelMaskSprite.height = stage.innerH;
      debugReelMaskSprite.visible = true;
      debugReelMaskGfx?.clear();
    } else if (debugReelMaskGfx) {
      debugReelMaskSprite && (debugReelMaskSprite.visible = false);
      debugReelMaskGfx.clear();
      debugReelMaskGfx.roundRect(gridX, gridY, totalW, totalH, clipR);
      debugReelMaskGfx.fill({ color: 0xff00ff, alpha: 0.2 });
      debugReelMaskGfx.roundRect(gridX, gridY, totalW, totalH, clipR);
      debugReelMaskGfx.stroke({ color: 0xff00ff, width: 2, alpha: 0.9 });
    }
  }

  const lk = `f:${Math.round(stage.frameX)}:${Math.round(stage.frameY)}:${Math.round(stage.frameW)}:${Math.round(stage.frameH)}:i:${Math.round(stage.innerX)}:${Math.round(stage.innerY)}:${Math.round(stage.innerW)}:${Math.round(stage.innerH)}:g:${Math.round(gridX * 4)}:${Math.round(gridY * 4)}:${Math.round(cellW * 256)}:${Math.round(cellH * 256)}:${inFreeSpins ? 1 : 0}`;
  if (lk !== prevLayoutKey) {
    prevLayoutKey = lk;
    if (frameSprite) {
      frameSprite.position.set(
        stage.frameX - AZTEC_FRAME_OUTSET_X,
        stage.frameY - AZTEC_FRAME_SPRITE_TOP_OUTSET_PX,
      );
      frameSprite.width = stage.frameW + 2 * AZTEC_FRAME_OUTSET_X;
      frameSprite.height =
        stage.frameH + AZTEC_FRAME_SPRITE_TOP_OUTSET_PX + AZTEC_FRAME_OUTSET_BOTTOM;
    }
    bgGfx.clear();
    const inner = inFreeSpins ? 0x2a1810 : 0x141210;
    bgGfx.roundRect(gridX, gridY, totalW, totalH, Math.max(4, minDim * 0.05));
    bgGfx.fill({ color: inner, alpha: 0.12 });
    bgGfx.roundRect(gridX, gridY, totalW, totalH, Math.max(4, minDim * 0.05));
    bgGfx.stroke({ color: inFreeSpins ? 0xc45c1a : 0x3d3028, width: 1, alpha: 0.25 });

    if (!reelShapeMaskLoaded && reelClipMask && symContainer) {
      /** Rect fallback until shaped `mask.png` loads (v8: reassign after `clear()`). */
      symContainer.mask = null;
      reelClipMask.clear();
      reelClipMask.roundRect(gridX, gridY, totalW, totalH, clipR);
      reelClipMask.fill({ color: 0xffffff });
      symContainer.mask = reelClipMask;
      if (reelSpinOverlay) reelSpinOverlay.mask = reelClipMask;
    }

    if (recessGfx) {
      recessGfx.clear();
      const band = Math.max(2.5, minDim * 0.042);
      const a = 0.13;
      recessGfx.rect(gridX, gridY, totalW, band);
      recessGfx.fill({ color: 0x1a1510, alpha: a });
      recessGfx.rect(gridX, gridY + totalH - band, totalW, band);
      recessGfx.fill({ color: 0x1a1510, alpha: a });
      recessGfx.rect(gridX, gridY, band, totalH);
      recessGfx.fill({ color: 0x1a1510, alpha: a });
      recessGfx.rect(gridX + totalW - band, gridY, band, totalH);
      recessGfx.fill({ color: 0x1a1510, alpha: a });
    }
  }

  if (reelShapeMaskLoaded && reelMaskSprite && symContainer) {
    symContainer.mask = reelMaskSprite;
    if (reelSpinOverlay) reelSpinOverlay.mask = reelMaskSprite;
    reelMaskSprite.position.set(stage.innerX, stage.innerY);
    reelMaskSprite.width = stage.innerW;
    reelMaskSprite.height = stage.innerH;
  }

  glowGfx.clear();
  if (winningCellIds && winningCellIds.size > 0) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < REELS; c++) {
        const cell = grid[r][c];
        if (!winningCellIds.has(cell.id)) continue;
        const cx = gridX + c * cellW + cellW / 2;
        const cy = gridY + r * cellH + cellH / 2;
        glowGfx.circle(cx, cy, minDim * 0.46);
        glowGfx.fill({ color: 0xffcc44, alpha: 0.22 });
      }
    }
  }

  /** Square cells so textures tile flush; small radius reads as dark gutters between stones. */
  const cornerR = 0;
  const symFit = symbolFitForCellSize(minDim);

  let idx = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < REELS; c++) {
      const cell = grid[r][c];
      const gfx = cellBacks[idx];
      const symSprite = cellSymbolSprites[idx];
      const lb = cellLabels[idx];

      if (isSpinPaddingCell(cell)) {
        gfx.clear();
        symSprite.visible = false;
        lb.visible = false;
        prevCellIds[idx] = cell.id;
        idx++;
        continue;
      }

      const brickBottom = gridY + (r + 1) * cellH;

      const anim = getCellAnimState(cell.id);
      const ax = anim?.xOffset ?? 0;
      const ay = anim?.yOffset ?? 0;
      const sx = anim?.scaleX ?? 1;
      const sy = anim?.scaleY ?? 1;
      const alpha = anim?.alpha ?? 1;
      const rot = anim?.rotation ?? 0;

      const w = cellW * sx;
      const h = cellH * sy;
      const left = gridX + c * cellW + ax * stepX;
      const bottom = brickBottom + ay * stepY;

      const cx = left + w / 2;
      const cy = bottom - h / 2;

      const fallRec = getFallAnimForCell(cell.id);
      const displaySymbol = (
        getCascadeFallTileSymbol(cell.id) ??
        (fallRec && fallRec.symbol !== undefined ? fallRec.symbol : undefined) ??
        cell.symbol
      ) as TempleSymbol;
      const symTex = getAztecSymbolTexture(displaySymbol);
      const hasSymbolTex = Boolean(symTex && symTex.width > 0);
      const symY = hasSymbolTex ? cy : cy + symbolLabelOffsetY(minDim);

      gfx.clear();
      gfx.position.set(left, bottom);
      gfx.rotation = rot;
      gfx.roundRect(0, -h, w, h, cornerR * Math.min(sx, sy));
      const col = SYMBOL_COLORS[displaySymbol] ?? 0x888888;
      const seamW = Math.max(0.65, minDim * 0.009);
      if (!hasSymbolTex) {
        gfx.fill({ color: col, alpha: alpha * 0.98 });
        gfx.stroke({
          color: 0x1a1612,
          width: seamW,
          alpha: alpha * 0.55,
        });
      }

      if (hasSymbolTex && symTex) {
        symSprite.texture = symTex;
        symSprite.visible = true;
        symSprite.alpha = alpha;
        symSprite.rotation = rot;
        const maxW = Math.max(1, w);
        const maxH = Math.max(1, h);
        const tw = symTex.width;
        const th = symTex.height;
        const fit = symbolTextureCoverFit(maxW, maxH, tw, th);
        symSprite.width = tw * fit * sx;
        symSprite.height = th * fit * sy;
        symSprite.position.set(cx, cy + symbolTextureOpticalOffsetY(minDim));
        lb.visible = false;
      } else {
        symSprite.visible = false;
        lb.visible = true;
        lb.text = SYMBOL_LABELS[displaySymbol] ?? '?';
        lb.position.set(cx, symY);
        lb.rotation = rot;
        lb.scale.set(sx, sy);
        lb.alpha = alpha;
        lb.style.fontSize = symFit.fontPx;
        const st = lb.style.stroke;
        if (st && typeof st === 'object' && 'width' in st) {
          (st as { width: number }).width = symFit.strokeW;
        }
      }

      prevCellIds[idx] = cell.id;
      idx++;
    }
  }

  const orphans = getSpinExplodeOrphans(grid);
  for (let oi = 0; oi < SPIN_ORPHAN_POOL; oi++) {
    const gfxO = orphanCellBacks[oi];
    const symSpriteO = orphanSymSprites[oi];
    const lbO = orphanCellLabels[oi];
    if (oi >= orphans.length) {
      gfxO.clear();
      symSpriteO.visible = false;
      lbO.visible = false;
      continue;
    }
    const o = orphans[oi];
    const rr = o.row;
    const cc = o.col;
    const brickBottomO = gridY + (rr + 1) * cellH;
    const animO = getCellAnimState(o.cellId);
    const axO = animO?.xOffset ?? 0;
    const ayO = animO?.yOffset ?? 0;
    const sxO = animO?.scaleX ?? 1;
    const syO = animO?.scaleY ?? 1;
    const alphaO = animO?.alpha ?? 1;
    const rotO = animO?.rotation ?? 0;
    const wO = cellW * sxO;
    const hO = cellH * syO;
    const leftO = gridX + cc * cellW + axO * stepX;
    const bottomO = brickBottomO + ayO * stepY;
    const cxO = leftO + wO / 2;
    const cyO = bottomO - hO / 2;
    const symTexO = getAztecSymbolTexture(o.symbol);
    const hasTexO = Boolean(symTexO && symTexO.width > 0);
    const symYO = hasTexO ? cyO : cyO + symbolLabelOffsetY(minDim);
    gfxO.clear();
    gfxO.position.set(leftO, bottomO);
    gfxO.rotation = rotO;
    gfxO.roundRect(0, -hO, wO, hO, cornerR * Math.min(sxO, syO));
    const colO = SYMBOL_COLORS[o.symbol] ?? 0x888888;
    const seamWO = Math.max(0.65, minDim * 0.009);
    if (!hasTexO) {
      gfxO.fill({ color: colO, alpha: alphaO * 0.98 });
      gfxO.stroke({
        color: 0x1a1612,
        width: seamWO,
        alpha: alphaO * 0.55,
      });
    }
    if (hasTexO && symTexO) {
      symSpriteO.texture = symTexO;
      symSpriteO.visible = true;
      symSpriteO.alpha = alphaO;
      symSpriteO.rotation = rotO;
      const maxWO = Math.max(1, wO);
      const maxHO = Math.max(1, hO);
      const twO = symTexO.width;
      const thO = symTexO.height;
      const fitO = symbolTextureCoverFit(maxWO, maxHO, twO, thO);
      symSpriteO.width = twO * fitO * sxO;
      symSpriteO.height = thO * fitO * syO;
      symSpriteO.position.set(cxO, cyO + symbolTextureOpticalOffsetY(minDim));
      lbO.visible = false;
    } else {
      symSpriteO.visible = false;
      lbO.visible = true;
      lbO.text = SYMBOL_LABELS[o.symbol] ?? '?';
      lbO.position.set(cxO, symYO);
      lbO.rotation = rotO;
      lbO.scale.set(sxO, syO);
      lbO.alpha = alphaO;
      lbO.style.fontSize = symFit.fontPx;
      const stO = lbO.style.stroke;
      if (stO && typeof stO === 'object' && 'width' in stO) {
        (stO as { width: number }).width = symFit.strokeW;
      }
    }
  }

  const particles = getParticles();
  particleGfx.clear();
  for (const p of particles) {
    const pa = 1 - p.life / Math.max(1, p.maxLife);
    const fade = pa * pa;
    const fadeLin = pa;
    if (p.kind === 'smoke') {
      const r = p.size * p.aspect;
      if (p.dense) {
        const coreA = 0.44 * fade;
        particleGfx.circle(p.x, p.y, r * 1.02);
        particleGfx.fill({ color: p.color, alpha: coreA });
        particleGfx.circle(p.x - r * 0.18, p.y + r * 0.12, r * 0.78);
        particleGfx.fill({ color: 0x9a8068, alpha: 0.3 * fadeLin });
        particleGfx.circle(p.x + r * 0.15, p.y - r * 0.1, r * 0.62);
        particleGfx.fill({ color: 0xb89a78, alpha: 0.22 * fadeLin });
        particleGfx.circle(p.x + r * 0.06, p.y + r * 0.14, r * 1.18);
        particleGfx.fill({ color: 0xd4c4a8, alpha: 0.14 * fadeLin });
        particleGfx.circle(p.x - r * 0.22, p.y - r * 0.16, r * 0.45);
        particleGfx.fill({ color: 0x7a6248, alpha: 0.2 * fade });
      } else {
        const a = 0.26 * fade;
        particleGfx.circle(p.x, p.y, r);
        particleGfx.fill({ color: p.color, alpha: a });
        particleGfx.circle(p.x - r * 0.12, p.y - r * 0.1, r * 0.68);
        particleGfx.fill({ color: 0xc4b8a4, alpha: 0.16 * fadeLin });
      }
    } else if (p.kind === 'sand') {
      const rad = p.size * (0.42 + p.aspect * 0.32);
      const a = (0.5 + 0.45 * (1 - fade)) * Math.sqrt(Math.max(0, 1 - fade * 0.35));
      particleGfx.circle(p.x, p.y, rad);
      particleGfx.fill({ color: p.color, alpha: a });
      if (p.size > 1.0 && fade < 0.85) {
        particleGfx.circle(p.x - rad * 0.28, p.y - rad * 0.22, rad * 0.32);
        particleGfx.fill({ color: 0xfff5e6, alpha: 0.14 * a });
      }
    } else {
      const grit = p.baseSize <= 2.35 && p.maxLife < 520;
      const rad = p.size * (grit ? 0.52 + p.aspect * 0.38 : 0.58 + p.aspect * 0.42);
      particleGfx.circle(p.x, p.y, rad);
      particleGfx.fill({
        color: p.color,
        alpha: grit ? 0.9 * fade + 0.1 : 0.94 * Math.sqrt(fadeLin),
      });
    }
  }

  const floats = getFloatingWins();
  for (let i = 0; i < floatTexts.length; i++) {
    const ft = floatTexts[i];
    const fw = floats[i];
    if (fw) {
      ft.visible = true;
      ft.text = `+${(fw.amount / 100).toFixed(2)}`;
      const t = fw.elapsedMs / fw.durationMs;
      const rise = t * 40;
      ft.position.set(fw.x, fw.y - rise);
      ft.alpha = 1 - t * 0.85;
    } else {
      ft.visible = false;
    }
  }

  /** Compact multiplier strip — top-right; large chiseled tier type (Gonzo-style read). */
  const multLabelShown = multiplierLabel?.trim() ? multiplierLabel.trim() : '×1';
  const currentMult = parseMultiplierFromLabel(multLabelShown);
  const tiers = inFreeSpins ? MULT_TIERS_FREE : MULT_TIERS_BASE;
  const cornerGap = 8;
  const maxW = Math.max(112, stage.innerW - cornerGap * 2);
  const barW = Math.min(maxW, Math.min(220, Math.max(152, stage.innerW * 0.44)));
  const barH = Math.max(42, Math.min(52, minDim * 0.42));
  const canvasW = renderer.width;
  const canvasH = renderer.height;
  const isMobileLayout = canvasW < 1024;
  const isPortraitMobile = isMobileLayout && canvasH > canvasW * 1.05;
  /** Clear baked-in title art; tuck strip toward screen right edge. */
  const multNudgeUp = isMobileLayout ? (isPortraitMobile ? 40 : 26) : 0;
  const multNudgeRight = isMobileLayout ? (isPortraitMobile ? 16 : 10) : 0;
  const edgePad = 4;
  let barX = stage.innerX + stage.innerW - barW - cornerGap + multNudgeRight;
  let barY = Math.max(stage.frameY + 6, stage.innerY - barH - cornerGap - multNudgeUp);
  barX = Math.max(edgePad, Math.min(barX, canvasW - barW - edgePad));
  barY = Math.max(stage.frameY + 2, barY);
  multPill.position.set(barX, barY);

  multBg.clear();
  multBg.roundRect(0, 0, barW, barH, 7);
  multBg.fill({ color: 0x080706, alpha: 0.97 });
  multBg.stroke({ color: inFreeSpins ? 0x5a3518 : 0x2a241c, width: 2 });
  multBg.roundRect(2.5, 2.5, barW - 5, barH - 5, 5);
  multBg.stroke({ color: inFreeSpins ? 0xd88840 : 0x9a8048, width: 1.35, alpha: 0.92 });

  multTitle.style.fontSize = Math.max(8, Math.min(11, Math.round(barH * 0.2)));
  multTitle.position.set(barW / 2, 5);
  multTitle.style.fill = inFreeSpins ? 0xffe8d8 : 0xf5f0e8;

  const segFont = Math.max(15, Math.min(22, Math.round(barW / 10.5)));
  const rowY = barH * 0.62;
  const padX = 6;
  const usable = barW - padX * 2;
  const colW = usable / 5;

  const dimFill = 0x8a8780;
  const dimStroke = 0x0a0908;
  const activeFill = 0xffee88;
  const activeStroke = 0x3d2208;

  for (let i = 0; i < 5; i++) {
    const t = multSegTexts[i];
    t.text = `×${tiers[i]}`;
    t.style.fontSize = segFont;
    const on = tiers[i] === currentMult;
    t.style.fill = on ? activeFill : dimFill;
    t.style.stroke = {
      color: on ? activeStroke : dimStroke,
      width: on ? 3.25 : 2.75,
    };
    if (on) {
      t.style.dropShadow = {
        alpha: 1,
        angle: Math.PI / 2,
        blur: 6,
        color: 0xffb020,
        distance: 0,
      };
    } else {
      t.style.dropShadow = false;
    }
    t.position.set(padX + colW * (i + 0.5), rowY);
    t.scale.set(on ? 1.08 : 1);
  }

  multPill.visible = true;

  void renderer; // layout pass may use renderer later
}
