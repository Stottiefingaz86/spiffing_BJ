/**
 * `true` = draw a magenta semi-transparent overlay for the **reel clip** (same rect as the mask).
 * Use it to align `QR_PLAYFIELD` / `QR_MASK` with the frame, then set `false` for production.
 */
export const QR_DEBUG_SHOW_REEL_MASK = false;

/** Native pixel size of `public/aztec/bg.jpg` */
export const QR_BG = { w: 1536, h: 1024 } as const;

/** Native pixel size of `public/aztec/frame.png` — must match file or scale & reel math drift */
export const QR_FRAME = { w: 1119, h: 722 } as const;

/**
 * Extra px to draw the frame bitmap **above** `frameY`. Must stay **0** so sprite height matches layout `frameH`
 * (plus bottom outset only); otherwise the texture is vertically stretched and the reel window no longer lines up with tiles.
 */
export const AZTEC_FRAME_SPRITE_TOP_OUTSET_PX = 0;

/** Native pixel size of `public/aztec/mask.png` — must match file; assumed centered on frame in layout math */
export const QR_MASK = { w: 899, h: 544 } as const;

/**
 * Fractional inset inside the mask rect (per side), as fractions of **mask** width/height.
 * Slightly inset so 5×3 tiles sit inside the stone window with a bit of breathing room.
 */
export const QR_REEL_INSET = { x: 0.022, y: 0.026 } as const;

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
 * Central emerald under the reel window on `frame.png` — fractions of the full frame bitmap (0–1).
 * Kept for layout reference / future effects if art changes.
 */
export const QR_FRAME_EMERALD = {
  centerXFrac: 0.5,
  /** Center of the inset gem on `frame.png` — on the ledge below the reel window (window bottom ≈ 0.79 of frame from top). */
  centerYFrac: 0.9,
  /** Tight halo around the sphere only (~70–90px at authored frame width); keep small or it reads as a UI blob over the grid */
  glowDiameterFrac: 0.065,
} as const;
