import { Container, Graphics } from 'pixi.js';

let layer: Container | null = null;
let gfx: Graphics | null = null;

const WARM_RAY = 0xfff1d8;
const WARM_FILL = 0xffe8c8;

export function destroyAztecLightShaftsLayer(): void {
  if (layer) {
    layer.destroy({ children: true });
    layer = null;
    gfx = null;
  }
}

/**
 * Subtle sun shafts + soft lens ghosts over the full stage (screen-blended).
 * Mounted above reels/frame; redrawn each frame for a slow drift.
 */
export function initAztecLightShaftsLayer(root: Container): void {
  destroyAztecLightShaftsLayer();
  layer = new Container();
  layer.label = 'aztecLightShafts';
  layer.eventMode = 'none';
  layer.interactiveChildren = false;
  gfx = new Graphics();
  layer.addChild(gfx);
  layer.blendMode = 'screen';
  layer.alpha = 0.38;
  root.addChild(layer);
}

export function updateAztecLightShaftsLayer(width: number, height: number, timeMs: number): void {
  if (!gfx || !layer || width < 8 || height < 8) return;

  const w = width;
  const h = height;
  const drift = Math.sin(timeMs * 0.000085) * 5 + Math.cos(timeMs * 0.000055) * 2.5;
  const sunX = w * 0.84 + drift;
  const sunY = -h * 0.07;
  const reach = h * 1.38;

  gfx.clear();

  const n = 7;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const mid = Math.PI * 0.46 + (u - 0.5) * Math.PI * 0.33;
    const dNear = 10 + (i % 3) * 3;
    const dFar = reach * (0.88 + (i % 5) * 0.024);
    const angSpanNear = 0.018 + (i % 4) * 0.005;
    const angSpanFar = 0.075 + u * 0.095;
    const ang0n = mid - angSpanNear;
    const ang1n = mid + angSpanNear;
    const ang0f = mid - angSpanFar;
    const ang1f = mid + angSpanFar;
    const ax = sunX + Math.cos(ang0n) * dNear;
    const ay = sunY + Math.sin(ang0n) * dNear;
    const bx = sunX + Math.cos(ang1n) * dNear;
    const by = sunY + Math.sin(ang1n) * dNear;
    const cx = sunX + Math.cos(ang1f) * dFar;
    const cy = sunY + Math.sin(ang1f) * dFar;
    const dx = sunX + Math.cos(ang0f) * dFar;
    const dy = sunY + Math.sin(ang0f) * dFar;
    gfx.poly([ax, ay, bx, by, cx, cy, dx, dy], true);
    gfx.fill({ color: WARM_RAY, alpha: 0.032 + (i % 2) * 0.012 });
  }

  const sun2X = w * -0.04 + drift * 0.35;
  const sun2Y = h * 0.03;
  const reach2 = h * 1.05;
  const n2 = 4;
  for (let i = 0; i < n2; i++) {
    const u = (i + 0.5) / n2;
    const mid = Math.PI * 0.62 + (u - 0.5) * 0.22;
    const dNear = 8;
    const dFar = reach2 * 0.92;
    const angSpanNear = 0.02;
    const angSpanFar = 0.06 + u * 0.05;
    const ang0n = mid - angSpanNear;
    const ang1n = mid + angSpanNear;
    const ang0f = mid - angSpanFar;
    const ang1f = mid + angSpanFar;
    const ax = sun2X + Math.cos(ang0n) * dNear;
    const ay = sun2Y + Math.sin(ang0n) * dNear;
    const bx = sun2X + Math.cos(ang1n) * dNear;
    const by = sun2Y + Math.sin(ang1n) * dNear;
    const cx = sun2X + Math.cos(ang1f) * dFar;
    const cy = sun2Y + Math.sin(ang1f) * dFar;
    const dx = sun2X + Math.cos(ang0f) * dFar;
    const dy = sun2Y + Math.sin(ang0f) * dFar;
    gfx.poly([ax, ay, bx, by, cx, cy, dx, dy], true);
    gfx.fill({ color: WARM_FILL, alpha: 0.018 });
  }

  const pulse = 0.92 + Math.sin(timeMs * 0.001) * 0.08;
  const ghosts: readonly [number, number, number, number][] = [
    [w * 0.14, h * 0.24, Math.max(26, w * 0.055), 0.032],
    [w * 0.9, h * 0.36, Math.max(18, w * 0.04), 0.022],
    [w * 0.52, h * 0.1, Math.max(44, w * 0.1), 0.02],
  ];
  for (const [gx, gy, rad, a] of ghosts) {
    gfx.circle(gx, gy, rad * pulse);
    gfx.fill({ color: WARM_FILL, alpha: a * pulse });
  }
}
