/**
 * `true` = draw a magenta semi-transparent overlay for the **reel clip** (same rect as the mask).
 * Use it to align `QR_PLAYFIELD` / `QR_MASK` with the frame, then set `false` for production.
 */
export const QR_DEBUG_SHOW_REEL_MASK = false;

/** Native pixel size of `public/quest_raiders/bg.png` */
export const QR_BG = { w: 1536, h: 1024 } as const;

/** Native pixel size of `public/quest_raiders/frame.png` — responsive frame overlay */
export const QR_FRAME = { w: 1240, h: 954 } as const;

/** Native pixel size of `public/quest_raiders/mask.png` — must match file; centered on frame in layout math */
export const QR_MASK = { w: 899, h: 545 } as const;

/**
 * Fractional inset inside the mask rect (per side), as fractions of **mask** width/height.
 * Keep at `0` when the playfield should match your authored mask size; use small positives to shrink, negatives to expand.
 */
export const QR_REEL_INSET = { x: 0, y: 0 } as const;

const maskLeftN = (QR_FRAME.w - QR_MASK.w) / (2 * QR_FRAME.w);
const maskTopN = (QR_FRAME.h - QR_MASK.h) / (2 * QR_FRAME.h);
const maskWN = QR_MASK.w / QR_FRAME.w;
const maskHN = QR_MASK.h / QR_FRAME.h;

/**
 * Symbol / reel area as fractions of **frame.png** (0–1): `mask.png` centered on the frame, minus `QR_REEL_INSET`.
 */
export const QR_PLAYFIELD = {
  x: maskLeftN + maskWN * QR_REEL_INSET.x,
  y: maskTopN + maskHN * QR_REEL_INSET.y,
  w: maskWN * (1 - 2 * QR_REEL_INSET.x),
  h: maskHN * (1 - 2 * QR_REEL_INSET.y),
} as const;

/**
 * Logo sits on the frame art (not the viewport): fractions of the **rendered frame box** (same as `frame.png` aspect).
 */
export const QR_LOGO_ON_FRAME = {
  /** From top edge of frame bitmap box (keep low so tall logo doesn’t overlap reel on narrow screens). */
  topFrac: 0.01,
  /** Max width as fraction of frame width (centered) */
  widthFrac: 0.68,
} as const;

/**
 * Central emerald under the reel window on `frame.png` — fractions of the full frame bitmap (0–1).
 * Tweak if art changes; used for the spin-state glow overlay in `QuestRaiderClient`.
 */
export const QR_FRAME_EMERALD = {
  centerXFrac: 0.5,
  /** Center of the inset gem on `frame.png` — on the ledge below the reel window (window bottom ≈ 0.79 of frame from top). */
  centerYFrac: 0.9,
  /** Tight halo around the sphere only (~70–90px at authored frame width); keep small or it reads as a UI blob over the grid */
  glowDiameterFrac: 0.065,
} as const;
