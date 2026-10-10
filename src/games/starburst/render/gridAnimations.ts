/**
 * Starburst Galaxy — cell-state animation pipeline.
 * Drop-in / drop-out, line highlight, pop, gravity fall, particles, floating win, camera shake.
 */

// Grid dimensions are inferred from the grid argument; the max supported is 7×7.

export interface CellRenderState {
  xOffset?: number;
  yOffset: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  alpha: number;
}

function easeInQuad(t: number): number { return t * t; }
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }

// ===================== Drop-OUT =====================

interface DropOutAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const dropOutMap = new Map<number, DropOutAnim>();

let lastGridRows = 5;

function cellStateFromDropOut(d: DropOutAnim): CellRenderState {
  if (d.delayMs > 0) return { yOffset: 0, scale: 1, scaleX: 1, scaleY: 1, alpha: 1 };
  const t = Math.min(1, d.elapsedMs / d.durationMs);
  const e = easeInQuad(t);
  const fallDist = lastGridRows - d.row + 1;
  const yOffset = fallDist * e;
  const velocity = 2 * t;
  const stretch = velocity * 0.06;
  return { yOffset, scale: 1, scaleX: 1 - stretch, scaleY: 1 + stretch, alpha: 1 };
}

export function queueDropOutAnimations(
  grid: { id: number }[][],
  durationMs = 140,
  colStaggerMs = 55,
  rowStaggerMs = 16,
): number {
  dropOutMap.clear();
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  lastGridRows = rows;
  let maxEnd = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      const delay = c * colStaggerMs + (rows - 1 - r) * rowStaggerMs;
      dropOutMap.set(cell.id, {
        cellId: cell.id, row: r, col: c,
        delayMs: delay, elapsedMs: 0, durationMs,
      });
      maxEnd = Math.max(maxEnd, delay + durationMs);
    }
  }
  return maxEnd;
}

// ===================== Drop-IN =====================

interface DropInAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const dropInMap = new Map<number, DropInAnim>();

function cellStateFromDropIn(d: DropInAnim): CellRenderState {
  if (d.delayMs > 0) return { yOffset: -(d.row + 1.5), scale: 1, scaleX: 0.95, scaleY: 1.05, alpha: 1 };
  const t = Math.min(1, d.elapsedMs / d.durationMs);
  const fallDist = d.row + 1.5;
  const e = easeOutCubic(t);
  const yOffset = -fallDist * (1 - e);
  const velocity = 3 * Math.pow(1 - t, 2);
  const stretch = velocity * 0.06;
  let scaleX = 1 - stretch;
  let scaleY = 1 + stretch;
  if (t > 0.88) {
    const lt = (t - 0.88) / 0.12;
    const squash = Math.sin(lt * Math.PI) * 0.05;
    scaleX = 1 + squash;
    scaleY = 1 - squash;
  }
  return { yOffset, scale: 1, scaleX, scaleY, alpha: 1 };
}

export function queueDropInAnimations(
  grid: { id: number }[][],
  baseDurationMs = 160,
  colStaggerMs = 55,
  rowStaggerMs = 16,
  anticipationFromCol?: number,
  anticipationColExtraMs = 520,
  anticipationColDurationBoostMs = 360,
): number {
  dropInMap.clear();
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  lastGridRows = rows;
  let maxEnd = 0;
  for (let c = 0; c < cols; c++) {
    let colDelay = c * colStaggerMs;
    let colDurBoost = 0;
    if (anticipationFromCol !== undefined && c >= anticipationFromCol) {
      const step = c - anticipationFromCol + 1;
      colDelay += step * anticipationColExtraMs;
      colDurBoost = anticipationColDurationBoostMs;
    }
    for (let r = 0; r < rows; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      const delay = colDelay + (rows - 1 - r) * rowStaggerMs;
      const dist = r + 1;
      const dur = baseDurationMs + dist * 14 + colDurBoost;
      dropInMap.set(cell.id, {
        cellId: cell.id, row: r, col: c,
        delayMs: delay, elapsedMs: 0, durationMs: dur,
      });
      maxEnd = Math.max(maxEnd, delay + dur);
    }
  }
  return maxEnd;
}

/**
 * Given a grid, return the leftmost column that should start "scatter anticipation" —
 * i.e. the column immediately after the second scatter when the first two scatters are
 * on the left-most consecutive-possible columns and a 3rd scatter could still land
 * in a later column. Returns null if there is no anticipation to show.
 */
export function anticipationColFromGrid(
  grid: { id: number; symbol?: string }[][],
  scatterSymbol: string,
): number | null {
  const cols = grid[0]?.length ?? 0;
  let count = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < grid.length; r++) {
      if (grid[r]?.[c]?.symbol === scatterSymbol) { count++; break; }
    }
    if (count === 2 && c + 1 < cols) return c + 1;
    if (count >= 3) return null;
  }
  return null;
}

// ===================== Highlight pulse =====================

interface HighlightAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const highlightMap = new Map<number, HighlightAnim>();

function cellStateFromHighlight(h: HighlightAnim): CellRenderState {
  const t = Math.min(1, h.elapsedMs / h.durationMs);
  const pulse = Math.sin(t * Math.PI) * 0.18;
  return { yOffset: 0, scale: 1 + pulse, alpha: 1 };
}

export function queueHighlightAnimations(cellIds: number[], durationMs = 420): void {
  highlightMap.clear();
  for (const id of cellIds) highlightMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
}

// ===================== Pop (shrink + vanish) =====================

interface PopAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const popMap = new Map<number, PopAnim>();

function cellStateFromPop(p: PopAnim): CellRenderState {
  const t = Math.min(1, p.elapsedMs / p.durationMs);
  if (t < 0.2) {
    const st = t / 0.2;
    return { yOffset: 0, scale: 1 + 0.25 * st, alpha: 1 };
  }
  const pt = (t - 0.2) / 0.8;
  const ease = easeInQuad(pt);
  return { yOffset: 0, scale: Math.max(0, 1.25 * (1 - ease)), alpha: 1 - ease };
}

export function queuePopAnimations(cellIds: number[], durationMs = 340): void {
  popMap.clear();
  for (const id of cellIds) popMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
}

export function getCellPopState(cellId: number): CellRenderState | null {
  const p = popMap.get(cellId);
  return p ? cellStateFromPop(p) : null;
}

// ===================== Fall =====================

interface FallAnim {
  cellId: number;
  fromRow: number;
  toRow: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const fallMap = new Map<number, FallAnim>();

function cellStateFromFall(f: FallAnim): CellRenderState {
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

export function queueFallAnimations(
  moves: { cellId: number; fromRow: number; toRow: number; col: number }[],
  durationMs = 180,
  staggerMs = 5,
): number {
  fallMap.clear();
  let maxEnd = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const dist = Math.abs(m.toRow - m.fromRow);
    const dur = durationMs + dist * 20;
    const delay = i * staggerMs;
    fallMap.set(m.cellId, { ...m, delayMs: delay, elapsedMs: 0, durationMs: dur });
    maxEnd = Math.max(maxEnd, delay + dur);
  }
  return maxEnd;
}

// ===================== Morph (grid expand/shrink) =====================
// Interpolates a cell from an arbitrary from-state (offset/scale/alpha) to its
// natural on-grid position over `durationMs`. Used to smoothly morph cells between
// the 5×5 and 7×7 layouts when Galaxy Star triggers or its effect ends.

interface MorphAnim {
  cellId: number;
  fromXOffset: number; // Fractional offset (step units) at t=0; settles to 0 at t=1
  fromYOffset: number;
  fromScaleX: number;
  fromScaleY: number;
  fromAlpha: number;
  toAlpha: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const morphMap = new Map<number, MorphAnim>();

function cellStateFromMorph(m: MorphAnim): CellRenderState {
  if (m.delayMs > 0) {
    return {
      xOffset: m.fromXOffset,
      yOffset: m.fromYOffset,
      scale: 1,
      scaleX: m.fromScaleX,
      scaleY: m.fromScaleY,
      alpha: m.fromAlpha,
    };
  }
  const t = Math.min(1, m.elapsedMs / m.durationMs);
  // Ease out quart — feels weighty and organic, not bouncy.
  const e = 1 - Math.pow(1 - t, 4);
  return {
    xOffset: m.fromXOffset * (1 - e),
    yOffset: m.fromYOffset * (1 - e),
    scale: 1,
    scaleX: m.fromScaleX + (1 - m.fromScaleX) * e,
    scaleY: m.fromScaleY + (1 - m.fromScaleY) * e,
    alpha: m.fromAlpha + (m.toAlpha - m.fromAlpha) * e,
  };
}

export interface MorphMove {
  cellId: number;
  fromXOffset: number;
  fromYOffset: number;
  fromScaleX?: number;
  fromScaleY?: number;
  fromAlpha?: number;
  toAlpha?: number;
  delayMs?: number;
  durationMs?: number;
}

export function queueMorphAnimations(moves: MorphMove[]): number {
  morphMap.clear();
  let maxEnd = 0;
  for (const m of moves) {
    const dur = m.durationMs ?? 800;
    const delay = m.delayMs ?? 0;
    morphMap.set(m.cellId, {
      cellId: m.cellId,
      fromXOffset: m.fromXOffset,
      fromYOffset: m.fromYOffset,
      fromScaleX: m.fromScaleX ?? 1,
      fromScaleY: m.fromScaleY ?? 1,
      fromAlpha: m.fromAlpha ?? 1,
      toAlpha: m.toAlpha ?? 1,
      delayMs: delay,
      elapsedMs: 0,
      durationMs: dur,
    });
    maxEnd = Math.max(maxEnd, delay + dur);
  }
  return maxEnd;
}

// ===================== Spawn (burst-in) =====================

interface SpawnAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const spawnMap = new Map<number, SpawnAnim>();

function cellStateFromSpawn(s: SpawnAnim): CellRenderState {
  const t = Math.min(1, s.elapsedMs / s.durationMs);
  if (t < 0.5) {
    // Scale from 0 → 1.4 with overshoot
    const st = t / 0.5;
    const e = 1 - Math.pow(1 - st, 3);
    return { yOffset: 0, scale: e * 1.4, alpha: Math.min(1, e * 2) };
  }
  // Scale from 1.4 → 1.0 (settle)
  const st = (t - 0.5) / 0.5;
  const e = 1 - Math.pow(1 - st, 2);
  return { yOffset: 0, scale: 1.4 - 0.4 * e, alpha: 1 };
}

export function queueSpawnAnimations(cellIds: number[], durationMs = 520): void {
  for (const id of cellIds) spawnMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
}

// ===================== Pulse (scatter landed anticipation badge) =====================

interface PulseAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const pulseMap = new Map<number, PulseAnim>();

function cellStateFromPulse(p: PulseAnim): CellRenderState {
  const t = (p.elapsedMs / 500) % 1;
  const wave = Math.sin(t * Math.PI * 2) * 0.08 + 0.04;
  return { yOffset: 0, scale: 1 + wave, alpha: 1 };
}

export function queuePulseAnimations(cellIds: number[], durationMs = 2000): void {
  for (const id of cellIds) pulseMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
}

// ===================== Combined lookup =====================

function combine(s: CellRenderState) {
  return {
    xOffset: s.xOffset ?? 0,
    yOffset: s.yOffset,
    scaleX: s.scaleX ?? s.scale,
    scaleY: s.scaleY ?? s.scale,
    alpha: s.alpha,
  };
}

export function getCellAnimState(cellId: number): { xOffset: number; yOffset: number; scaleX: number; scaleY: number; alpha: number } | null {
  const dropOut = dropOutMap.get(cellId);
  if (dropOut) return combine(cellStateFromDropOut(dropOut));
  const dropIn = dropInMap.get(cellId);
  if (dropIn) return combine(cellStateFromDropIn(dropIn));
  const morph = morphMap.get(cellId);
  if (morph) return combine(cellStateFromMorph(morph));
  const pop = popMap.get(cellId);
  if (pop) return combine(cellStateFromPop(pop));
  const spawn = spawnMap.get(cellId);
  if (spawn) return combine(cellStateFromSpawn(spawn));
  const highlight = highlightMap.get(cellId);
  if (highlight) return combine(cellStateFromHighlight(highlight));
  const pulse = pulseMap.get(cellId);
  if (pulse) return combine(cellStateFromPulse(pulse));
  const fall = fallMap.get(cellId);
  if (fall) return combine(cellStateFromFall(fall));
  return null;
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
  twinkle: number;
}

const activeParticles: Particle[] = [];

const STAR_COLORS = [
  0xffffff, 0xfff4c8, 0x7fd8ff, 0xff9ce0, 0xffd84a,
  0xaa99ff, 0x5fffc2, 0xff6a9a, 0xffb84a, 0xeaf6ff,
];

export function spawnParticles(
  x: number,
  y: number,
  _color: number,
  count = 12,
  speed = 4,
  lifeMs = 800,
): void {
  const n = Math.max(count, 14);
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.9;
    const v = speed * (0.6 + Math.random() * 1.2);
    activeParticles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 1.2,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      life: 0,
      maxLife: lifeMs * (0.7 + Math.random() * 0.8),
      size: 2.5 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
      twinkle: Math.random() * Math.PI * 2,
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

// ===================== Layer breathe (scale pulse) =====================
// A sinusoidal scale pulse applied at the whole-game-layer level. Used to mask
// sudden layout swaps (like the 5×5 → 7×7 frame change) by "breathing" the
// entire grid outward and back, hiding the geometric discontinuity.

let breatheActive = false;
let breatheElapsed = 0;
let breatheDuration = 0;
let breathePeak = 1.06;

export function triggerLayerBreathe(peak = 1.06, durationMs = 760): void {
  breathePeak = peak;
  breatheDuration = durationMs;
  breatheElapsed = 0;
  breatheActive = true;
}

export function getLayerBreatheScale(): number {
  if (!breatheActive) return 1;
  const t = breatheElapsed / breatheDuration;
  if (t >= 1) return 1;
  // Half-sine: 1 → peak → 1. Eased at the rise so it feels weighty.
  const p = Math.sin(t * Math.PI);
  return 1 + (breathePeak - 1) * p;
}

// ===================== Tick =====================

export function tickAnimations(dtMs: number): void {
  for (const d of dropOutMap.values()) {
    if (d.delayMs > 0) { d.delayMs -= dtMs; continue; }
    d.elapsedMs += dtMs;
  }
  for (const d of dropInMap.values()) {
    if (d.delayMs > 0) { d.delayMs -= dtMs; continue; }
    d.elapsedMs += dtMs;
  }
  for (const h of highlightMap.values()) h.elapsedMs += dtMs;
  for (const p of popMap.values()) p.elapsedMs += dtMs;
  for (const s of spawnMap.values()) s.elapsedMs += dtMs;
  for (const p of pulseMap.values()) p.elapsedMs += dtMs;
  for (const m of morphMap.values()) {
    if (m.delayMs > 0) { m.delayMs -= dtMs; continue; }
    m.elapsedMs += dtMs;
  }
  for (const f of fallMap.values()) {
    if (f.delayMs > 0) { f.delayMs -= dtMs; continue; }
    f.elapsedMs += dtMs;
  }
  for (const [id, s] of spawnMap) if (s.elapsedMs >= s.durationMs) spawnMap.delete(id);
  for (const [id, p] of pulseMap) if (p.elapsedMs >= p.durationMs) pulseMap.delete(id);
  for (const [id, m] of morphMap) if (m.delayMs <= 0 && m.elapsedMs >= m.durationMs) morphMap.delete(id);

  for (let i = activeFloatingWins.length - 1; i >= 0; i--) {
    activeFloatingWins[i].elapsedMs += dtMs;
    if (activeFloatingWins[i].elapsedMs >= activeFloatingWins[i].durationMs) {
      activeFloatingWins.splice(i, 1);
    }
  }

  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    const dt = dtMs / 16;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.06 * dt;
    p.vx *= 0.992;
    p.rotation += p.rotSpeed * dt;
    p.twinkle += dt * 0.4;
    p.life += dtMs;
    if (p.life >= p.maxLife) activeParticles.splice(i, 1);
  }

  if (shakeActive) {
    shakeElapsed += dtMs;
    if (shakeElapsed >= shakeDuration) shakeActive = false;
  }
  if (breatheActive) {
    breatheElapsed += dtMs;
    if (breatheElapsed >= breatheDuration) breatheActive = false;
  }
}

// ===================== Clear helpers =====================

export function clearAllAnimations(): void {
  dropOutMap.clear();
  dropInMap.clear();
  highlightMap.clear();
  popMap.clear();
  spawnMap.clear();
  pulseMap.clear();
  morphMap.clear();
  fallMap.clear();
  activeParticles.length = 0;
  shakeActive = false;
  breatheActive = false;
}

export function clearAllAnimationsAndFloats(): void {
  clearAllAnimations();
  activeFloatingWins.length = 0;
}

export function hasActiveAnimations(): boolean {
  for (const d of dropOutMap.values()) if (d.delayMs > 0 || d.elapsedMs < d.durationMs) return true;
  for (const d of dropInMap.values()) if (d.delayMs > 0 || d.elapsedMs < d.durationMs) return true;
  for (const h of highlightMap.values()) if (h.elapsedMs < h.durationMs) return true;
  for (const p of popMap.values()) if (p.elapsedMs < p.durationMs) return true;
  for (const s of spawnMap.values()) if (s.elapsedMs < s.durationMs) return true;
  for (const p of pulseMap.values()) if (p.elapsedMs < p.durationMs) return true;
  for (const m of morphMap.values()) if (m.delayMs > 0 || m.elapsedMs < m.durationMs) return true;
  for (const f of fallMap.values()) if (f.delayMs > 0 || f.elapsedMs < f.durationMs) return true;
  if (activeParticles.length > 0) return true;
  if (activeFloatingWins.length > 0) return true;
  if (shakeActive) return true;
  if (breatheActive) return true;
  return false;
}
