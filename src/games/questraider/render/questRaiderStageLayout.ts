import { REELS, ROWS } from '../engine/symbols';
import { QR_FRAME, QR_PLAYFIELD } from './questRaiderLayout';

export interface QuestRaiderStageLayout {
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

/** Extra nudge so tiles + mask track the stone opening (CSS px). */
const QR_REEL_FINE_NUDGE_Y_PX = 6;

/**
 * Pixi v8 `renderer.width` / `height` with `resizeTo` are **logical (CSS) pixels**, not backing-store pixels.
 * Do not divide by `devicePixelRatio` here — that broke breakpoints, inner Y nudge, mask vs grid, and HTML overlays.
 *
 * Phone-class viewports: cover-fit so the board fills the canvas. Uses min(width,height) so landscape phones qualify.
 * Larger viewports: contain or mild overshoot.
 */
export function computeQuestRaiderStageLayout(canvasW: number, canvasH: number): QuestRaiderStageLayout {
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

  const innerX = frameX + frameW * INNER_X;
  const yNudgeCss = usePhoneCover
    ? isCompactPhone
      ? Math.min(QR_PLAYFIELD_OFFSET_Y_CSS, 18)
      : QR_PLAYFIELD_OFFSET_Y_CSS
    : QR_PLAYFIELD_OFFSET_Y_CSS;
  const innerY = frameY + frameH * INNER_Y + yNudgeCss + QR_REEL_FINE_NUDGE_Y_PX;
  const innerPxW = frameW * INNER_W;
  const innerPxH = frameH * INNER_H;

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
