/**
 * Retained-mode grid renderer for Froot Jarz.
 * All Pixi objects are created once in initGridScene() and reused via
 * transform updates in updateGridScene(). Eliminates per-frame allocation.
 */

import { BlurFilter, Container, Graphics, Sprite, Text, TextStyle, type Renderer } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, JAR_WILD, SYMBOL_COLORS, SYMBOL_LABELS } from '../engine/symbols';
import type { Grid } from '../engine/grid';
import type { JarState } from '../engine/jarWild';
import { getSymbolTexture } from './symbolTextures';
import { getCellAnimState, getCellPopState, getParticles, getFloatingWins, syncJarSwarms, getJarSwarms } from './gridAnimations';

function hslToHex(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export interface GridLayout {
  gridX: number;
  gridY: number;
  cellSize: number;
  gap: number;
}

export function computeGridLayout(canvasW: number, canvasH: number): GridLayout {
  const isMobile = canvasW < 768;
  const hPad = isMobile ? canvasW * 0.02 : canvasW * 0.07;
  const vPad = isMobile ? canvasH * 0.01 : canvasH * 0.06;
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
  const gridY = (canvasH - totalH) / 2 + (isMobile ? 25 : 20);
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
let jarGlowGfx: Graphics;
let glowGfx: Graphics;

const cellSprites: Sprite[] = [];
const cellLabels: Text[] = [];
const badgeBgs: Graphics[] = [];
const badgeTexts: Text[] = [];

let jarSparkleGfx: Graphics;
let particleGfx: Graphics;
const floatTexts: Text[] = [];

let pillContainer: Container;
let pillBg: Graphics;
let pillText: Text;

// Animation time (ms, driven by real clock)
let animTime = 0;
let lastFrameTime = 0;

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

  jarGlowGfx = new Graphics();
  jarGlowGfx.filters = [new BlurFilter({ strength: 8, quality: 3 })];
  symContainer.addChild(jarGlowGfx);

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

  jarSparkleGfx = new Graphics();
  symContainer.addChild(jarSparkleGfx);

  particleGfx = new Graphics();
  root.addChild(particleGfx);

  const floatStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_FLOAT_SIZE,
    fontWeight: '900',
    fill: 0x6ee7b7,
    dropShadow: { color: 0x000000, alpha: 0.85, blur: 6, distance: 3, angle: Math.PI / 2 },
    stroke: { color: 0x000000, width: 3 },
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
  inFreeSpins?: boolean,
): void {
  if (!_root) return;
  const now = performance.now();
  if (lastFrameTime === 0) lastFrameTime = now;
  animTime += Math.min(now - lastFrameTime, 50);
  lastFrameTime = now;

  const { gridX, gridY, cellSize, gap } = layout;
  const step = cellSize + gap;
  const bgPad = gap * 2;
  const gridW = GRID_COLS * step - gap + bgPad * 2;
  const gridH = GRID_ROWS * step - gap + bgPad * 2;

  const jarPositions: { cx: number; cy: number; key: string }[] = [];

  const lk = `${gridX | 0}:${gridY | 0}:${cellSize | 0}:${inFreeSpins ? 1 : 0}`;
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
    bgGfx.fill({ color: inFreeSpins ? 0x1a0e0a : 0x1a1230, alpha: 0.45 });

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
          cellBgGfx.fill({ color, alpha: 0.45 });
          cellBgGfx.roundRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2, 7);
          cellBgGfx.stroke({ color, width: 3, alpha: 0.8 });
        } else if (hasWinners) {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: inFreeSpins ? 0x0a0808 : 0x0a0818, alpha: 0.7 });
        } else {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: inFreeSpins ? 0x2a1a10 : 0x2a1f45, alpha: 0.3 });
        }
      }
    }
  }

  // Glow layers (cleared each frame)
  jarGlowGfx.clear();
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
      let xOff = 0, yOff = 0, sX = 1, sY = 1, a = 1;
      if (anim) { xOff = anim.xOffset; yOff = anim.yOffset; sX = anim.scaleX; sY = anim.scaleY; a = anim.alpha; }

      if (a <= 0.01 || (sX <= 0.01 && sY <= 0.01)) {
        sp.visible = false;
        lb.visible = false;
        bbg.visible = false;
        bt.visible = false;
        continue;
      }

      const bx = gridX + c * step + cellSize / 2 + xOff * step;
      const by = gridY + r * step + cellSize / 2 + yOff * step;

      // Jar animated glow — blurred pulsating aura (drawn on jarGlowGfx with BlurFilter)
      if (cell.symbol === JAR_WILD && !getCellPopState(cell.id)) {
        const t = animTime * 0.001;
        const p1 = 0.45 + 0.55 * Math.sin(t * 3.5);
        const p2 = 0.45 + 0.55 * Math.sin(t * 4.2 + 1.2);
        const p3 = 0.45 + 0.55 * Math.sin(t * 5.0 + 2.5);
        const hue = (animTime * 0.12) % 360;
        const c1 = hslToHex(hue, 0.8, 0.55);
        const c2 = hslToHex((hue + 60) % 360, 0.9, 0.6);
        const c3 = hslToHex((hue + 140) % 360, 0.85, 0.55);
        const as = (sX + sY) / 2;
        // Outermost diffuse bloom
        jarGlowGfx.circle(bx, by, cellSize * 1.15 * as * p1);
        jarGlowGfx.fill({ color: c1, alpha: 0.12 * p1 });
        jarGlowGfx.circle(bx, by, cellSize * 1.0 * as * p2);
        jarGlowGfx.fill({ color: c2, alpha: 0.16 * p2 });
        // Mid layers
        jarGlowGfx.circle(bx, by, cellSize * 0.85 * as * p1);
        jarGlowGfx.fill({ color: c1, alpha: 0.22 * p1 });
        jarGlowGfx.circle(bx, by, cellSize * 0.7 * as * p3);
        jarGlowGfx.fill({ color: c3, alpha: 0.25 * p3 });
        jarGlowGfx.circle(bx, by, cellSize * 0.55 * as * p2);
        jarGlowGfx.fill({ color: c2, alpha: 0.28 * p2 });
        // Inner bright core
        jarGlowGfx.circle(bx, by, cellSize * 0.4 * as * p3);
        jarGlowGfx.fill({ color: 0xffffff, alpha: 0.22 * p3 });
      }

      // Winning cell glow (skip during pop explosion)
      if (winningCellIds?.has(cell.id) && !getCellPopState(cell.id)) {
        const as = (sX + sY) / 2;
        const col = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
        glowGfx.circle(bx, by, cellSize * 0.95 * as);
        glowGfx.fill({ color: col, alpha: 0.25 });
        glowGfx.circle(bx, by, cellSize * 0.78 * as);
        glowGfx.fill({ color: col, alpha: 0.45 });
        glowGfx.circle(bx, by, cellSize * 0.6 * as);
        glowGfx.fill({ color: col, alpha: 0.6 });
        glowGfx.circle(bx, by, cellSize * 0.42 * as);
        glowGfx.fill({ color: 0xffffff, alpha: 0.45 });
      }

      const isWinCell = winningCellIds?.has(cell.id);
      const dimFactor = hasWinners && !isWinCell ? 0.25 : 1;

      // Sprite — jar renders larger to compensate for image padding
      const spriteScale = cell.symbol === JAR_WILD ? 1.25 : 0.92;
      sp.visible = true;
      sp.x = bx;
      sp.y = by;
      sp.width = cellSize * spriteScale * sX;
      sp.height = cellSize * spriteScale * sY;
      sp.alpha = a * dimFactor;

      if (cell.symbol === JAR_WILD) {
        jarPositions.push({ cx: bx, cy: by, key: `${r},${c}` });
      }

      // Label — only show for scatter (all others have PNG textures)
      const showLabel = cell.symbol === 'scatter';
      lb.visible = showLabel;
      if (showLabel) {
        lb.x = bx;
        lb.y = by;
        lb.scale.set(sX * baseLabelScale, sY * baseLabelScale);
        lb.alpha = a * 0.9 * dimFactor;
      }

      // Jar multiplier badge — always show so players know it's a multiplier
      if (cell.symbol === JAR_WILD) {
        const jar = jarStates.find((j) => j.row === r && j.col === c);
        if (jar && jar.multiplier >= 1) {
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

  // Jar swarm sparkles (blurred layer)
  syncJarSwarms(jarPositions);
  const swarms = getJarSwarms();

  jarSparkleGfx.clear();
  for (const sw of swarms.values()) {
    const t = sw.elapsed / 1000;
    for (const s of sw.sparkles) {
      const orbitR = cellSize * s.radius;
      const wobble = Math.sin(t * 4.0 + s.phase) * cellSize * 0.14;
      const px = sw.cx + Math.cos(s.angle) * (orbitR + wobble);
      const py = sw.cy + Math.sin(s.angle) * (orbitR + wobble);
      const twinkle = 0.3 + 0.7 * Math.sin(t * 8 + s.phase);
      const breathe = 0.7 + 0.4 * Math.sin(t * 5.5 + s.phase * 1.7);
      const sz = s.size * breathe;
      const sa = 0.75 * twinkle;

      jarSparkleGfx.circle(px, py, sz * 3.0);
      jarSparkleGfx.fill({ color: s.color, alpha: sa * 0.08 });
      jarSparkleGfx.circle(px, py, sz * 2.0);
      jarSparkleGfx.fill({ color: s.color, alpha: sa * 0.18 });
      jarSparkleGfx.circle(px, py, sz * 1.2);
      jarSparkleGfx.fill({ color: s.color, alpha: sa * 0.4 });
      jarSparkleGfx.circle(px, py, sz * 0.5);
      jarSparkleGfx.fill({ color: 0xffffff, alpha: sa * 0.5 });
    }
  }

  // Explosion particles (unblurred)
  particleGfx.clear();
  const particles = getParticles();
  for (const p of particles) {
    const pa = 1 - p.life / p.maxLife;
    const sz = p.size * (0.6 + 0.8 * pa);
    // Outer bloom glow
    particleGfx.circle(p.x, p.y, sz * 2.5);
    particleGfx.fill({ color: p.color, alpha: pa * 0.15 });
    // Mid glow
    particleGfx.circle(p.x, p.y, sz * 1.6);
    particleGfx.fill({ color: p.color, alpha: pa * 0.35 });
    // White hot core
    particleGfx.circle(p.x, p.y, sz);
    particleGfx.fill({ color: 0xffffff, alpha: pa * 0.8 });
    // Colored core
    particleGfx.circle(p.x, p.y, sz * 0.7);
    particleGfx.fill({ color: p.color, alpha: pa * 1.0 });
  }

  // Floating win texts (pooled)
  const fws = getFloatingWins();
  for (let fi = 0; fi < floatTexts.length; fi++) {
    const ft = floatTexts[fi];
    if (fi < fws.length) {
      const fw = fws[fi];
      const t = fw.elapsedMs / fw.durationMs;
      const fa = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1;

      let nt: string;
      if (fw.label) {
        nt = fw.label;
      } else if (fw.multiplier && fw.multiplier > 1) {
        if (t < 0.2) {
          nt = `+$${(fw.baseAmount! / 100).toFixed(2)}`;
        } else if (t < 0.35) {
          nt = `+$${(fw.baseAmount! / 100).toFixed(2)} x${fw.multiplier}`;
        } else {
          nt = `+$${(fw.amount / 100).toFixed(2)}`;
        }
      } else {
        nt = `+$${(fw.amount / 100).toFixed(2)}`;
      }

      if (ft.text !== nt) ft.text = nt;
      ft.x = fw.x;
      ft.y = fw.y - t * cellSize * 2.5;
      ft.alpha = Math.max(0, fa);
      ft.scale.set(Math.min(cellSize * 0.45, 32) / BASE_FLOAT_SIZE);
      ft.visible = true;
    } else {
      ft.visible = false;
    }
  }

  pillContainer.visible = false;
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
  inFreeSpins?: boolean,
): void {
  if (!_root || _root !== root) initGridScene(root, renderer);
  updateGridScene(renderer, grid, jarStates, layout, winningCellIds, totalWinAmount, betAmount, inFreeSpins);
}
