/**
 * Draws the Froot Jarz 8x8 grid onto a Pixi Container.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Renderer } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, JAR_WILD, SYMBOL_COLORS, SYMBOL_LABELS } from '../engine/symbols';
import type { Grid } from '../engine/grid';
import type { JarState } from '../engine/jarWild';
import { getSymbolTexture } from './symbolTextures';
import {
  getCellDropOutState,
  getCellDropInState,
  getCellHighlightState,
  getCellPopState,
  getCellFallState,
  getParticles,
  getFloatingWins,
} from './gridAnimations';

export interface GridLayout {
  gridX: number;
  gridY: number;
  cellSize: number;
  gap: number;
}

export function computeGridLayout(canvasW: number, canvasH: number): GridLayout {
  const padding = Math.min(canvasW, canvasH) * 0.04;
  const availW = canvasW - padding * 2;
  const availH = canvasH - padding * 2;
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
  root.removeChildren();

  const { gridX, gridY, cellSize, gap } = layout;
  const step = cellSize + gap;
  const bgPad = gap * 2;
  const gridW = GRID_COLS * step - gap + bgPad * 2;
  const gridH = GRID_ROWS * step - gap + bgPad * 2;

  // Grid background
  const bg = new Graphics();
  bg.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, 12);
  bg.fill({ color: 0x1a1230, alpha: 0.85 });
  bg.stroke({ color: 0xffffff, alpha: 0.06, width: 2 });
  root.addChild(bg);

  // Cell backgrounds — highlight winning cells with fruit color glow
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cx = gridX + c * step;
      const cy = gridY + r * step;
      const cell = grid[r]?.[c];
      const isWinning = cell && winningCellIds?.has(cell.id);
      const cellBg = new Graphics();
      if (isWinning) {
        const color = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
        cellBg.roundRect(cx, cy, cellSize, cellSize, 8);
        cellBg.fill({ color, alpha: 0.25 });
        cellBg.roundRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2, 7);
        cellBg.stroke({ color, width: 2, alpha: 0.5 });
      } else {
        cellBg.roundRect(cx, cy, cellSize, cellSize, 8);
        cellBg.fill({ color: 0x2a1f45, alpha: 0.5 });
      }
      root.addChild(cellBg);
    }
  }

  // Masked container for symbols — nothing renders outside the grid
  const symbolContainer = new Container();
  const mask = new Graphics();
  mask.roundRect(gridX - bgPad, gridY - bgPad, gridW, gridH, 12);
  mask.fill({ color: 0xffffff });
  root.addChild(mask);
  symbolContainer.mask = mask;
  root.addChild(symbolContainer);

  // Symbols (rendered inside masked container)
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;

      const baseCx = gridX + c * step + cellSize / 2;
      const baseCy = gridY + r * step + cellSize / 2;

      // Check animation states in priority order
      const dropOutState = getCellDropOutState(cell.id);
      const dropInState = getCellDropInState(cell.id);
      const highlightState = getCellHighlightState(cell.id);
      const popState = getCellPopState(cell.id);
      const fallState = getCellFallState(cell.id);

      let yOffset = 0;
      let scale = 1;
      let scaleX = 1;
      let scaleY = 1;
      let alpha = 1;

      if (dropOutState) {
        yOffset = dropOutState.yOffset * step;
        scale = dropOutState.scale;
        scaleX = dropOutState.scaleX ?? scale;
        scaleY = dropOutState.scaleY ?? scale;
        alpha = dropOutState.alpha;
      } else if (dropInState) {
        yOffset = dropInState.yOffset * step;
        scale = dropInState.scale;
        scaleX = dropInState.scaleX ?? scale;
        scaleY = dropInState.scaleY ?? scale;
        alpha = dropInState.alpha;
      } else if (popState) {
        scale = popState.scale;
        scaleX = scale;
        scaleY = scale;
        alpha = popState.alpha;
      } else if (highlightState) {
        scale = highlightState.scale;
        scaleX = scale;
        scaleY = scale;
      } else if (fallState) {
        yOffset = fallState.yOffset * step;
        scale = fallState.scale;
        scaleX = fallState.scaleX ?? scale;
        scaleY = fallState.scaleY ?? scale;
      }

      if (alpha <= 0.01 || (scaleX <= 0.01 && scaleY <= 0.01)) continue;

      const isWinning = winningCellIds?.has(cell.id);

      // Winning cell glow — bright radial bloom before explosion
      if (isWinning && !popState) {
        const avgScale = (scaleX + scaleY) / 2;
        const color = SYMBOL_COLORS[cell.symbol] ?? 0xffffff;
        const cx = baseCx;
        const cy = baseCy + yOffset;
        // Each ring is a separate Graphics to avoid Pixi path accumulation artifacts
        const g1 = new Graphics();
        g1.circle(cx, cy, cellSize * 0.72 * avgScale);
        g1.fill({ color, alpha: 0.12 });
        symbolContainer.addChild(g1);
        const g2 = new Graphics();
        g2.circle(cx, cy, cellSize * 0.6 * avgScale);
        g2.fill({ color, alpha: 0.25 });
        symbolContainer.addChild(g2);
        const g3 = new Graphics();
        g3.circle(cx, cy, cellSize * 0.5 * avgScale);
        g3.fill({ color, alpha: 0.4 });
        symbolContainer.addChild(g3);
        // Bright white-ish core for the "about to burst" feel
        const g4 = new Graphics();
        g4.circle(cx, cy, cellSize * 0.42 * avgScale);
        g4.fill({ color: 0xffffff, alpha: 0.18 });
        symbolContainer.addChild(g4);
      }

      const tex = getSymbolTexture(renderer, cell.symbol);
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.x = baseCx;
      sprite.y = baseCy + yOffset;
      sprite.width = cellSize * 0.88 * scaleX;
      sprite.height = cellSize * 0.88 * scaleY;
      sprite.alpha = alpha;
      symbolContainer.addChild(sprite);

      // Symbol label
      const avgScale = (scaleX + scaleY) / 2;
      const labelStyle = new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: cellSize * 0.32 * avgScale,
        fontWeight: '800',
        fill: 0xffffff,
        align: 'center',
      });
      const labelText = new Text({ text: SYMBOL_LABELS[cell.symbol], style: labelStyle });
      labelText.anchor.set(0.5);
      labelText.x = baseCx;
      labelText.y = baseCy + yOffset;
      labelText.alpha = alpha * 0.9;
      symbolContainer.addChild(labelText);

      // Jar multiplier badge
      if (cell.symbol === JAR_WILD) {
        const jar = jarStates.find((j) => j.row === r && j.col === c);
        if (jar && jar.multiplier > 1) {
          const badgeSize = cellSize * 0.32;
          const badgeBg = new Graphics();
          badgeBg.circle(baseCx + cellSize * 0.32, baseCy + yOffset - cellSize * 0.32, badgeSize / 2);
          badgeBg.fill({ color: 0xe53935 });
          badgeBg.stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
          symbolContainer.addChild(badgeBg);

          const multStyle = new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: badgeSize * 0.65,
            fontWeight: '900',
            fill: 0xffffff,
          });
          const multText = new Text({ text: `x${jar.multiplier}`, style: multStyle });
          multText.anchor.set(0.5);
          multText.x = baseCx + cellSize * 0.32;
          multText.y = baseCy + yOffset - cellSize * 0.32;
          symbolContainer.addChild(multText);
        }
      }
    }
  }


  // Particles
  const particles = getParticles();
  if (particles.length > 0) {
    const pg = new Graphics();
    for (const p of particles) {
      const a = 1 - p.life / p.maxLife;
      const sz = p.size * (0.4 + 0.6 * a);
      pg.circle(p.x, p.y, sz);
      pg.fill({ color: p.color, alpha: a * 0.9 });
    }
    root.addChild(pg);
  }

  // Floating small win texts (drift up + fade out)
  const floatingWins = getFloatingWins();
  for (const fw of floatingWins) {
    const t = fw.elapsedMs / fw.durationMs;
    // Visible for 75%, fade over last 25%
    const alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    const drift = t * cellSize * 1.6;
    const sz = Math.min(cellSize * 0.4, 30);

    const fwStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: sz,
      fontWeight: '900',
      fill: 0x6ee7b7, // bright emerald-300
      dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 2, angle: Math.PI / 2 },
      align: 'center',
    });
    const fwText = new Text({
      text: `+$${(fw.amount / 100).toFixed(2)}`,
      style: fwStyle,
    });
    fwText.anchor.set(0.5);
    fwText.x = fw.x;
    fwText.y = fw.y - drift;
    fwText.alpha = Math.max(0, alpha);
    root.addChild(fwText);
  }

  // Big total win pill — only shows when total win >= 5x bet
  const bet = betAmount ?? 0;
  if (totalWinAmount && totalWinAmount > 0 && bet > 0 && totalWinAmount >= bet * 5) {
    const cx = gridX + (GRID_COLS * step - gap) / 2;
    const cy = gridY + (GRID_ROWS * step - gap) / 2;
    const pillW = Math.min(cellSize * 4.5, GRID_COLS * step * 0.55);
    const pillH = cellSize * 1.5;

    const pillBg = new Graphics();
    pillBg.roundRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
    pillBg.fill({ color: 0x000000, alpha: 0.7 });
    pillBg.stroke({ color: 0xfdd835, width: 3, alpha: 0.85 });
    root.addChild(pillBg);

    const winStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: Math.min(cellSize * 0.9, 56),
      fontWeight: '900',
      fill: 0xfdd835,
      align: 'center',
    });
    const winText = new Text({
      text: `$${(totalWinAmount / 100).toFixed(2)}`,
      style: winStyle,
    });
    winText.anchor.set(0.5);
    winText.x = cx;
    winText.y = cy;
    root.addChild(winText);
  }
}
