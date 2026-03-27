/**
 * Canvas / texture supersampling so Pixi stays sharp on 1x displays and Retina.
 */
export function tablePixelRatio(): number {
  if (typeof window === 'undefined') return 2;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(2, Math.max(1.5, dpr));
}

/** Rasterize suit SVGs crisp — base is 256px from the SVG width/height attribute. */
export function suitTexturePixelRatio(): number {
  if (typeof window === 'undefined') return 2;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(3, Math.max(2, dpr));
}

/** Chip SVGs are only 76px base — need a high multiplier to stay sharp when scaled up. */
export function chipTexturePixelRatio(): number {
  if (typeof window === 'undefined') return 4;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(6, Math.max(4, Math.ceil(dpr * 2)));
}
