/**
 * Animation state for the Froot Jarz grid.
 * Drop-out, drop-in, cluster pop, cascade fall, particles, win flash.
 *
 * All animations are time-based with explicit durations.
 * The canvas drives sequencing via timers, NOT completion polling.
 */

import { GRID_COLS, GRID_ROWS } from '../engine/symbols';

// ===================== Drop-OUT animation (old grid exits) =====================

interface DropOutAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const activeDropOuts: DropOutAnim[] = [];

/**
 * Queue drop-out animations. Left to right, bottom rows exit first
 * within each column — like balls falling out of tubes.
 * Returns total animation duration in ms.
 */
export function queueDropOutAnimations(
  grid: { id: number }[][],
  durationMs = 140,
  colStaggerMs = 60,
  rowStaggerMs = 18,
): number {
  activeDropOuts.length = 0;
  let maxEnd = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      // Column left→right + bottom row first within column
      const delay = c * colStaggerMs + (GRID_ROWS - 1 - r) * rowStaggerMs;
      activeDropOuts.push({
        cellId: cell.id,
        row: r,
        col: c,
        delayMs: delay,
        elapsedMs: 0,
        durationMs,
      });
      maxEnd = Math.max(maxEnd, delay + durationMs);
    }
  }
  return maxEnd;
}

export interface CellRenderState {
  yOffset: number;  // in row units (multiplied by step in drawGrid)
  scale: number;
  scaleX?: number;  // horizontal stretch (defaults to scale if absent)
  scaleY?: number;  // vertical stretch (defaults to scale if absent)
  alpha: number;
}

export function getCellDropOutState(cellId: number): CellRenderState | null {
  const d = activeDropOuts.find((a) => a.cellId === cellId);
  if (!d) return null;
  if (d.delayMs > 0) return { yOffset: 0, scale: 1, scaleX: 1, scaleY: 1, alpha: 1 };
  const t = Math.min(1, d.elapsedMs / d.durationMs);
  const e = easeInQuad(t);
  const fallDist = GRID_ROWS - d.row + 1;
  const yOffset = fallDist * e;
  // Velocity increases as it falls out — stretch taller + narrower
  const velocity = 2 * t; // derivative of easeInQuad
  const stretch = velocity * 0.06;
  const scaleX = 1 - stretch;
  const scaleY = 1 + stretch;
  return { yOffset, scale: 1, scaleX, scaleY, alpha: 1 };
}

// ===================== Drop-IN animation (new grid enters) =====================

interface DropInAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const activeDropIns: DropInAnim[] = [];

/**
 * Queue drop-in animations. Column-primary, left to right.
 * Within each column, bottom row drops first (longest fall) so
 * no symbol ever passes through another — like balls dropping into tubes.
 * Returns total animation duration in ms.
 */
export function queueDropInAnimations(
  grid: { id: number }[][],
  baseDurationMs = 150,
  colStaggerMs = 60,
  rowStaggerMs = 18,
): number {
  activeDropIns.length = 0;
  let maxEnd = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      // Column stagger (left to right) + within column bottom row first
      const delay = c * colStaggerMs + (GRID_ROWS - 1 - r) * rowStaggerMs;
      // Duration scales with fall distance (bottom rows travel farther)
      const dist = r + 1;
      const dur = baseDurationMs + dist * 16;
      activeDropIns.push({
        cellId: cell.id,
        row: r,
        col: c,
        delayMs: delay,
        elapsedMs: 0,
        durationMs: dur,
      });
      maxEnd = Math.max(maxEnd, delay + dur);
    }
  }
  return maxEnd;
}

export function getCellDropInState(cellId: number): CellRenderState | null {
  const d = activeDropIns.find((a) => a.cellId === cellId);
  if (!d) return null;
  if (d.delayMs > 0) return { yOffset: -(d.row + 1.5), scale: 1, scaleX: 0.95, scaleY: 1.05, alpha: 1 };
  const t = Math.min(1, d.elapsedMs / d.durationMs);
  const fallDist = d.row + 1.5;
  const e = easeOutCubic(t);
  const yOffset = -fallDist * (1 - e);
  // Velocity = derivative of position easing — high at start, zero at end
  const velocity = 3 * Math.pow(1 - t, 2); // derivative of easeOutCubic
  // While falling fast: stretch tall + narrow (water balloon in air)
  // On landing (velocity→0): squash wide + short, then settle
  const stretch = velocity * 0.06;
  let scaleX = 1 - stretch;      // narrow while falling
  let scaleY = 1 + stretch;      // tall while falling
  // Landing squash in last 12%
  if (t > 0.88) {
    const lt = (t - 0.88) / 0.12;
    const squash = Math.sin(lt * Math.PI) * 0.05;
    scaleX = 1 + squash;   // wider
    scaleY = 1 - squash;   // shorter
  }
  return { yOffset, scale: 1, scaleX, scaleY, alpha: 1 };
}

// ===================== Cluster highlight (pulse before pop) =====================

interface HighlightAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const activeHighlights: HighlightAnim[] = [];

export function queueHighlightAnimations(cellIds: number[], durationMs = 450): void {
  activeHighlights.length = 0;
  for (const id of cellIds) {
    activeHighlights.push({ cellId: id, elapsedMs: 0, durationMs });
  }
}

export function getCellHighlightState(cellId: number): CellRenderState | null {
  const h = activeHighlights.find((a) => a.cellId === cellId);
  if (!h) return null;
  const t = Math.min(1, h.elapsedMs / h.durationMs);
  // Pulse: scale up then back
  const pulse = Math.sin(t * Math.PI) * 0.18;
  return { yOffset: 0, scale: 1 + pulse, alpha: 1 };
}

// ===================== Cluster pop (shrink + vanish) =====================

interface PopAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const activePops: PopAnim[] = [];

export function queuePopAnimations(cellIds: number[], durationMs = 350): void {
  activePops.length = 0;
  for (const id of cellIds) {
    activePops.push({ cellId: id, elapsedMs: 0, durationMs });
  }
}

export function getCellPopState(cellId: number): CellRenderState | null {
  const p = activePops.find((a) => a.cellId === cellId);
  if (!p) return null;
  const t = Math.min(1, p.elapsedMs / p.durationMs);
  if (t < 0.2) {
    // Quick punch up
    const st = t / 0.2;
    return { yOffset: 0, scale: 1 + 0.25 * st, alpha: 1 };
  }
  // Shrink and fade
  const pt = (t - 0.2) / 0.8;
  const ease = easeInQuad(pt);
  return { yOffset: 0, scale: Math.max(0, 1.25 * (1 - ease)), alpha: 1 - ease };
}

// ===================== Cascade fall (gravity refill) =====================

interface FallAnim {
  cellId: number;
  fromRow: number;
  toRow: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const activeFalls: FallAnim[] = [];

/**
 * Queue fall animations. Returns total animation duration in ms.
 */
export function queueFallAnimations(
  moves: { cellId: number; fromRow: number; toRow: number; col: number }[],
  durationMs = 180,
  staggerMs = 5,
): number {
  activeFalls.length = 0;
  let maxEnd = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const dist = Math.abs(m.toRow - m.fromRow);
    const dur = durationMs + dist * 20;
    const delay = i * staggerMs;
    activeFalls.push({ ...m, delayMs: delay, elapsedMs: 0, durationMs: dur });
    maxEnd = Math.max(maxEnd, delay + dur);
  }
  return maxEnd;
}

export function getCellFallState(cellId: number): CellRenderState | null {
  const f = activeFalls.find((a) => a.cellId === cellId);
  if (!f) return null;
  if (f.delayMs > 0) return { yOffset: f.fromRow - f.toRow, scale: 1, scaleX: 0.96, scaleY: 1.04, alpha: 1 };
  const t = Math.min(1, f.elapsedMs / f.durationMs);
  const rowDelta = f.fromRow - f.toRow;
  const e = easeOutCubic(t);
  const yOffset = rowDelta * (1 - e);
  const velocity = 3 * Math.pow(1 - t, 2);
  const stretch = velocity * 0.05;
  let scaleX = 1 - stretch;
  let scaleY = 1 + stretch;
  if (t > 0.88) {
    const lt = (t - 0.88) / 0.12;
    const squash = Math.sin(lt * Math.PI) * 0.04;
    scaleX = 1 + squash;
    scaleY = 1 - squash;
  }
  return { yOffset, scale: 1, scaleX, scaleY, alpha: 1 };
}

// ===================== Particles =====================

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  life: number;
  maxLife: number;
  size: number;
}

const activeParticles: Particle[] = [];

export function spawnParticles(
  x: number,
  y: number,
  color: number,
  count = 10,
  speed = 3.5,
  lifeMs = 650,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
    const v = speed * (0.5 + Math.random());
    activeParticles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 1.5, // slight upward bias
      color,
      life: 0,
      maxLife: lifeMs * (0.6 + Math.random() * 0.8),
      size: 3 + Math.random() * 5,
    });
  }
}

export function getParticles(): readonly Particle[] {
  return activeParticles;
}

// ===================== Floating win text =====================

export interface FloatingWinText {
  x: number;
  y: number;
  amount: number;
  elapsedMs: number;
  durationMs: number;
}

const activeFloatingWins: FloatingWinText[] = [];

export function spawnFloatingWin(x: number, y: number, amount: number, durationMs = 1600): void {
  activeFloatingWins.push({ x, y, amount, elapsedMs: 0, durationMs });
}

export function getFloatingWins(): readonly FloatingWinText[] {
  return activeFloatingWins;
}

// ===================== Win flash =====================

let winFlashElapsed = 0;
let winFlashDuration = 0;
let winFlashActive = false;

export function triggerWinFlash(durationMs = 350): void {
  winFlashElapsed = 0;
  winFlashDuration = durationMs;
  winFlashActive = true;
}

export function getWinFlashAlpha(): number {
  if (!winFlashActive) return 0;
  const t = winFlashElapsed / winFlashDuration;
  return t < 0.15 ? (t / 0.15) * 0.25 : 0.25 * (1 - (t - 0.15) / 0.85);
}

// ===================== Easing =====================

function easeInQuad(t: number): number {
  return t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ===================== Tick =====================

export function tickAnimations(dtMs: number): void {
  for (const d of activeDropOuts) {
    if (d.delayMs > 0) { d.delayMs -= dtMs; continue; }
    d.elapsedMs += dtMs;
  }
  for (const d of activeDropIns) {
    if (d.delayMs > 0) { d.delayMs -= dtMs; continue; }
    d.elapsedMs += dtMs;
  }
  for (const h of activeHighlights) {
    h.elapsedMs += dtMs;
  }
  for (const p of activePops) {
    p.elapsedMs += dtMs;
  }
  for (const f of activeFalls) {
    if (f.delayMs > 0) { f.delayMs -= dtMs; continue; }
    f.elapsedMs += dtMs;
  }
  // Floating win texts
  for (let i = activeFloatingWins.length - 1; i >= 0; i--) {
    activeFloatingWins[i].elapsedMs += dtMs;
    if (activeFloatingWins[i].elapsedMs >= activeFloatingWins[i].durationMs) {
      activeFloatingWins.splice(i, 1);
    }
  }
  // Particles
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    const dt = dtMs / 16;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.18 * dt; // gravity
    p.life += dtMs;
    if (p.life >= p.maxLife) activeParticles.splice(i, 1);
  }
  if (winFlashActive) {
    winFlashElapsed += dtMs;
    if (winFlashElapsed >= winFlashDuration) winFlashActive = false;
  }
  if (shakeActive) {
    shakeElapsed += dtMs;
    if (shakeElapsed >= shakeDuration) shakeActive = false;
  }
}

// ===================== Camera shake =====================

let shakeIntensity = 0;
let shakeElapsed = 0;
let shakeDuration = 0;
let shakeActive = false;

export function triggerCameraShake(intensity = 6, durationMs = 400): void {
  shakeIntensity = intensity;
  shakeDuration = durationMs;
  shakeElapsed = 0;
  shakeActive = true;
}

export function getCameraShakeOffset(): { x: number; y: number } {
  if (!shakeActive) return { x: 0, y: 0 };
  const decay = 1 - shakeElapsed / shakeDuration;
  const amp = shakeIntensity * decay;
  return {
    x: (Math.random() * 2 - 1) * amp,
    y: (Math.random() * 2 - 1) * amp,
  };
}

export function hasActiveAnimations(): boolean {
  if (activeDropOuts.some((d) => d.delayMs > 0 || d.elapsedMs < d.durationMs)) return true;
  if (activeDropIns.some((d) => d.delayMs > 0 || d.elapsedMs < d.durationMs)) return true;
  if (activeHighlights.some((h) => h.elapsedMs < h.durationMs)) return true;
  if (activePops.some((p) => p.elapsedMs < p.durationMs)) return true;
  if (activeFalls.some((f) => f.delayMs > 0 || f.elapsedMs < f.durationMs)) return true;
  if (activeParticles.length > 0) return true;
  if (activeFloatingWins.length > 0) return true;
  if (winFlashActive) return true;
  if (shakeActive) return true;
  return false;
}

export function clearAllAnimations(): void {
  activeDropOuts.length = 0;
  activeDropIns.length = 0;
  activeHighlights.length = 0;
  activePops.length = 0;
  activeFalls.length = 0;
  activeParticles.length = 0;
  activeFloatingWins.length = 0;
  winFlashActive = false;
  shakeActive = false;
}
