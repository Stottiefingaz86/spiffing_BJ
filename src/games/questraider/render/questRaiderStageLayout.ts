import { REELS, ROWS } from '../engine/symbols';
import { QR_FRAME, QR_PLAYFIELD } from './questRaiderLayout';

/** Native frame height for `frame.png` — used to scale Y nudge so mask/grid track the stone hole at every scale. */
const QR_FRAME_H = QR_FRAME.h;

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
 * Authored **at native `frame.png` height** (`QR_FRAME.h`): pushes reel mask/grid down vs `QR_PLAYFIELD.y`
 * so `mask.png` lines up with the carved window. Scales with rendered `frameH`.
 */
const QR_PLAYFIELD_OFFSET_Y_AT_NATIVE = 46;

/** Extra offset at native frame height (px on 1:1 art). */
const QR_REEL_FINE_NUDGE_Y_AT_NATIVE = 6;

function nudgeYForFrameH(
  frameH: number,
  isPhoneClass: boolean,
  isCompactPhone: boolean,
): number {
  const yOffsetAtNative =
    isPhoneClass && isCompactPhone
      ? Math.min(QR_PLAYFIELD_OFFSET_Y_AT_NATIVE, 18) + QR_REEL_FINE_NUDGE_Y_AT_NATIVE
      : QR_PLAYFIELD_OFFSET_Y_AT_NATIVE + QR_REEL_FINE_NUDGE_Y_AT_NATIVE;
  return (frameH * yOffsetAtNative) / QR_FRAME_H;
}

/**
 * Pixi v8 `renderer.width` / `height` with `resizeTo` are **logical (CSS) pixels**, not backing-store pixels.
 * Do not divide by `devicePixelRatio` here — that broke breakpoints, inner Y nudge, mask vs grid, and HTML overlays.
 *
 * **Two modes:**
 * - **Desktop / wide:** contain the **full frame** in the canvas and derive the reel rect from `frame.png` UVs.
 *   Grid + mask stay locked to the art (fixes regression from playfield-only centering).
 * - **Narrow / mobile:** **playfield-first** — max scale so the 5×3 window fits safe margins; frame may bleed off-screen.
 */
export function computeQuestRaiderStageLayout(canvasW: number, canvasH: number): QuestRaiderStageLayout {
  const cssW = Math.max(1, canvasW);
  const cssH = Math.max(1, canvasH);
  const minCss = Math.min(cssW, cssH);
  const isCompactPhone = minCss < 520;
  /** Legacy name: small-width portrait phones only (not tablets 768–1023 wide). */
  const isNarrowPortrait = cssW < 768 && cssH > cssW * 1.08;
  /** Any upright layout — used so 768–1023dp portrait isn’t stuck on the “wide” Y bias. */
  const isPortraitTall = cssH > cssW * 1.04;
  const isPhoneClass = minCss < 640;

  /** Wide landscape-style layout: keep whole frame on screen and align grid purely from frame math. */
  const useFrameContainLayout = !isNarrowPortrait && cssW >= 1024 && minCss >= 520;

  if (useFrameContainLayout) {
    const edgePad = 20;
    const availW = Math.max(1, cssW - 2 * edgePad);
    const availH = Math.max(1, cssH - 2 * edgePad);

    let frameW = availW;
    let frameH = frameW / FRAME_ASPECT;
    if (frameH > availH) {
      frameH = availH;
      frameW = frameH * FRAME_ASPECT;
    }

    const frameX = (cssW - frameW) / 2;
    const frameY = (cssH - frameH) / 2;
    const nudgeTotal = nudgeYForFrameH(frameH, isPhoneClass, isCompactPhone);

    const innerPxW = frameW * INNER_W;
    const innerPxH = frameH * INNER_H;
    const innerXFinal = frameX + frameW * INNER_X;
    const innerYFinal = frameY + frameH * INNER_Y + nudgeTotal;

    const gap = 0;
    const cellW = innerPxW / REELS;
    const cellH = innerPxH / ROWS;

    return {
      frameX,
      frameY,
      frameW,
      frameH,
      innerX: innerXFinal,
      innerY: innerYFinal,
      innerW: innerPxW,
      innerH: innerPxH,
      gridX: innerXFinal,
      gridY: innerYFinal,
      cellW,
      cellH,
      gap,
    };
  }

  /** ── Playfield-first (phones, small tablets, portrait) ── */
  const innerPadX = minCss < 520 ? 4 : minCss < 768 ? 3 : 2;
  const innerPadTop =
    minCss < 768 ? 8 : cssW < 1024 && isPortraitTall ? 16 : 4;
  const innerPadBottom =
    minCss < 768
      ? 8 + (isNarrowPortrait ? 52 : 44)
      : cssW < 1024 && isPortraitTall
        ? 28
        : 12;

  const innerAvailW = Math.max(1, cssW - 2 * innerPadX);
  const innerAvailH = Math.max(1, cssH - innerPadTop - innerPadBottom);

  const maxFrameWFromW = innerAvailW / INNER_W;
  const maxFrameWFromH = (innerAvailH * FRAME_ASPECT) / INNER_H;
  const hardMaxW = Math.min(maxFrameWFromW, maxFrameWFromH);

  let frameW: number;
  const bleed = minCss < 768 ? 1.045 : 1.07;
  let frameWTry = hardMaxW * bleed;
  let frameHTry = frameWTry / FRAME_ASPECT;
  let innerPxW = frameWTry * INNER_W;
  let innerPxH = frameHTry * INNER_H;
  if (innerPxW > innerAvailW || innerPxH > innerAvailH) {
    frameWTry = hardMaxW;
    frameHTry = frameWTry / FRAME_ASPECT;
    innerPxW = frameWTry * INNER_W;
    innerPxH = frameHTry * INNER_H;
  }
  frameW = frameWTry;
  const frameH = frameHTry;

  const nudgeTotal = nudgeYForFrameH(frameH, isPhoneClass, isCompactPhone);

  let innerX = innerPadX + (innerAvailW - innerPxW) / 2;
  /**
   * Vertical anchor for the **frame** (and UV alignment). Kept moderate — do not use extreme bias to move tiles;
   * mobile tile position is adjusted with `tileDropY` below.
   */
  let innerYBias: number;
  if (cssW < 1024) {
    if (isPortraitTall) {
      innerYBias = cssW < 768 ? 0.5 : 0.56;
    } else {
      innerYBias = 0.46;
    }
  } else {
    /** Rare: wide but short viewport skips frame-contain (minCss under 520). */
    innerYBias = 0.44;
  }
  let innerYAnchor = innerPadTop + (innerAvailH - innerPxH) * innerYBias;

  innerX = Math.max(innerPadX, Math.min(innerX, cssW - innerPadX - innerPxW));
  innerYAnchor = Math.max(
    innerPadTop,
    Math.min(innerYAnchor, cssH - innerPadBottom - innerPxH),
  );

  const frameX = innerX - frameW * INNER_X;
  const frameY = innerYAnchor - frameH * INNER_Y - nudgeTotal;

  const innerXFinal = frameX + frameW * INNER_X;
  /** Matches `innerYAnchor` — top of `QR_PLAYFIELD` before mobile-only tile drop. */
  const innerYBase = frameY + frameH * INNER_Y + nudgeTotal;

  /**
   * Push **mask + symbol grid** down inside the stone window without moving `frameSprite`.
   * Fixes mobile UV mismatch (tiles riding high in the carved well).
   */
  const tileDropY =
    cssW < 1024
      ? isPortraitTall
        ? cssW < 768
          ? 12
          : 10
        : 8
      : 0;

  let innerYFinal = innerYBase + tileDropY;
  innerYFinal = Math.max(
    innerPadTop,
    Math.min(innerYFinal, cssH - innerPadBottom - innerPxH),
  );

  const gap = 0;
  const cellW = innerPxW / REELS;
  const cellH = innerPxH / ROWS;

  return {
    frameX,
    frameY,
    frameW,
    frameH,
    innerX: innerXFinal,
    innerY: innerYFinal,
    innerW: innerPxW,
    innerH: innerPxH,
    gridX: innerXFinal,
    gridY: innerYFinal,
    cellW,
    cellH,
    gap,
  };
}
