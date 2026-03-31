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
import { getCellAnimState, getParticles, getFloatingWins, getSpinExplodeOrphans } from './gridAnimations';
import { getQuestRaiderSymbolTexture } from './questRaiderSymbolTextures';
import { QR_DEBUG_SHOW_REEL_MASK } from './questRaiderLayout';
import {
  computeQuestRaiderStageLayout,
  type QuestRaiderStageLayout,
} from './questRaiderStageLayout';

export type { QuestRaiderStageLayout };

export interface GridLayout {
  gridX: number;
  gridY: number;
  /** Cells tile the mask window on `frame.png` (5×3); Pixi mask matches that opening. */
  cellW: number;
  cellH: number;
  gap: number;
}

export function computeGridLayout(canvasW: number, canvasH: number): GridLayout {
  const s = computeQuestRaiderStageLayout(canvasW, canvasH);
  return {
    gridX: s.gridX,
    gridY: s.gridY,
    cellW: s.cellW,
    cellH: s.cellH,
    gap: s.gap,
  };
}

const FRAME_URL = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}quest_raiders/frame.png`;

let cachedFrameTex: Texture | null | undefined;
let frameSprite: Sprite | null = null;

/** Linear + mipmaps + anisotropy before first GPU bind — smoother frame edges when scaled. */
function configureQuestRaiderFrameSampling(tex: Texture): void {
  const src = tex.source;
  src.autoGenerateMipmaps = true;
  src.scaleMode = 'linear';
  src.maxAnisotropy = 8;
}

export async function loadQuestRaiderFrameTexture(): Promise<void> {
  if (cachedFrameTex === undefined) {
    try {
      cachedFrameTex = await Assets.load<Texture>(FRAME_URL);
      if (cachedFrameTex) configureQuestRaiderFrameSampling(cachedFrameTex);
    } catch {
      cachedFrameTex = null;
    }
  }
  if (frameSprite && cachedFrameTex) {
    frameSprite.texture = cachedFrameTex;
    frameSprite.visible = true;
    configureQuestRaiderFrameSampling(cachedFrameTex);
  }
}

function minCellDim(layout: GridLayout): number {
  return Math.min(layout.cellW, layout.cellH);
}

const CELL_COUNT = REELS * ROWS;
/** Spin clear can overlap many explode drop-outs; pool must cover full grid so tiles don’t vanish mid-fall. */
const SPIN_ORPHAN_POOL = CELL_COUNT;
const BASE_LABEL = 22;

/** Text placeholders only — textures stay geometrically centered (avoids gap above PNG tiles). */
function symbolLabelOffsetY(minDim: number): number {
  return Math.max(4, Math.min(16, Math.round(minDim * 0.035)));
}

/** Contain-fit scale inside each cell; keep ≤1.03 on small cells so rotation + mask don’t peek past the frame on mobile. */
function symbolTextureCellScale(minDim: number): number {
  if (minDim < 42) return 1.0;
  if (minDim < 54) return 1.03;
  return 1.06;
}

/** Vertical nudge for symbol art in cell (0 = geometric center; tweak if a PNG sits optically low). */
function symbolTextureOpticalOffsetY(_minDim: number): number {
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
let multText: Text;
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
  root.addChild(frameSprite);

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
  multText = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 20,
      fontWeight: '900',
      fill: 0xffe8a8,
      align: 'center',
    }),
  });
  multText.anchor.set(0.5);
  multPill.addChild(multText);
  multPill.visible = false;
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
}

/** Call after `loadQuestRaiderGridMaskTexture()` — shaped mask matches `QR_PLAYFIELD` on the scaled frame. */
export function setQuestRaiderReelMaskTexture(tex: Texture): void {
  if (!reelMaskSprite || !symContainer) return;
  reelMaskSprite.texture = tex;
  reelMaskSprite.visible = true;
  symContainer.mask = reelMaskSprite;
  reelShapeMaskLoaded = true;
  if (reelClipMask) {
    reelClipMask.destroy();
    reelClipMask = null;
  }
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

  const stage = computeQuestRaiderStageLayout(renderer.width, renderer.height);
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
      frameSprite.position.set(stage.frameX, stage.frameY);
      frameSprite.width = stage.frameW;
      frameSprite.height = stage.frameH;
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

  /** Match bg stone panels: slight radius, no heavy outline (avoids fake “gaps” between cells). */
  const cornerR = Math.max(2, Math.min(6, minDim * 0.045));
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

      const symTex = getQuestRaiderSymbolTexture(cell.symbol as TempleSymbol);
      const hasSymbolTex = Boolean(symTex && symTex.width > 0);
      const symY = hasSymbolTex ? cy : cy + symbolLabelOffsetY(minDim);

      gfx.clear();
      gfx.position.set(left, bottom);
      gfx.rotation = rot;
      gfx.roundRect(0, -h, w, h, cornerR * Math.min(sx, sy));
      const col = SYMBOL_COLORS[cell.symbol as TempleSymbol] ?? 0x888888;
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
        /** Contain within cell so textures never draw past tile bounds (prevents overlap). */
        const fit = Math.min(maxW / tw, maxH / th) * symbolTextureCellScale(minDim);
        symSprite.width = tw * fit * sx;
        symSprite.height = th * fit * sy;
        symSprite.position.set(cx, cy + symbolTextureOpticalOffsetY(minDim));
        lb.visible = false;
      } else {
        symSprite.visible = false;
        lb.visible = true;
        lb.text = SYMBOL_LABELS[cell.symbol as TempleSymbol] ?? '?';
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
    const symTexO = getQuestRaiderSymbolTexture(o.symbol);
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
      const fitO = Math.min(maxWO / twO, maxHO / thO) * symbolTextureCellScale(minDim);
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
        const coreA = 0.5 * fade;
        particleGfx.circle(p.x, p.y, r * 1.02);
        particleGfx.fill({ color: p.color, alpha: coreA });
        particleGfx.circle(p.x - r * 0.18, p.y + r * 0.12, r * 0.78);
        particleGfx.fill({ color: 0x3a3834, alpha: 0.32 * fadeLin });
        particleGfx.circle(p.x + r * 0.15, p.y - r * 0.1, r * 0.62);
        particleGfx.fill({ color: 0x524e46, alpha: 0.24 * fadeLin });
        particleGfx.circle(p.x + r * 0.06, p.y + r * 0.14, r * 1.18);
        particleGfx.fill({ color: 0x7a7268, alpha: 0.12 * fadeLin });
        particleGfx.circle(p.x - r * 0.22, p.y - r * 0.16, r * 0.45);
        particleGfx.fill({ color: 0x2c2a26, alpha: 0.2 * fade });
      } else {
        const a = 0.24 * fade;
        particleGfx.circle(p.x, p.y, r);
        particleGfx.fill({ color: p.color, alpha: a });
        particleGfx.circle(p.x - r * 0.12, p.y - r * 0.1, r * 0.68);
        particleGfx.fill({ color: 0x8f877c, alpha: 0.14 * fadeLin });
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

  if (multiplierLabel) {
    multPill.visible = true;
    multText.text = multiplierLabel;
    const pw = multText.width + 28;
    const ph = 34;
    const mx = gridX + REELS * cellW - pw - 4;
    const my = gridY - 42;
    multPill.position.set(mx + pw / 2, my + ph / 2);
    multBg.clear();
    multBg.roundRect(-pw / 2, -ph / 2, pw, ph, 10);
    multBg.fill({ color: 0x2a1a0e, alpha: 0.92 });
    multBg.stroke({ color: 0xc9a227, width: 1.5 });
  } else {
    multPill.visible = false;
  }

  void renderer; // layout pass may use renderer later
}
