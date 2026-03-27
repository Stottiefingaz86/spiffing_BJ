/**
 * Retained-mode grid renderer for Froot Jarz.
 * All Pixi objects are created once in initGridScene() and reused via
 * transform updates in updateGridScene(). Eliminates per-frame allocation.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Renderer } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, JAR_WILD, SYMBOL_COLORS, SYMBOL_LABELS } from '../engine/symbols';
import type { Grid } from '../engine/grid';
import type { JarState } from '../engine/jarWild';
import { getSymbolTexture } from './symbolTextures';
import { getCellAnimState, getCellPopState, getParticles, getFloatingWins } from './gridAnimations';

export interface GridLayout {
  gridX: number;
  gridY: number;
  cellSize: number;
  gap: number;
}

export function computeGridLayout(canvasW: number, canvasH: number): GridLayout {
  const hPad = canvasW * 0.02;
  const vPad = canvasH * 0.01;
  const availW = canvasW - hPad * 2;
  const availH = canvasH - vPad * 2;
  const totalGapRatio = 0.06;
  const cellWithGapW = availW / GRID_COLS;
  const cellWithGapH = availH / GRID_ROWS;
  const cellWithGap = Math.min(cellWithGapW, cellWithGapH);
  const gap = cellWithGap * totalGapRatio;
  const cellSize = cellWithGap - gap;
  const totalW = GRID_COLS * (cellSize + gap) - gap;
  const totalH = GRID_ROWS * (cellSize + gap) - gap;
  const gridX = (canvasW - totalW) / 2;
  const gridY = (canvasH - totalH) / 2;
  return { gridX, gridY, cellSize, gap };
}

// ── Scene constants ──

const CELL_COUNT = GRID_ROWS * GRID_COLS;
const FLOAT_POOL = 12;
const BASE_LABEL_SIZE = 32;
const BASE_BADGE_SIZE = 20;
const BASE_FLOAT_SIZE = 24;
const BASE_PILL_SIZE = 40;

// ── Retained scene objects (module-level, one scene at a time) ──

let _root: Container | null = null;

let bgGfx: Graphics;
let cellBgGfx: Graphics;
let maskGfx: Graphics;
let symContainer: Container;
let glowGfx: Graphics;

const cellSprites: Sprite[] = [];
const cellLabels: Text[] = [];
const badgeBgs: Graphics[] = [];
const badgeTexts: Text[] = [];

let particleGfx: Graphics;
const floatTexts: Text[] = [];

let pillContainer: Container;
let pillBg: Graphics;
let pillText: Text;

// Change tracking
let prevLayoutKey = '';
let prevWinKey = '';
const prevCellIds: (number | null)[] = [];
const prevCellSyms: (string | null)[] = [];

// ── Lifecycle ──

export function initGridScene(root: Container, renderer: Renderer): void {
  destroyGridScene();
  _root = root;

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
    fill: 0xffffff,
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
    badgeBgs.push(bbg);

    const bt = new Text({ text: '', style: badgeStyle });
    bt.anchor.set(0.5);
    bt.visible = false;
    symContainer.addChild(bt);
    badgeTexts.push(bt);
  }

  particleGfx = new Graphics();
  root.addChild(particleGfx);

  const floatStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_FLOAT_SIZE,
    fontWeight: '900',
    fill: 0x6ee7b7,
    dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 2, angle: Math.PI / 2 },
    align: 'center',
  });
  for (let i = 0; i < FLOAT_POOL; i++) {
    const ft = new Text({ text: '', style: floatStyle });
    ft.anchor.set(0.5);
    ft.visible = false;
    root.addChild(ft);
    floatTexts.push(ft);
  }

  pillContainer = new Container();
  pillContainer.visible = false;
  pillBg = new Graphics();
  pillContainer.addChild(pillBg);
  pillText = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: BASE_PILL_SIZE,
      fontWeight: '900',
      fill: 0xfdd835,
      align: 'center',
    }),
  });
  pillText.anchor.set(0.5);
  pillContainer.addChild(pillText);
  root.addChild(pillContainer);

  prevLayoutKey = '';
  prevWinKey = '';
  prevCellIds.length = CELL_COUNT;
  prevCellSyms.length = CELL_COUNT;
  prevCellIds.fill(null);
  prevCellSyms.fill(null);
}

export function updateGridScene(
  renderer: Renderer,
  grid: Grid,
  jarStates: JarState[],
  layout: GridLayout,
  winningCellIds?: Set<number>,
  totalWinAmount?: number,
  betAmount?: number,
): void {
  if (!_root) return;

  const { gridX, gridY, cellSize, gap } = layout;
  const step = cellSize + gap;
  const bgPad = gap * 2;
  const gridW = GRID_COLS * step - gap + bgPad * 2;
  const gridH = GRID_ROWS * step - gap + bgPad * 2;

  const lk = `${gridX | 0}:${gridY | 0}:${cellSize | 0}`;
  const layoutChanged = lk !== prevLayoutKey;

  let winKey = '';
  if (winningCellIds && winningCellIds.size > 0) {
    const arr: number[] = [];
    for (const id of winningCellIds) arr.push(id);
    arr.sort((a, b) => a - b);
    winKey = arr.join(',');
  }
  const winChanged = winKey !== prevWinKey;

  // Redraw static background + mask only when layout changes
  if (layoutChanged) {
    prevLayoutKey = lk;
    bgGfx.clear();
    bgGfx.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, 12);
    bgGfx.fill({ color: 0x1a1230, alpha: 0.85 });
    bgGfx.stroke({ color: 0xffffff, alpha: 0.06, width: 2 });

    maskGfx.clear();
    maskGfx.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, 12);
    maskGfx.fill({ color: 0xffffff });
  }

  const hasWinners = winningCellIds && winningCellIds.size > 0;

  // Redraw cell backgrounds when layout or winning set changes
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
          const color = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color, alpha: 0.25 });
          cellBgGfx.roundRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2, 7);
          cellBgGfx.stroke({ color, width: 2, alpha: 0.5 });
        } else if (hasWinners) {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x0a0818, alpha: 0.7 });
        } else {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x2a1f45, alpha: 0.5 });
        }
      }
    }
  }

  // Glow (cleared each frame, only drawn for active winning cells)
  glowGfx.clear();

  const baseLabelScale = (cellSize * 0.32) / BASE_LABEL_SIZE;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      const cell = grid[r]?.[c];
      const sp = cellSprites[i];
      const lb = cellLabels[i];
      const bbg = badgeBgs[i];
      const bt = badgeTexts[i];

      if (!cell) {
        sp.visible = false;
        lb.visible = false;
        bbg.visible = false;
        bt.visible = false;
        prevCellIds[i] = null;
        prevCellSyms[i] = null;
        continue;
      }

      // Update texture + label only when cell identity changes
      if (prevCellIds[i] !== cell.id || prevCellSyms[i] !== cell.symbol) {
        sp.texture = getSymbolTexture(renderer, cell.symbol);
        lb.text = SYMBOL_LABELS[cell.symbol];
        prevCellIds[i] = cell.id;
        prevCellSyms[i] = cell.symbol;
      }

      // Animation state — O(1) map lookups
      const anim = getCellAnimState(cell.id);
      let yOff = 0, sX = 1, sY = 1, a = 1;
      if (anim) { yOff = anim.yOffset; sX = anim.scaleX; sY = anim.scaleY; a = anim.alpha; }

      if (a <= 0.01 || (sX <= 0.01 && sY <= 0.01)) {
        sp.visible = false;
        lb.visible = false;
        bbg.visible = false;
        bt.visible = false;
        continue;
      }

      const bx = gridX + c * step + cellSize / 2;
      const by = gridY + r * step + cellSize / 2 + yOff * step;

      // Winning cell glow (skip during pop explosion)
      if (winningCellIds?.has(cell.id) && !getCellPopState(cell.id)) {
        const as = (sX + sY) / 2;
        const col = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
        glowGfx.circle(bx, by, cellSize * 0.72 * as);
        glowGfx.fill({ color: col, alpha: 0.12 });
        glowGfx.circle(bx, by, cellSize * 0.6 * as);
        glowGfx.fill({ color: col, alpha: 0.25 });
        glowGfx.circle(bx, by, cellSize * 0.5 * as);
        glowGfx.fill({ color: col, alpha: 0.4 });
        glowGfx.circle(bx, by, cellSize * 0.42 * as);
        glowGfx.fill({ color: 0xffffff, alpha: 0.18 });
      }

      const isWinCell = winningCellIds?.has(cell.id);
      const dimFactor = hasWinners && !isWinCell ? 0.35 : 1;

      // Sprite
      sp.visible = true;
      sp.x = bx;
      sp.y = by;
      sp.width = cellSize * 0.88 * sX;
      sp.height = cellSize * 0.88 * sY;
      sp.alpha = a * dimFactor;

      // Label (scale instead of re-creating TextStyle each frame)
      lb.visible = true;
      lb.x = bx;
      lb.y = by;
      lb.scale.set(sX * baseLabelScale, sY * baseLabelScale);
      lb.alpha = a * 0.9 * dimFactor;

      // Jar multiplier badge
      if (cell.symbol === JAR_WILD) {
        const jar = jarStates.find((j) => j.row === r && j.col === c);
        if (jar && jar.multiplier > 1) {
          const bs = cellSize * 0.32;
          const bpx = bx + cellSize * 0.32;
          const bpy = by - cellSize * 0.32;

          bbg.clear();
          bbg.circle(bpx, bpy, bs / 2);
          bbg.fill({ color: 0xe53935 });
          bbg.stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
          bbg.visible = true;
          bbg.alpha = a;

          const ms = `x${jar.multiplier}`;
          if (bt.text !== ms) bt.text = ms;
          bt.x = bpx;
          bt.y = bpy;
          bt.scale.set((bs * 0.65) / BASE_BADGE_SIZE);
          bt.visible = true;
          bt.alpha = a;
        } else {
          bbg.visible = false;
          bt.visible = false;
        }
      } else {
        bbg.visible = false;
        bt.visible = false;
      }
    }
  }

  // Particles (single Graphics, cleared + redrawn per frame)
  particleGfx.clear();
  const particles = getParticles();
  for (const p of particles) {
    const pa = 1 - p.life / p.maxLife;
    particleGfx.circle(p.x, p.y, p.size * (0.4 + 0.6 * pa));
    particleGfx.fill({ color: p.color, alpha: pa * 0.9 });
  }

  // Floating win texts (pooled)
  const fws = getFloatingWins();
  for (let fi = 0; fi < floatTexts.length; fi++) {
    const ft = floatTexts[fi];
    if (fi < fws.length) {
      const fw = fws[fi];
      const t = fw.elapsedMs / fw.durationMs;
      const fa = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const nt = `+$${(fw.amount / 100).toFixed(2)}`;
      if (ft.text !== nt) ft.text = nt;
      ft.x = fw.x;
      ft.y = fw.y - t * cellSize * 1.6;
      ft.alpha = Math.max(0, fa);
      ft.scale.set(Math.min(cellSize * 0.4, 30) / BASE_FLOAT_SIZE);
      ft.visible = true;
    } else {
      ft.visible = false;
    }
  }

  // Win pill — shown for ANY win during cascades
  if (totalWinAmount && totalWinAmount > 0) {
    const cx = gridX + (GRID_COLS * step - gap) / 2;
    const cy = gridY + (GRID_ROWS * step - gap) / 2;
    const pw = Math.min(cellSize * 4.5, GRID_COLS * step * 0.55);
    const ph = cellSize * 1.5;

    pillBg.clear();
    pillBg.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
    pillBg.fill({ color: 0x000000, alpha: 0.7 });
    pillBg.stroke({ color: 0xfdd835, width: 3, alpha: 0.85 });

    const wt = `$${(totalWinAmount / 100).toFixed(2)}`;
    if (pillText.text !== wt) pillText.text = wt;
    pillText.x = cx;
    pillText.y = cy;
    pillText.scale.set(Math.min(cellSize * 0.9, 56) / BASE_PILL_SIZE);
    pillContainer.visible = true;
  } else {
    pillContainer.visible = false;
  }
}

export function destroyGridScene(): void {
  cellSprites.length = 0;
  cellLabels.length = 0;
  badgeBgs.length = 0;
  badgeTexts.length = 0;
  floatTexts.length = 0;
  if (_root && !(_root as any).destroyed) {
    _root.removeChildren();
  }
  _root = null;
  prevLayoutKey = '';
  prevWinKey = '';
  prevCellIds.length = 0;
  prevCellSyms.length = 0;
}

// Backward-compatible wrapper: auto-inits on first call or root change
export function drawGridScene(
  root: Container,
  renderer: Renderer,
  grid: Grid,
  jarStates: JarState[],
  layout: GridLayout,
  winningCellIds?: Set<number>,
  totalWinAmount?: number,
  betAmount?: number,
): void {
  if (!_root || _root !== root) initGridScene(root, renderer);
  updateGridScene(renderer, grid, jarStates, layout, winningCellIds, totalWinAmount, betAmount);
}
