/**
 * Animation state for Bamboo Fortunes grid.
 * Reel-spinning columns (like Breaking Bandits) + cluster highlight.
 */

import { GRID_COLS, GRID_ROWS, ALL_SYMBOLS, type BambooSymbol } from '../engine/symbols';

// ===================== Reel Spin State =====================

export type ColumnPhase = 'spinning' | 'landing' | 'stopped';

interface ColumnSpinState {
  phase: ColumnPhase;
  stopAtMs: number;
  landDurationMs: number;
  elapsedMs: number;
  seed: number;
  anticipation: boolean;
}

const columnSpins: ColumnSpinState[] = [];

export function startReelSpin(colStopDelays: number[], landDuration = 200): void {
  columnSpins.length = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    columnSpins.push({
      phase: 'spinning',
      stopAtMs: colStopDelays[c],
      landDurationMs: landDuration,
      elapsedMs: 0,
      seed: Math.floor(Math.random() * 10000),
      anticipation: false,
    });
  }
}

export function getColumnSpinInfo(col: number): {
  phase: ColumnPhase;
  cycleIndex: number;
  landProgress: number;
  seed: number;
  anticipation: boolean;
} | null {
  const s = columnSpins[col];
  if (!s) return null;
  if (s.phase === 'stopped') return null;

  if (s.phase === 'spinning') {
    const cycleSpeed = s.anticipation ? 20 : 40;
    return {
      phase: 'spinning',
      cycleIndex: Math.floor(s.elapsedMs / cycleSpeed),
      landProgress: 0,
      seed: s.seed,
      anticipation: s.anticipation,
    };
  }

  const landElapsed = s.elapsedMs - s.stopAtMs;
  const landProgress = Math.min(1, landElapsed / s.landDurationMs);
  return {
    phase: 'landing',
    cycleIndex: 0,
    landProgress,
    seed: s.seed,
    anticipation: s.anticipation,
  };
}

export function isColumnStopped(col: number): boolean {
  const s = columnSpins[col];
  return !s || s.phase === 'stopped';
}

export function isColumnLanding(col: number): boolean {
  const s = columnSpins[col];
  return !!s && s.phase === 'landing';
}

export function isColumnLandingOrStopped(col: number): boolean {
  const s = columnSpins[col];
  return !s || s.phase === 'landing' || s.phase === 'stopped';
}

export function areAllReelsStopped(): boolean {
  if (columnSpins.length === 0) return true;
  return columnSpins.every((s) => s.phase === 'stopped');
}

export function extendColumnStopTime(col: number, extraMs: number): void {
  const s = columnSpins[col];
  if (s && s.phase === 'spinning') {
    s.stopAtMs += extraMs;
    s.anticipation = true;
  }
}

export function getRandomSpinSymbol(seed: number, cycleIndex: number, row: number, col: number): BambooSymbol {
  const hash = ((seed + cycleIndex * 7 + row * 13 + col * 37) * 2654435761) >>> 0;
  return ALL_SYMBOLS[hash % ALL_SYMBOLS.length];
}

export function clearReelSpins(): void {
  columnSpins.length = 0;
}

// ===================== Cluster highlight =====================

interface HighlightAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const highlightMap = new Map<number, HighlightAnim>();

function cellStateFromHighlight(h: HighlightAnim): { scale: number; alpha: number } {
  const t = Math.min(1, h.elapsedMs / h.durationMs);
  const pulse = Math.sin(t * Math.PI * 2) * 0.08;
  return { scale: 1 + pulse, alpha: 1 };
}

export function queueHighlightAnimations(cellIds: number[], durationMs = 1200): void {
  highlightMap.clear();
  for (const id of cellIds) {
    highlightMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
  }
}

export function getCellHighlightState(cellId: number): { scale: number; alpha: number } | null {
  const h = highlightMap.get(cellId);
  if (!h) return null;
  return cellStateFromHighlight(h);
}

export function clearHighlights(): void {
  highlightMap.clear();
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
  rotation: number;
  rotSpeed: number;
  aspect: number;
}

const CONFETTI_COLORS = [
  0xffd700, 0xff2222, 0x33cc33, 0x4499ff,
  0xff44ff, 0x00dddd, 0xffaa00, 0xff4488,
];

const activeParticles: Particle[] = [];

export function spawnParticles(
  x: number, y: number, _color: number,
  count = 10, speed = 3.5, lifeMs = 650,
): void {
  const n = Math.max(count, 14);
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 1.2;
    const v = speed * (0.6 + Math.random() * 1.0);
    activeParticles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 3.5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 0,
      maxLife: lifeMs * (0.7 + Math.random() * 0.8),
      size: 3 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      aspect: 0.4 + Math.random() * 0.6,
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
  label?: string;
}

const activeFloatingWins: FloatingWinText[] = [];

export function spawnFloatingWin(
  x: number, y: number, amount: number, durationMs = 2500, label?: string,
): void {
  activeFloatingWins.push({ x, y, amount, elapsedMs: 0, durationMs, label });
}

export function getFloatingWins(): readonly FloatingWinText[] {
  return activeFloatingWins;
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

// ===================== Tick =====================

export function tickAnimations(dtMs: number): void {
  // Reel spins
  for (const cs of columnSpins) {
    if (cs.phase === 'stopped') continue;
    cs.elapsedMs += dtMs;
    if (cs.phase === 'spinning' && cs.elapsedMs >= cs.stopAtMs) {
      cs.phase = 'landing';
    }
    if (cs.phase === 'landing' && cs.elapsedMs >= cs.stopAtMs + cs.landDurationMs) {
      cs.phase = 'stopped';
    }
  }

  // Highlights
  for (const h of highlightMap.values()) {
    h.elapsedMs += dtMs;
  }

  // Floating wins
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
    p.vy += 0.12 * dt;
    p.vx *= 0.995;
    p.rotation += p.rotSpeed * dt;
    p.life += dtMs;
    if (p.life >= p.maxLife) activeParticles.splice(i, 1);
  }

  // Camera shake
  if (shakeActive) {
    shakeElapsed += dtMs;
    if (shakeElapsed >= shakeDuration) shakeActive = false;
  }
}

export function clearAllAnimations(): void {
  highlightMap.clear();
  activeParticles.length = 0;
  shakeActive = false;
}

export function clearAllAnimationsAndFloats(): void {
  clearAllAnimations();
  activeFloatingWins.length = 0;
  columnSpins.length = 0;
}

// ===================== Easing =====================

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
