/**
 * Retained-mode grid renderer for Starburst Galaxy.
 * Handles both 5×5 and 7×7 grids. Renders cell backgrounds, symbols, wild glow,
 * scatter multiplier badges, line highlights, particles, floating win texts.
 */

import { BlurFilter, Container, Graphics, Sprite, Text, TextStyle, type Renderer } from 'pixi.js';
import {
  BASE_GRID_COLS,
  BASE_GRID_ROWS,
  EXPANDED_GRID_COLS,
  EXPANDED_GRID_ROWS,
  SCATTER,
  SYMBOL_COLORS,
  WILD,
} from '../engine/symbols';
import type { Grid } from '../engine/grid';
import { getSymbolTexture } from './symbolTextures';
import { getCellAnimState, getCellPopState, getParticles, getFloatingWins } from './gridAnimations';

export interface GridLayout {
  gridX: number;
  gridY: number;
  cellSize: number;
  gap: number;
  rows: number;
  cols: number;
}

export function computeGridLayout(canvasW: number, canvasH: number, expanded: boolean): GridLayout {
  const rows = expanded ? EXPANDED_GRID_ROWS : BASE_GRID_ROWS;
  const cols = expanded ? EXPANDED_GRID_COLS : BASE_GRID_COLS;
  const isMobile = canvasW < 768;
  const hPad = isMobile ? canvasW * 0.04 : canvasW * 0.14;
  const vPad = isMobile ? canvasH * 0.04 : canvasH * 0.08;
  const availW = canvasW - hPad * 2;
  const availH = canvasH - vPad * 2;
  const totalGapRatio = 0.06;
  const cellWithGap = Math.min(availW / cols, availH / rows);
  const gap = cellWithGap * totalGapRatio;
  const cellSize = cellWithGap - gap;
  const totalW = cols * (cellSize + gap) - gap;
  const totalH = rows * (cellSize + gap) - gap;
  const gridX = (canvasW - totalW) / 2;
  const gridY = (canvasH - totalH) / 2 + (isMobile ? 10 : 6);
  return { gridX, gridY, cellSize, gap, rows, cols };
}

const MAX_CELLS = EXPANDED_GRID_ROWS * EXPANDED_GRID_COLS;
const FLOAT_POOL = 16;
const BASE_FLOAT_SIZE = 24;

let _root: Container | null = null;

let bgGfx: Graphics;
let cellBgGfx: Graphics;
let maskGfx: Graphics;
let symContainer: Container;
let wildGlowGfx: Graphics;
let glowGfx: Graphics;
let multBadgeGfx: Graphics;

const cellSprites: Sprite[] = [];
const multLabels: Text[] = [];

let particleGfx: Graphics;
const floatTexts: Text[] = [];

let animTime = 0;
let lastFrameTime = 0;

let prevLayoutKey = '';
let prevWinKey = '';
const prevCellIds: (number | null)[] = [];
const prevCellSyms: (string | null)[] = [];

export function initGridScene(root: Container, _renderer: Renderer): void {
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

  wildGlowGfx = new Graphics();
  wildGlowGfx.filters = [new BlurFilter({ strength: 7, quality: 3 })];
  symContainer.addChild(wildGlowGfx);

  glowGfx = new Graphics();
  symContainer.addChild(glowGfx);

  multBadgeGfx = new Graphics();
  root.addChild(multBadgeGfx);

  const multStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: 20,
    fontWeight: '900',
    fill: 0xffffff,
    stroke: { color: 0x220033, width: 2 },
  });

  for (let i = 0; i < MAX_CELLS; i++) {
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.visible = false;
    symContainer.addChild(sp);
    cellSprites.push(sp);

    const m = new Text({ text: '', style: multStyle });
    m.anchor.set(0.5);
    m.visible = false;
    root.addChild(m);
    multLabels.push(m);
  }

  particleGfx = new Graphics();
  root.addChild(particleGfx);

  const floatStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: BASE_FLOAT_SIZE,
    fontWeight: '900',
    fill: 0x7fd8ff,
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

  prevLayoutKey = '';
  prevWinKey = '';
  prevCellIds.length = MAX_CELLS;
  prevCellSyms.length = MAX_CELLS;
  prevCellIds.fill(null);
  prevCellSyms.fill(null);
}

function hslToHex(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export function updateGridScene(
  renderer: Renderer,
  grid: Grid,
  layout: GridLayout,
  winningCellIds?: Set<number>,
  _totalWinAmount?: number,
  _betAmount?: number,
  expanded?: boolean,
): void {
  if (!_root) return;
  const now = performance.now();
  if (lastFrameTime === 0) lastFrameTime = now;
  animTime += Math.min(now - lastFrameTime, 50);
  lastFrameTime = now;

  // If the grid's actual dimensions don't match the layout (e.g., a 5×5 grid being
  // drawn on a 7×7 layout during an expansion transition), fall back to a layout that
  // fits the grid so we never render empty cells at the edges.
  const actualRows = grid.length;
  const actualCols = grid[0]?.length ?? 0;
  if (actualRows > 0 && actualCols > 0 && (actualRows !== layout.rows || actualCols !== layout.cols)) {
    // Recompute a fitted layout that centers the grid in the same visual area.
    const cellWithGap = layout.cellSize + layout.gap;
    const totalW = actualCols * cellWithGap - layout.gap;
    const totalH = actualRows * cellWithGap - layout.gap;
    const prevTotalW = layout.cols * cellWithGap - layout.gap;
    const prevTotalH = layout.rows * cellWithGap - layout.gap;
    layout = {
      ...layout,
      rows: actualRows,
      cols: actualCols,
      gridX: layout.gridX + (prevTotalW - totalW) / 2,
      gridY: layout.gridY + (prevTotalH - totalH) / 2,
    };
  }

  const { gridX, gridY, cellSize, gap, rows, cols } = layout;
  const step = cellSize + gap;
  const bgPad = gap * 2;
  const gridW = cols * step - gap + bgPad * 2;
  const gridH = rows * step - gap + bgPad * 2;

  const lk = `${gridX | 0}:${gridY | 0}:${cellSize | 0}:${rows}:${cols}:${expanded ? 1 : 0}`;
  const layoutChanged = lk !== prevLayoutKey;

  let winKey = '';
  if (winningCellIds && winningCellIds.size > 0) {
    const arr = Array.from(winningCellIds).sort((a, b) => a - b);
    winKey = arr.join(',');
  }
  const winChanged = winKey !== prevWinKey;

  if (layoutChanged) {
    prevLayoutKey = lk;
    bgGfx.clear();

    const borderW = Math.max(16, cellSize * 0.2);
    const outerPad = bgPad + borderW;
    const outerW = gridW + borderW * 2;
    const outerH = gridH + borderW * 2;
    const outerR = 18;
    const innerR = 12;

    const frameOuter = expanded ? 0xff8fd5 : 0x6b8cff;
    const frameMid = expanded ? 0xbb3fa8 : 0x3f55cc;
    const frameInner = expanded ? 0x4a1160 : 0x141f66;
    const accent = expanded ? 0xffd6ff : 0x8fd0ff;

    bgGfx.roundRect(gridX - outerPad - 3, gridY - outerPad - 3, outerW + 6, outerH + 6, outerR + 2);
    bgGfx.fill({ color: frameMid, alpha: 0.3 });

    const layers = 6;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const inset = borderW * t;
      const w = borderW / layers + 1;
      const r = outerR - (outerR - innerR) * t;
      const color = t < 0.33 ? frameOuter : t < 0.66 ? frameMid : frameInner;
      bgGfx.roundRect(gridX - outerPad + inset, gridY - outerPad + inset, outerW - inset * 2, outerH - inset * 2, Math.max(r, 4));
      bgGfx.stroke({ color, width: w });
    }
    bgGfx.roundRect(gridX - outerPad, gridY - outerPad, outerW, outerH, outerR);
    bgGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.3 });
    bgGfx.roundRect(gridX - bgPad - 1, gridY - bgPad - 1, gridW + 2, gridH + 2, innerR);
    bgGfx.stroke({ color: 0x04061a, width: 3 });

    // Corner stars
    const cornerR = Math.max(5, borderW * 0.24);
    const corners: [number, number][] = [
      [gridX - outerPad + borderW * 0.55, gridY - outerPad + borderW * 0.55],
      [gridX + gridW + outerPad - borderW * 0.55, gridY - outerPad + borderW * 0.55],
      [gridX - outerPad + borderW * 0.55, gridY + gridH + outerPad - borderW * 0.55],
      [gridX + gridW + outerPad - borderW * 0.55, gridY + gridH + outerPad - borderW * 0.55],
    ];
    for (const [cx, cy] of corners) {
      const spikes = 4;
      for (let s = 0; s < spikes; s++) {
        const a = (s / spikes) * Math.PI * 2;
        const dx = Math.cos(a) * cornerR * 1.8;
        const dy = Math.sin(a) * cornerR * 1.8;
        const px = Math.cos(a + Math.PI / 2) * cornerR * 0.45;
        const py = Math.sin(a + Math.PI / 2) * cornerR * 0.45;
        bgGfx.moveTo(cx + px, cy + py);
        bgGfx.lineTo(cx + dx, cy + dy);
        bgGfx.lineTo(cx - px, cy - py);
        bgGfx.closePath();
        bgGfx.fill({ color: accent });
      }
      bgGfx.circle(cx, cy, cornerR * 0.7);
      bgGfx.fill({ color: 0xffffff });
    }

    bgGfx.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, innerR);
    bgGfx.fill({ color: expanded ? 0x1a0828 : 0x060820, alpha: 0.88 });

    maskGfx.clear();
    maskGfx.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, innerR);
    maskGfx.fill({ color: 0xffffff });
  }

  const hasWinners = !!winningCellIds && winningCellIds.size > 0;

  if (layoutChanged || winChanged) {
    prevWinKey = winKey;
    cellBgGfx.clear();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = gridX + c * step;
        const cy = gridY + r * step;
        const cell = grid[r]?.[c];
        const isWin = cell && winningCellIds?.has(cell.id);
        if (isWin) {
          const color = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
          cellBgGfx.roundRect(cx - 2, cy - 2, cellSize + 4, cellSize + 4, 10);
          cellBgGfx.fill({ color, alpha: 0.3 });
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x0b0e30, alpha: 0.6 });
          cellBgGfx.roundRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2, 7);
          cellBgGfx.stroke({ color, width: 2.5, alpha: 0.9 });
        } else if (hasWinners) {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x04061a, alpha: 0.6 });
        } else {
          cellBgGfx.roundRect(cx, cy, cellSize, cellSize, 8);
          cellBgGfx.fill({ color: 0x101638, alpha: 0.55 });
          cellBgGfx.roundRect(cx + 0.5, cy + 0.5, cellSize - 1, cellSize - 1, 7.5);
          cellBgGfx.stroke({ color: 0x2a3a75, width: 1, alpha: 0.35 });
        }
      }
    }
  }

  wildGlowGfx.clear();
  glowGfx.clear();
  multBadgeGfx.clear();

  // ---- Pre-pass: locate wild blocks so we can render each one as a single large icon
  // and skip the other cells that belong to the block. ----
  const gridRows = grid.length;
  const gridCols = grid[0]?.length ?? 0;
  type BlockInfo = { id: number; size: 2 | 3; topR: number; leftC: number };
  const blocks = new Map<number, BlockInfo>();
  const blockOrigin = new Map<number, string>(); // blockId -> "r,c" of top-left
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const wb = grid[r]?.[c]?.wildBlock;
      if (!wb) continue;
      const existing = blocks.get(wb.id);
      if (!existing) {
        blocks.set(wb.id, { id: wb.id, size: wb.size, topR: r, leftC: c });
      } else {
        if (r < existing.topR || (r === existing.topR && c < existing.leftC)) {
          existing.topR = r; existing.leftC = c;
        }
      }
    }
  }
  for (const b of blocks.values()) blockOrigin.set(b.id, `${b.topR},${b.leftC}`);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cell = grid[r]?.[c];
      const sp = cellSprites[i];
      const ml = multLabels[i];

      if (!cell || !sp) {
        if (sp) sp.visible = false;
        if (ml) ml.visible = false;
        prevCellIds[i] = null;
        prevCellSyms[i] = null;
        continue;
      }

      // Wild block: only render the sprite once (at the top-left of the block).
      // Other cells belonging to the block are hidden here; the big icon spans them.
      const wb = cell.wildBlock;
      if (wb) {
        const origin = blockOrigin.get(wb.id);
        if (origin !== `${r},${c}`) {
          sp.visible = false;
          ml.visible = false;
          prevCellIds[i] = cell.id;
          prevCellSyms[i] = cell.symbol;
          continue;
        }
      }

      if (prevCellIds[i] !== cell.id || prevCellSyms[i] !== cell.symbol) {
        sp.texture = getSymbolTexture(renderer, cell.symbol);
        prevCellIds[i] = cell.id;
        prevCellSyms[i] = cell.symbol;
      }

      const anim = getCellAnimState(cell.id);
      let xOff = 0, yOff = 0, sX = 1, sY = 1, a = 1;
      if (anim) { xOff = anim.xOffset; yOff = anim.yOffset; sX = anim.scaleX; sY = anim.scaleY; a = anim.alpha; }

      if (a <= 0.01 || (sX <= 0.01 && sY <= 0.01)) {
        sp.visible = false;
        ml.visible = false;
        continue;
      }

      // Effective footprint of this cell: usually 1×1, but wild blocks span size×size.
      const span = wb ? wb.size : 1;
      const footW = cellSize * span + gap * (span - 1);
      const footH = footW;

      const bx = gridX + c * step + footW / 2 + xOff * step;
      const by = gridY + r * step + footH / 2 + yOff * step;

      if (cell.symbol === SCATTER && a > 0.1) {
        const cx0 = gridX + c * step + xOff * step;
        const cy0 = gridY + r * step + yOff * step;
        glowGfx.roundRect(cx0 - 3, cy0 - 3, cellSize + 6, cellSize + 6, 10);
        glowGfx.fill({ color: 0xff7ad6, alpha: 0.3 * a });
        glowGfx.roundRect(cx0, cy0, cellSize, cellSize, 8);
        glowGfx.fill({ color: 0xff2da0, alpha: 0.55 * a });
        glowGfx.roundRect(cx0 + 1, cy0 + 1, cellSize - 2, cellSize - 2, 7);
        glowGfx.stroke({ color: 0xffe0f5, width: 2, alpha: 0.8 * a });
      }

      if (cell.symbol === WILD && !getCellPopState(cell.id)) {
        const t = animTime * 0.001;
        const p1 = 0.45 + 0.55 * Math.sin(t * 3.5);
        const p2 = 0.45 + 0.55 * Math.sin(t * 4.2 + 1.2);
        const p3 = 0.45 + 0.55 * Math.sin(t * 5.0 + 2.5);
        const hue = (animTime * 0.1) % 360;
        const c1 = hslToHex(hue, 0.8, 0.6);
        const c2 = hslToHex((hue + 90) % 360, 0.9, 0.6);
        const c3 = hslToHex((hue + 180) % 360, 0.85, 0.6);
        const as = (sX + sY) / 2;
        const glowRef = footW; // scale glow to block footprint
        wildGlowGfx.circle(bx, by, glowRef * 1.15 * as * p1);
        wildGlowGfx.fill({ color: c1, alpha: 0.14 * p1 });
        wildGlowGfx.circle(bx, by, glowRef * 0.95 * as * p2);
        wildGlowGfx.fill({ color: c2, alpha: 0.18 * p2 });
        wildGlowGfx.circle(bx, by, glowRef * 0.75 * as * p1);
        wildGlowGfx.fill({ color: c1, alpha: 0.22 * p1 });
        wildGlowGfx.circle(bx, by, glowRef * 0.55 * as * p3);
        wildGlowGfx.fill({ color: c3, alpha: 0.28 * p3 });
        wildGlowGfx.circle(bx, by, glowRef * 0.38 * as * p2);
        wildGlowGfx.fill({ color: 0xffffff, alpha: 0.24 * p2 });
      }

      // Block-aware "is any cell in this block a winner?" check.
      let blockHasWinner = winningCellIds?.has(cell.id) ?? false;
      if (wb && winningCellIds && !blockHasWinner) {
        outerBlock:
        for (let dr = 0; dr < wb.size; dr++) {
          for (let dc = 0; dc < wb.size; dc++) {
            const id = grid[r + dr]?.[c + dc]?.id;
            if (id !== undefined && winningCellIds.has(id)) { blockHasWinner = true; break outerBlock; }
          }
        }
      }

      if (blockHasWinner && !getCellPopState(cell.id)) {
        const as = (sX + sY) / 2;
        const col = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
        const gRef = wb ? footW * 0.5 : cellSize;
        glowGfx.circle(bx, by, gRef * 0.95 * as);
        glowGfx.fill({ color: col, alpha: 0.25 });
        glowGfx.circle(bx, by, gRef * 0.78 * as);
        glowGfx.fill({ color: col, alpha: 0.45 });
        glowGfx.circle(bx, by, gRef * 0.6 * as);
        glowGfx.fill({ color: col, alpha: 0.6 });
        glowGfx.circle(bx, by, gRef * 0.42 * as);
        glowGfx.fill({ color: 0xffffff, alpha: 0.45 });
      }

      const isWinCell = blockHasWinner;
      const dimFactor = hasWinners && !isWinCell ? 0.28 : 1;

      const baseScale = cell.symbol === WILD ? 1.1 : cell.symbol === SCATTER ? 1.05 : 0.92;
      const spriteScale = wb ? 1.1 : baseScale;
      sp.visible = true;
      sp.x = bx;
      sp.y = by;
      const targetSize = (wb ? footW : cellSize) * spriteScale;
      const texW = sp.texture.width || 1;
      const texH = sp.texture.height || 1;
      const aspect = texW / texH;
      if (aspect >= 1) {
        sp.width = targetSize * sX;
        sp.height = (targetSize / aspect) * sY;
      } else {
        sp.height = targetSize * sY;
        sp.width = (targetSize * aspect) * sX;
      }
      sp.alpha = a * dimFactor;
      sp.rotation = cell.symbol === WILD ? (animTime * 0.0003) % (Math.PI * 2) : 0;

      // Scatter multiplier badge.
      if (cell.symbol === SCATTER && cell.multiplier) {
        const badgeR = cellSize * 0.2;
        const bxPos = gridX + c * step + cellSize - badgeR - 2;
        const byPos = gridY + r * step + badgeR + 2;
        multBadgeGfx.circle(bxPos + 2, byPos + 2, badgeR);
        multBadgeGfx.fill({ color: 0x000000, alpha: 0.5 });
        multBadgeGfx.circle(bxPos, byPos, badgeR);
        multBadgeGfx.fill({ color: 0xffcf4d });
        multBadgeGfx.circle(bxPos, byPos, badgeR);
        multBadgeGfx.stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
        ml.text = `×${cell.multiplier}`;
        (ml.style as TextStyle).fontSize = Math.max(12, Math.round(badgeR * 0.9));
        ml.x = bxPos;
        ml.y = byPos;
        ml.visible = true;
      } else {
        ml.visible = false;
      }
    }
  }

  // Hide any remaining sprites/labels beyond the current grid size.
  for (let i = rows * cols; i < MAX_CELLS; i++) {
    if (cellSprites[i]) cellSprites[i].visible = false;
    if (multLabels[i]) multLabels[i].visible = false;
  }

  particleGfx.clear();
  const particles = getParticles();
  for (const p of particles) {
    const pa = 1 - p.life / p.maxLife;
    const tw = 0.6 + 0.4 * Math.sin(p.twinkle * 3 + p.life * 0.01);
    const sz = p.size * (0.4 + 0.6 * pa) * tw;
    particleGfx.circle(p.x, p.y, sz * 2.5);
    particleGfx.fill({ color: p.color, alpha: pa * 0.14 });
    particleGfx.circle(p.x, p.y, sz * 1.4);
    particleGfx.fill({ color: p.color, alpha: pa * 0.4 });
    particleGfx.circle(p.x, p.y, sz * 0.6);
    particleGfx.fill({ color: 0xffffff, alpha: pa * 0.9 });
    const rayLen = sz * 3;
    const cos = Math.cos(p.rotation);
    const sin = Math.sin(p.rotation);
    particleGfx.moveTo(p.x - rayLen * cos, p.y - rayLen * sin);
    particleGfx.lineTo(p.x + rayLen * cos, p.y + rayLen * sin);
    particleGfx.stroke({ color: p.color, alpha: pa * 0.55, width: sz * 0.35 });
    particleGfx.moveTo(p.x + rayLen * sin, p.y - rayLen * cos);
    particleGfx.lineTo(p.x - rayLen * sin, p.y + rayLen * cos);
    particleGfx.stroke({ color: p.color, alpha: pa * 0.55, width: sz * 0.35 });
  }

  const fws = getFloatingWins();
  for (let fi = 0; fi < floatTexts.length; fi++) {
    const ft = floatTexts[fi];
    if (fi < fws.length) {
      const fw = fws[fi];
      const t = fw.elapsedMs / fw.durationMs;
      const fa = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      const nt = fw.label ?? `+$${(fw.amount / 100).toFixed(2)}`;
      if (ft.text !== nt) ft.text = nt;
      (ft.style as TextStyle).fill = 0x7fd8ff;
      ft.x = fw.x;
      ft.y = fw.y - t * cellSize * 2.0;
      ft.alpha = Math.max(0, fa);
      ft.scale.set(Math.min(cellSize * 0.45, 32) / BASE_FLOAT_SIZE);
      ft.visible = true;
    } else {
      ft.visible = false;
    }
  }
}

export function destroyGridScene(): void {
  cellSprites.length = 0;
  multLabels.length = 0;
  floatTexts.length = 0;
  if (_root && !(_root as unknown as { destroyed: boolean }).destroyed) {
    _root.removeChildren();
  }
  _root = null;
  prevLayoutKey = '';
  prevWinKey = '';
  prevCellIds.length = 0;
  prevCellSyms.length = 0;
}

export function drawGridScene(
  root: Container,
  renderer: Renderer,
  grid: Grid,
  layout: GridLayout,
  winningCellIds?: Set<number>,
  totalWinAmount?: number,
  betAmount?: number,
  expanded?: boolean,
): void {
  if (!_root || _root !== root) initGridScene(root, renderer);
  updateGridScene(renderer, grid, layout, winningCellIds, totalWinAmount, betAmount, expanded);
}
