/**
 * Breaking Bandits–style vertical reel strips for Aztec (Temple symbols + Aztec textures).
 * Used only during spin drop; cascades still use the slab grid renderer.
 */

import { Container, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import {
  REELS,
  ROWS,
  SYMBOL_LABELS,
  TempleSymbol,
  randomSymbolForColumn,
} from '../engine/symbols';
import type { Grid } from '../engine/grid';
import { isSpinPaddingCell } from '../engine/grid';
import { getAztecSymbolTexture } from './aztecSymbolTextures';
import type { ReelAnimState } from '../../shared/reelAnimator';
import {
  computeGridLayout,
  symbolTextureCoverFit,
  symbolTextureOpticalOffsetY,
} from './drawGrid';
import { computeAztecStageLayout } from './aztecStageLayout';

const STRIP_SIZE = ROWS + 2;
const VISUAL_STRIP_LENGTH = 300;
const LANDING_CYCLES = 4;

export interface AztecReelLayout {
  gridX: number;
  gridY: number;
  cellW: number;
  cellH: number;
  gap: number;
  cellStep: number;
  totalW: number;
  totalH: number;
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
}

export function computeAztecReelLayout(canvasW: number, canvasH: number): AztecReelLayout {
  const g = computeGridLayout(canvasW, canvasH);
  const stage = computeAztecStageLayout(canvasW, canvasH);
  const cellStep = g.cellH + g.gap;
  const totalW = REELS * g.cellW + (REELS - 1) * g.gap;
  const totalH = ROWS * g.cellH + (ROWS - 1) * g.gap;
  return {
    ...g,
    cellStep,
    totalW,
    totalH,
    frameX: stage.frameX,
    frameY: stage.frameY,
    frameW: stage.frameW,
    frameH: stage.frameH,
  };
}

/** Bandits order: `reelGrid[reel][row]` top→bottom. */
export function gridToReelMajorSymbols(grid: Grid): TempleSymbol[][] {
  const reels: TempleSymbol[][] = [];
  for (let c = 0; c < REELS; c++) {
    const col: TempleSymbol[] = [];
    for (let r = 0; r < ROWS; r++) {
      const cell = grid[r][c];
      col.push(isSpinPaddingCell(cell) ? TempleSymbol.BirdBlue : cell.symbol);
    }
    reels.push(col);
  }
  return reels;
}

interface ReelStrip {
  container: Container;
  sprites: Sprite[];
  labels: Text[];
  symbols: TempleSymbol[];
  visualStrip: TempleSymbol[];
  stripCursor: number;
  lastTotalCells: number;
  landingStarted: boolean;
  landingCyclesLeft: number;
  landed: boolean;
  finalized: boolean;
}

let sceneRoot: Container | null = null;
let reelStrips: ReelStrip[] = [];
let lastLayoutKey = '';

function layoutKey(l: AztecReelLayout, inFreeSpins: boolean): string {
  return `${l.gridX},${l.gridY},${l.cellW},${l.cellH},${l.gap},${l.cellStep},${inFreeSpins ? 1 : 0}`;
}

function texFor(sym: TempleSymbol): Texture {
  return getAztecSymbolTexture(sym) ?? Texture.WHITE;
}

function minCellDim(layout: AztecReelLayout): number {
  return Math.min(layout.cellW, layout.cellH);
}

/** Same cover-fit + centering as `updateGridScene` so spin and settled tiles match. */
function layoutStripSymbolSprite(
  sprite: Sprite,
  rx: number,
  baseY: number,
  cellW: number,
  cellH: number,
  minDim: number,
  pixelOffsetY: number,
  bounceY: number,
): void {
  const tex = sprite.texture;
  const tw = Math.max(1, tex.width);
  const th = Math.max(1, tex.height);
  const maxW = Math.max(1, cellW);
  const maxH = Math.max(1, cellH);
  const fit = symbolTextureCoverFit(maxW, maxH, tw, th);
  sprite.anchor.set(0.5, 0.5);
  const cx = rx + cellW / 2;
  const cy = baseY + pixelOffsetY + bounceY + cellH / 2 + symbolTextureOpticalOffsetY(minDim);
  sprite.position.set(cx, cy);
  sprite.width = tw * fit;
  sprite.height = th * fit;
}

export function initAztecReelScene(
  parent: Container,
  reelGrid: TempleSymbol[][],
  layout: AztecReelLayout,
  inFreeSpins: boolean,
): void {
  destroyAztecReelScene();
  sceneRoot = new Container();
  parent.addChild(sceneRoot);
  reelStrips = [];

  const minDim = minCellDim(layout);
  const labelStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: Math.min(layout.cellW * 0.32, 24),
    fontWeight: '800',
    fill: 0xf5f0e6,
    align: 'center',
    stroke: { color: 0x1a1208, width: 3 },
  });

  for (let r = 0; r < REELS; r++) {
    const rx = layout.gridX + r * (layout.cellW + layout.gap);
    const container = new Container();
    sceneRoot.addChild(container);

    const sprites: Sprite[] = [];
    const labels: Text[] = [];
    const symbols: TempleSymbol[] = [
      randomSymbolForColumn(r),
      reelGrid[r]?.[0] ?? TempleSymbol.BirdBlue,
      reelGrid[r]?.[1] ?? TempleSymbol.BirdBlue,
      reelGrid[r]?.[2] ?? TempleSymbol.BirdBlue,
      randomSymbolForColumn(r),
    ];

    for (let i = 0; i < STRIP_SIZE; i++) {
      const sym = symbols[i];
      const sprite = new Sprite(texFor(sym));
      container.addChild(sprite);
      sprites.push(sprite);

      const baseY = layout.gridY + (i - 1) * layout.cellStep;
      layoutStripSymbolSprite(sprite, rx, baseY, layout.cellW, layout.cellH, minDim, 0, 0);

      const label = new Text({
        text: SYMBOL_LABELS[sym] ?? '',
        style: labelStyle,
      });
      label.anchor.set(0.5);
      label.x = rx + layout.cellW / 2;
      label.y = baseY + layout.cellH / 2;
      const rawTex = getAztecSymbolTexture(sym);
      label.visible = !(rawTex && rawTex.width > 0);
      container.addChild(label);
      labels.push(label);
    }

    reelStrips.push({
      container,
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

  lastLayoutKey = layoutKey(layout, inFreeSpins);
}

export function startAztecReelSpin(): void {
  reelStrips.forEach((strip, reelIndex) => {
    strip.lastTotalCells = 0;
    strip.landingStarted = false;
    strip.landingCyclesLeft = 0;
    strip.landed = false;
    strip.finalized = false;
    strip.visualStrip = [];
    for (let i = 0; i < VISUAL_STRIP_LENGTH; i++) {
      strip.visualStrip.push(randomSymbolForColumn(reelIndex));
    }
    strip.stripCursor = 0;
  });
}

export function prepareAztecReelLanding(reelIndex: number, resultSymbols: TempleSymbol[]): boolean {
  const strip = reelStrips[reelIndex];
  if (!strip || strip.landingStarted) return false;

  strip.landingStarted = true;
  strip.landingCyclesLeft = LANDING_CYCLES;

  const c = strip.stripCursor;
  while (strip.visualStrip.length < c + LANDING_CYCLES) {
    strip.visualStrip.push(randomSymbolForColumn(reelIndex));
  }
  strip.visualStrip[c] = resultSymbols[2] ?? TempleSymbol.BirdBlue;
  strip.visualStrip[c + 1] = resultSymbols[1] ?? TempleSymbol.BirdBlue;
  strip.visualStrip[c + 2] = resultSymbols[0] ?? TempleSymbol.BirdBlue;
  strip.visualStrip[c + 3] = randomSymbolForColumn(reelIndex);

  return true;
}

export function updateAztecReelScene(
  reelGrid: TempleSymbol[][],
  layout: AztecReelLayout,
  animStates: ReelAnimState[],
  inFreeSpins: boolean,
): void {
  if (!sceneRoot) return;

  const lk = layoutKey(layout, inFreeSpins);
  if (lk !== lastLayoutKey) {
    const parent = sceneRoot.parent;
    if (parent) {
      const old = gridToReelMajorFromStrips();
      initAztecReelScene(parent, old.length ? old : reelGrid, layout, inFreeSpins);
      startAztecReelSpin();
    }
    return;
  }

  const minDim = minCellDim(layout);

  for (let r = 0; r < REELS; r++) {
    const strip = reelStrips[r];
    const anim = animStates[r];
    if (!strip) continue;

    const rx = layout.gridX + r * (layout.cellW + layout.gap);
    const g0 = reelGrid[r]?.[0] ?? TempleSymbol.BirdBlue;
    const g1 = reelGrid[r]?.[1] ?? TempleSymbol.BirdBlue;
    const g2 = reelGrid[r]?.[2] ?? TempleSymbol.BirdBlue;

    if (anim.spinning) {
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

      if (strip.landed) {
        strip.symbols[1] = g0;
        strip.symbols[2] = g1;
        strip.symbols[3] = g2;
      }

      for (let i = 0; i < STRIP_SIZE; i++) {
        const sym = strip.symbols[i];
        const t = texFor(sym);
        if (strip.sprites[i].texture !== t) strip.sprites[i].texture = t;
        const lt = SYMBOL_LABELS[sym] ?? '';
        if (strip.labels[i].text !== lt) strip.labels[i].text = lt;
        const rawTex = getAztecSymbolTexture(sym);
        const hasTex = Boolean(rawTex && rawTex.width > 0);
        strip.labels[i].visible = !hasTex && (anim.isLanding || anim.speed < 0.15);
      }

      const pixelOffset = anim.cellOffset * layout.cellStep;
      let alpha: number;
      if (anim.isLanding) {
        alpha = 1;
      } else if (anim.speed > 0.25) {
        alpha = 0.65;
      } else if (anim.speed > 0.1) {
        alpha = 0.8;
      } else {
        alpha = 1;
      }

      for (let i = 0; i < STRIP_SIZE; i++) {
        const baseY = layout.gridY + (i - 1) * layout.cellStep;
        const sym = strip.symbols[i];
        layoutStripSymbolSprite(
          strip.sprites[i],
          rx,
          baseY,
          layout.cellW,
          layout.cellH,
          minDim,
          pixelOffset,
          0,
        );
        strip.sprites[i].alpha = alpha;

        strip.labels[i].x = rx + layout.cellW / 2;
        strip.labels[i].y = baseY + pixelOffset + layout.cellH / 2;
      }
    } else {
      if (!strip.finalized) {
        strip.symbols[0] = randomSymbolForColumn(r);
        strip.symbols[4] = randomSymbolForColumn(r);
      }
      strip.symbols[1] = g0;
      strip.symbols[2] = g1;
      strip.symbols[3] = g2;
      strip.landed = true;
      strip.finalized = true;

      for (let i = 0; i < STRIP_SIZE; i++) {
        const sym = strip.symbols[i];
        const t = texFor(sym);
        if (strip.sprites[i].texture !== t) strip.sprites[i].texture = t;

        const baseY = layout.gridY + (i - 1) * layout.cellStep;
        layoutStripSymbolSprite(
          strip.sprites[i],
          rx,
          baseY,
          layout.cellW,
          layout.cellH,
          minDim,
          0,
          anim.bounceY,
        );
        strip.sprites[i].alpha = 1;

        const lt = SYMBOL_LABELS[sym] ?? '';
        if (strip.labels[i].text !== lt) strip.labels[i].text = lt;
        strip.labels[i].x = rx + layout.cellW / 2;
        strip.labels[i].y = baseY + anim.bounceY + layout.cellH / 2;
        const rawTex = getAztecSymbolTexture(sym);
        strip.labels[i].visible = !(rawTex && rawTex.width > 0);
      }
    }
  }
}

function gridToReelMajorFromStrips(): TempleSymbol[][] {
  const out: TempleSymbol[][] = [];
  for (let r = 0; r < reelStrips.length; r++) {
    const s = reelStrips[r]?.symbols;
    if (s && s.length >= 4) {
      out.push([s[1], s[2], s[3]]);
    }
  }
  return out;
}

export function destroyAztecReelScene(): void {
  if (sceneRoot) {
    sceneRoot.destroy({ children: true });
    sceneRoot = null;
  }
  reelStrips = [];
  lastLayoutKey = '';
}
