import { REELS, ROWS } from '../engine/symbols';
import { QR_FRAME, QR_PLAYFIELD } from './aztecLayout';

/** Native frame height for `frame.png` — scales Y nudge with rendered `frameH`. */
const QR_FRAME_H = QR_FRAME.h;

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

const INNER_X = QR_PLAYFIELD.x;
const INNER_Y = QR_PLAYFIELD.y;
const INNER_W = QR_PLAYFIELD.w;
const INNER_H = QR_PLAYFIELD.h;

const FRAME_ASPECT = QR_FRAME.w / QR_FRAME.h;

const QR_PLAYFIELD_OFFSET_Y_AT_NATIVE = 46;
const QR_REEL_FINE_NUDGE_Y_AT_NATIVE = 6;

/** Move the 5×3 grid up (CSS px at 1×); scaled by post-process `sx` after layout. */
const AZTEC_GRID_SHIFT_UP_CSS = 14;

/** Move **frame + reel grid** up together (CSS px at 1×), after centering clamp; scaled by `sx`. */
const AZTEC_FRAME_SHIFT_UP_CSS = 12;

/** Positive = shift grid left (CSS px) vs playfield. */
const AZTEC_GRID_NUDGE_LEFT_PX = 2;

const AZTEC_CELL_SHRINK_PX = 2;

/** Widen/tall each symbol cell by this many CSS px (total inner += REELS× / ROWS×); position nudged to keep center. */
const AZTEC_CELL_ENLARGE_PX = 2;

/** After core layout: desktop keeps board modest; mobile scales up so the stone frame fills more (can bleed). */
const AZTEC_STAGE_VISUAL_SCALE_DESKTOP = 0.84;
/** Higher = bigger frame on phones/tablets; clamped in post-process so the 5×3 stays on-screen. */
const AZTEC_STAGE_VISUAL_SCALE_MOBILE = 0.97;

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
 * Quest Raider–equivalent stage math for Aztec art (`aztecLayout` fractions + aspect).
 * Output is **before** visual scale / cell shrink / grid nudges.
 */
function computeAztecStageLayoutCore(canvasW: number, canvasH: number): AztecStageLayout {
  const cssW = Math.max(1, canvasW);
  const cssH = Math.max(1, canvasH);
  const minCss = Math.min(cssW, cssH);
  const isCompactPhone = minCss < 520;
  const isNarrowPortrait = cssW < 768 && cssH > cssW * 1.08;
  const isPortraitTall = cssH > cssW * 1.04;
  const isPhoneClass = minCss < 640;

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

  const innerPadX = minCss < 520 ? 2 : minCss < 768 ? 3 : 2;
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

  /** Extra scale when one axis has slack — grows decorative frame past inner safe rect (mobile). */
  const bleed =
    minCss < 768 ? 1.072 : cssW < 1024 ? 1.062 : 1.07;
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
  const frameW = frameWTry;
  const frameH = frameHTry;

  const nudgeTotal = nudgeYForFrameH(frameH, isPhoneClass, isCompactPhone);

  let innerX = innerPadX + (innerAvailW - innerPxW) / 2;

  let innerYBias: number;
  if (cssW < 1024) {
    if (isPortraitTall) {
      innerYBias = cssW < 768 ? 0.5 : 0.56;
    } else {
      innerYBias = 0.46;
    }
  } else {
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
  const innerYBase = frameY + frameH * INNER_Y + nudgeTotal;

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

/**
 * Scale frame to Aztec visual size, re-center, map inner proportionally, then apply cell shrink / grid nudges.
 * On mobile, starts at a high scale and steps down if the symbol rect would clip — frame can still bleed.
 */
function applyAztecVisualPostProcess(
  cssW: number,
  cssH: number,
  raw: AztecStageLayout,
): AztecStageLayout {
  const isMobile = cssW < 1024;
  let sx = isMobile ? AZTEC_STAGE_VISUAL_SCALE_MOBILE : AZTEC_STAGE_VISUAL_SCALE_DESKTOP;
  const symMargin = 3;
  /** Never shrink mobile quite as small as the old single scale unless we must clear the viewport. */
  const floorMin = isMobile ? 0.78 : sx;

  const shrinkW = REELS * AZTEC_CELL_SHRINK_PX;
  const shrinkH = ROWS * AZTEC_CELL_SHRINK_PX;
  const relIX = raw.innerX - raw.frameX;
  const relIY = raw.innerY - raw.frameY;
  const rw = raw.frameW;
  const rh = raw.frameH;

  const layoutWithSx = (s: number): AztecStageLayout => {
    const fw = Math.max(1, Math.floor(raw.frameW * s));
    const fh = Math.max(1, Math.floor(raw.frameH * s));
    const fx = Math.floor((cssW - fw) / 2);
    const maxTop = Math.max(0, cssH - fh);
    const fyCenter = Math.floor((cssH - fh) / 2);
    let fy = Math.max(0, Math.min(maxTop, fyCenter));
    fy -= Math.round(AZTEC_FRAME_SHIFT_UP_CSS * s);

    const ratioW = rw > 0 ? fw / rw : 1;
    const ratioH = rh > 0 ? fh / rh : 1;

    const extraW = REELS * AZTEC_CELL_ENLARGE_PX;
    const extraH = ROWS * AZTEC_CELL_ENLARGE_PX;
    const innerPxW = Math.max(1, Math.floor(raw.innerW * ratioW) - shrinkW) + extraW;
    const innerPxH = Math.max(1, Math.floor(raw.innerH * ratioH) - shrinkH) + extraH;

    const innerX =
      fx +
      relIX * ratioW +
      shrinkW / 2 -
      AZTEC_GRID_NUDGE_LEFT_PX -
      extraW / 2;
    const innerY =
      fy +
      relIY * ratioH +
      shrinkH / 2 -
      Math.round(AZTEC_GRID_SHIFT_UP_CSS * s) -
      extraH / 2;

    const gap = 0;
    const cellW = innerPxW / REELS;
    const cellH = innerPxH / ROWS;

    return {
      frameX: fx,
      frameY: fy,
      frameW: fw,
      frameH: fh,
      innerX,
      innerY,
      innerW: innerPxW,
      innerH: innerPxH,
      gridX: innerX,
      gridY: innerY,
      cellW,
      cellH,
      gap,
    };
  };

  let out = layoutWithSx(sx);
  if (!isMobile) return out;

  for (let i = 0; i < 10; i++) {
    const o = out;
    if (
      o.innerX >= symMargin &&
      o.innerY >= symMargin &&
      o.innerX + o.innerW <= cssW - symMargin &&
      o.innerY + o.innerH <= cssH - symMargin
    ) {
      break;
    }
    sx = Math.max(floorMin, sx * 0.965);
    out = layoutWithSx(sx);
  }

  return out;
}

/**
 * Pixi v8 `renderer.width` / `height` are **logical CSS pixels** (with `resizeTo` / manual resize).
 *
 * Same strategy as Quest Raider: desktop frame-contain; mobile playfield-first + bleed + `tileDropY`;
 * scaled nudge vs native frame height. Then Aztec-specific visual scale (higher on mobile) and cell shrink.
 */
export function computeAztecStageLayout(canvasW: number, canvasH: number): AztecStageLayout {
  const raw = computeAztecStageLayoutCore(canvasW, canvasH);
  return applyAztecVisualPostProcess(canvasW, canvasH, raw);
}
