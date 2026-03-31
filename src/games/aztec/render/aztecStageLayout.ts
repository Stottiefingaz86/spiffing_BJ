import { REELS, ROWS } from '../engine/symbols';
import { QR_FRAME, QR_PLAYFIELD } from './aztecLayout';

export interface AztecStageLayout {
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  /** Full reel window on screen (matches `QR_PLAYFIELD` on the scaled frame). */
  innerX: number;
  innerY: number;
  innerW: number;
  innerH: number;
  gridX: number;
  gridY: number;
  cellW: number;
  cellH: number;
  gap: number;
}

/** Playfield opening as fractions of the full frame bitmap (matches `QR_PLAYFIELD`). */
const INNER_X = QR_PLAYFIELD.x;
const INNER_Y = QR_PLAYFIELD.y;
const INNER_W = QR_PLAYFIELD.w;
const INNER_H = QR_PLAYFIELD.h;

const FRAME_ASPECT = QR_FRAME.w / QR_FRAME.h;

/**
 * Push reel grid + mask down vs `QR_PLAYFIELD` (logical px).
 * Frame art’s hole sits slightly lower than mask.png’s top edge; ~46px matches the stone opening on desktop.
 * Compact phones use a smaller nudge so tiles don’t crowd the bottom gem.
 */
const QR_PLAYFIELD_OFFSET_Y_CSS = 46;

/** Move the 5×3 grid up (CSS px). Too large vs frame art reads as tiles clipping the top bezel. */
const AZTEC_GRID_SHIFT_UP_CSS = 10;

/** Positive = shift grid left (CSS px) vs `QR_PLAYFIELD` — tweak optical centre vs frame art. */
const AZTEC_GRID_NUDGE_LEFT_PX = 2;

/**
 * Per-cell size tweak vs `QR_PLAYFIELD` inner (CSS px on width and height).
 * Positive = smaller cells; 0 = match layout fractions; negative = larger (can crowd the bezel).
 */
const AZTEC_CELL_SHRINK_PX = 2;

/**
 * Uniform scale for frame + reels vs the Quest Raider layout path (Aztec art / mask fractions read larger otherwise).
 * 1 = same algorithmic size as QR; lower = smaller on screen.
 */
const AZTEC_STAGE_VISUAL_SCALE = 0.84;

/**
 * Pixi v8 `renderer.width` / `height` with `resizeTo` are **logical (CSS) pixels**, not backing-store pixels.
 * Do not divide by `devicePixelRatio` here — that broke breakpoints, inner Y nudge, mask vs grid, and HTML overlays.
 *
 * Phone-class viewports: cover-fit so the board fills the canvas. Uses min(width,height) so landscape phones qualify.
 * Larger viewports: contain or mild overshoot.
 */
export function computeAztecStageLayout(canvasW: number, canvasH: number): AztecStageLayout {
  const cssW = canvasW;
  const cssH = canvasH;
  const minCss = Math.min(cssW, cssH);
  const isCompactPhone = minCss < 520;
  const usePhoneCover = minCss < 640;

  let frameW: number;
  let frameH: number;
  let frameX: number;
  let frameY: number;

  if (usePhoneCover) {
    frameH = canvasH;
    frameW = frameH * FRAME_ASPECT;
    if (frameW < canvasW) {
      frameW = canvasW;
      frameH = frameW / FRAME_ASPECT;
    }
    frameX = Math.floor((canvasW - frameW) / 2);
    frameY = Math.floor((canvasH - frameH) / 2);
  } else {
    const overshoot = cssW < 768 ? 1.07 : 1.0;
    const availH = canvasH;
    frameW = canvasW * overshoot;
    frameH = frameW / FRAME_ASPECT;
    if (frameH > availH) {
      frameH = availH;
      frameW = frameH * FRAME_ASPECT;
    }
    frameX = Math.floor((canvasW - frameW) / 2);
    frameY = Math.floor((canvasH - frameH) / 2);
  }

  frameW = Math.max(1, Math.floor(frameW * AZTEC_STAGE_VISUAL_SCALE));
  frameH = Math.max(1, Math.floor(frameH * AZTEC_STAGE_VISUAL_SCALE));
  frameX = Math.floor((canvasW - frameW) / 2);
  const maxTop = Math.max(0, canvasH - frameH);
  /** Vertically centre frame + grid in the canvas (full-viewport Pixi host under overlaid HUD). */
  frameY = Math.max(0, Math.min(maxTop, Math.floor((canvasH - frameH) / 2)));

  const baseInnerX = frameX + frameW * INNER_X;
  const yNudgeCss = usePhoneCover
    ? isCompactPhone
      ? Math.min(QR_PLAYFIELD_OFFSET_Y_CSS, 18)
      : QR_PLAYFIELD_OFFSET_Y_CSS
    : QR_PLAYFIELD_OFFSET_Y_CSS;
  const yNudgeScaled = Math.round(yNudgeCss * AZTEC_STAGE_VISUAL_SCALE);
  const baseInnerY = frameY + frameH * INNER_Y + yNudgeScaled - AZTEC_GRID_SHIFT_UP_CSS;
  const baseInnerW = frameW * INNER_W;
  const baseInnerH = frameH * INNER_H;

  const shrinkW = REELS * AZTEC_CELL_SHRINK_PX;
  const shrinkH = ROWS * AZTEC_CELL_SHRINK_PX;
  const innerPxW = Math.max(1, baseInnerW - shrinkW);
  const innerPxH = Math.max(1, baseInnerH - shrinkH);
  const innerX = baseInnerX + shrinkW / 2 - AZTEC_GRID_NUDGE_LEFT_PX;
  const innerY = baseInnerY + shrinkH / 2;

  const gap = 0;
  const cellW = innerPxW / REELS;
  const cellH = innerPxH / ROWS;
  const gridX = innerX;
  const gridY = innerY;

  return {
    frameX,
    frameY,
    frameW,
    frameH,
    innerX,
    innerY,
    innerW: innerPxW,
    innerH: innerPxH,
    gridX,
    gridY,
    cellW,
    cellH,
    gap,
  };
}
