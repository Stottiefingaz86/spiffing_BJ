import { Texture } from 'pixi.js';
import { aztecPublicBase } from './aztecPublicBase';

const MASK_URL = `${aztecPublicBase()}aztec/mask.png`;

let cached: Texture | null | undefined;

/**
 * Authoring: bright green fill = visible reel window (see `public/aztec/mask.png`).
 * Pixi v8 sprite masks use the **red** channel as visibility.
 */
function isChromaWindow(r: number, g: number, b: number, a: number): boolean {
  if (a < 90) return false;
  return g > 90 && g > r + 35 && g > b + 35 && r < 120 && b < 120;
}

function textureFromProcessedMask(image: HTMLImageElement): Texture {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return Texture.from(image);
  }
  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const out = ctx.createImageData(w, h);
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (isChromaWindow(r, g, b, a)) {
      o[i] = 255;
      o[i + 1] = 255;
      o[i + 2] = 255;
      o[i + 3] = 255;
    } else if (a < 25) {
      o[i] = 0;
      o[i + 1] = 0;
      o[i + 2] = 0;
      o[i + 3] = 0;
    } else {
      o[i] = 0;
      o[i + 1] = 0;
      o[i + 2] = 0;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return Texture.from(canvas);
}

export async function loadAztecGridMaskTexture(): Promise<Texture | null> {
  if (cached !== undefined) return cached;
  try {
    if (typeof document === 'undefined') {
      cached = null;
      return cached;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = MASK_URL;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('mask load failed'));
    });
    cached = textureFromProcessedMask(image);
  } catch {
    cached = null;
  }
  return cached;
}
