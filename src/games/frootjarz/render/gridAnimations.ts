/**
 * Animation state for the Froot Jarz grid.
 * Drop-out, drop-in, cluster pop, cascade fall, particles, win flash.
 *
 * All animations are time-based with explicit durations.
 * The canvas drives sequencing via timers, NOT completion polling.
 */

import { GRID_COLS, GRID_ROWS, JAR_WILD } from '../engine/symbols';
import type { Grid } from '../engine/grid';

// ===================== Drop-OUT animation (old grid exits) =====================

interface DropOutAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}

const dropOutMap = new Map<number, DropOutAnim>();

function cellStateFromDropOut(d: DropOutAnim): CellRenderState {
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
  dropOutMap.clear();
  let maxEnd = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      // Column left→right + bottom row first within column
      const delay = c * colStaggerMs + (GRID_ROWS - 1 - r) * rowStaggerMs;
      dropOutMap.set(cell.id, {
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
  xOffset?: number; // in col units (multiplied by step in drawGrid)
  yOffset: number;  // in row units (multiplied by step in drawGrid)
  scale: number;
  scaleX?: number;  // horizontal stretch (defaults to scale if absent)
  scaleY?: number;  // vertical stretch (defaults to scale if absent)
  alpha: number;
}

export function getCellDropOutState(cellId: number): CellRenderState | null {
  const d = dropOutMap.get(cellId);
  if (!d) return null;
  return cellStateFromDropOut(d);
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

const dropInMap = new Map<number, DropInAnim>();

function cellStateFromDropIn(d: DropInAnim): CellRenderState {
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
  dropInMap.clear();
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
      dropInMap.set(cell.id, {
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
  const d = dropInMap.get(cellId);
  if (!d) return null;
  return cellStateFromDropIn(d);
}

// ===================== Cluster highlight (pulse before pop) =====================

interface HighlightAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const highlightMap = new Map<number, HighlightAnim>();

function cellStateFromHighlight(h: HighlightAnim): CellRenderState {
  const t = Math.min(1, h.elapsedMs / h.durationMs);
  // Pulse: scale up then back
  const pulse = Math.sin(t * Math.PI) * 0.18;
  return { yOffset: 0, scale: 1 + pulse, alpha: 1 };
}

export function queueHighlightAnimations(cellIds: number[], durationMs = 450): void {
  highlightMap.clear();
  for (const id of cellIds) {
    highlightMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
  }
}

export function getCellHighlightState(cellId: number): CellRenderState | null {
  const h = highlightMap.get(cellId);
  if (!h) return null;
  return cellStateFromHighlight(h);
}

// ===================== Cluster pop (shrink + vanish) =====================

interface PopAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}

const popMap = new Map<number, PopAnim>();

function cellStateFromPop(p: PopAnim): CellRenderState {
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

export function queuePopAnimations(cellIds: number[], durationMs = 350): void {
  popMap.clear();
  for (const id of cellIds) {
    popMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
  }
}

export function getCellPopState(cellId: number): CellRenderState | null {
  const p = popMap.get(cellId);
  if (!p) return null;
  return cellStateFromPop(p);
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

const fallMap = new Map<number, FallAnim>();
/** Jar falls: vertical only — no fruit-style stretch/squash (reads like the jar is “becoming” another symbol). */
const fallRigidCellIds = new Set<number>();

function cellStateFromFall(f: FallAnim, rigid: boolean): CellRenderState {
  if (rigid) {
    if (f.delayMs > 0) return { yOffset: f.fromRow - f.toRow, scale: 1, scaleX: 1, scaleY: 1, alpha: 1 };
    const t = Math.min(1, f.elapsedMs / f.durationMs);
    const rowDelta = f.fromRow - f.toRow;
    const e = easeOutCubic(t);
    const yOffset = rowDelta * (1 - e);
    return { yOffset, scale: 1, scaleX: 1, scaleY: 1, alpha: 1 };
  }
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

/**
 * Queue fall animations. Returns total animation duration in ms.
 * Pass `settledGrid` (post-cascade grid) so jar cells get rigid motion only.
 */
export function queueFallAnimations(
  moves: { cellId: number; fromRow: number; toRow: number; col: number }[],
  durationMs = 180,
  staggerMs = 5,
  settledGrid?: Grid,
): number {
  fallMap.clear();
  fallRigidCellIds.clear();
  if (settledGrid) {
    for (const m of moves) {
      const cell = settledGrid[m.toRow]?.[m.col];
      if (cell && cell.id === m.cellId && cell.symbol === JAR_WILD) {
        fallRigidCellIds.add(m.cellId);
      }
    }
  }
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

export function getCellFallState(cellId: number): CellRenderState | null {
  const f = fallMap.get(cellId);
  if (!f) return null;
  return cellStateFromFall(f, fallRigidCellIds.has(cellId));
}

function cellRenderStateToCombined(s: CellRenderState): { xOffset: number; yOffset: number; scaleX: number; scaleY: number; alpha: number } {
  return {
    xOffset: s.xOffset ?? 0,
    yOffset: s.yOffset,
    scaleX: s.scaleX ?? s.scale,
    scaleY: s.scaleY ?? s.scale,
    alpha: s.alpha,
  };
}

/**
 * Single lookup for the draw loop: first matching animation by priority
 * (dropOut > dropIn > suck > pop > highlight > jarMove > fall). O(1) map lookups.
 */
export function getCellAnimState(cellId: number): { xOffset: number; yOffset: number; scaleX: number; scaleY: number; alpha: number } | null {
  const dropOut = dropOutMap.get(cellId);
  if (dropOut) return cellRenderStateToCombined(cellStateFromDropOut(dropOut));
  const dropIn = dropInMap.get(cellId);
  if (dropIn) return cellRenderStateToCombined(cellStateFromDropIn(dropIn));
  const suck = suckMap.get(cellId);
  if (suck) return cellRenderStateToCombined(cellStateFromSuck(suck));
  const pop = popMap.get(cellId);
  if (pop) return cellRenderStateToCombined(cellStateFromPop(pop));
  const highlight = highlightMap.get(cellId);
  if (highlight) return cellRenderStateToCombined(cellStateFromHighlight(highlight));
  const jm = jarMoveMap.get(cellId);
  if (jm) return cellRenderStateToCombined(cellStateFromJarMove(jm));
  const fall = fallMap.get(cellId);
  if (fall) return cellRenderStateToCombined(cellStateFromFall(fall, fallRigidCellIds.has(cellId)));
  return null;
}

// ===================== Suck-to-jar animation =====================

interface SuckAnim {
  cellId: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  elapsedMs: number;
  durationMs: number;
}

const suckMap = new Map<number, SuckAnim>();

function cellStateFromSuck(s: SuckAnim): CellRenderState {
  const t = Math.min(1, s.elapsedMs / s.durationMs);
  const ease = t * t * t; // ease-in cubic — accelerates towards jar
  const dx = (s.toCol - s.fromCol) * ease;
  const dy = (s.toRow - s.fromRow) * ease;
  const baseScale = Math.max(0, 1 - ease);
  const alpha = Math.max(0, 1 - t * t);

  // Motion blur: stretch along direction of travel as speed increases
  const velocity = 3 * t * t; // derivative of ease-in cubic
  const stretch = Math.min(velocity * 0.4, 0.7);
  const colDist = Math.abs(s.toCol - s.fromCol);
  const rowDist = Math.abs(s.toRow - s.fromRow);
  const total = colDist + rowDist || 1;
  const hRatio = colDist / total;
  const vRatio = rowDist / total;
  const scaleX = Math.max(0.01, baseScale * (1 - stretch * vRatio + stretch * hRatio * 0.3));
  const scaleY = Math.max(0.01, baseScale * (1 - stretch * hRatio + stretch * vRatio * 0.3));

  return { xOffset: dx, yOffset: dy, scale: 1, scaleX, scaleY, alpha };
}

/**
 * Queue suck animations for fruit cells being absorbed into a jar.
 * `fruitCells` = cells that will fly towards jarRow/jarCol.
 */
export function queueSuckAnimations(
  fruitCells: { cellId: number; row: number; col: number }[],
  jarRow: number,
  jarCol: number,
  durationMs = 300,
): void {
  for (const fc of fruitCells) {
    suckMap.set(fc.cellId, {
      cellId: fc.cellId,
      fromRow: fc.row,
      fromCol: fc.col,
      toRow: jarRow,
      toCol: jarCol,
      elapsedMs: 0,
      durationMs,
    });
  }
}

export function getCellSuckState(cellId: number): CellRenderState | null {
  const s = suckMap.get(cellId);
  if (!s) return null;
  return cellStateFromSuck(s);
}

// ===================== Jar-move animation =====================

interface JarMoveAnim {
  cellId: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  elapsedMs: number;
  durationMs: number;
}

const jarMoveMap = new Map<number, JarMoveAnim>();

function cellStateFromJarMove(j: JarMoveAnim): CellRenderState {
  const t = Math.min(1, j.elapsedMs / j.durationMs);
  const ease = easeOutCubic(t);
  const dx = (j.fromCol - j.toCol) * (1 - ease);
  const dy = (j.fromRow - j.toRow) * (1 - ease);
  const bounce = Math.sin(t * Math.PI) * 0.1;
  return { xOffset: dx, yOffset: dy, scale: 1 + bounce, alpha: 1 };
}

/**
 * Queue jar movement animations (jar slides from old position to new).
 * The grid already has jars at their NEW positions; we offset them back visually.
 */
export function queueJarMoveAnimations(
  moves: { cellId: number; fromRow: number; fromCol: number; toRow: number; toCol: number }[],
  durationMs = 220,
): number {
  for (const m of moves) {
    jarMoveMap.set(m.cellId, {
      cellId: m.cellId,
      fromRow: m.fromRow,
      fromCol: m.fromCol,
      toRow: m.toRow,
      toCol: m.toCol,
      elapsedMs: 0,
      durationMs,
    });
  }
  return durationMs;
}

export function getCellJarMoveState(cellId: number): CellRenderState | null {
  const j = jarMoveMap.get(cellId);
  if (!j) return null;
  return cellStateFromJarMove(j);
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

// ===================== Jar swarm sparkles =====================

export interface JarSparkle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  phase: number;
  color: number;
}

interface JarSwarm {
  cx: number;
  cy: number;
  sparkles: JarSparkle[];
  elapsed: number;
}

const jarSwarms = new Map<string, JarSwarm>();

const JAR_SPARKLE_COLORS = [0xffd700, 0xffaa00, 0xffffff, 0xff66ff, 0x66ffff, 0xaaff44];

export function syncJarSwarms(
  jarPositions: { cx: number; cy: number; key: string }[],
): void {
  const activeKeys = new Set(jarPositions.map((p) => p.key));

  // Remove swarms for jars that no longer exist
  for (const key of jarSwarms.keys()) {
    if (!activeKeys.has(key)) jarSwarms.delete(key);
  }

  // Create swarms for new jars
  for (const pos of jarPositions) {
    if (!jarSwarms.has(pos.key)) {
      const sparkles: JarSparkle[] = [];
      for (let i = 0; i < 6; i++) {
        sparkles.push({
          angle: (Math.PI * 2 * i) / 6 + Math.random() * 0.5,
          radius: 0.25 + Math.random() * 0.45,
          speed: 1.5 + Math.random() * 2.0,
          size: 1.0 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
          color: JAR_SPARKLE_COLORS[Math.floor(Math.random() * JAR_SPARKLE_COLORS.length)],
        });
      }
      jarSwarms.set(pos.key, { cx: pos.cx, cy: pos.cy, sparkles, elapsed: 0 });
    } else {
      const sw = jarSwarms.get(pos.key)!;
      sw.cx = pos.cx;
      sw.cy = pos.cy;
    }
  }
}

export function tickJarSwarms(dtMs: number): void {
  for (const sw of jarSwarms.values()) {
    sw.elapsed += dtMs;
    for (const s of sw.sparkles) {
      s.angle += s.speed * (dtMs / 1000);
    }
  }
}

export function getJarSwarms(): ReadonlyMap<string, JarSwarm> {
  return jarSwarms;
}

// ===================== Floating win text =====================

export interface FloatingWinText {
  x: number;
  y: number;
  amount: number;
  baseAmount?: number;
  multiplier?: number;
  elapsedMs: number;
  durationMs: number;
  label?: string;
}

const activeFloatingWins: FloatingWinText[] = [];

export function spawnFloatingWin(
  x: number, y: number, amount: number, durationMs = 2500,
  label?: string, baseAmount?: number, multiplier?: number,
): void {
  activeFloatingWins.push({ x, y, amount, baseAmount, multiplier, elapsedMs: 0, durationMs, label });
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
  for (const d of dropOutMap.values()) {
    if (d.delayMs > 0) { d.delayMs -= dtMs; continue; }
    d.elapsedMs += dtMs;
  }
  for (const d of dropInMap.values()) {
    if (d.delayMs > 0) { d.delayMs -= dtMs; continue; }
    d.elapsedMs += dtMs;
  }
  for (const h of highlightMap.values()) {
    h.elapsedMs += dtMs;
  }
  for (const p of popMap.values()) {
    p.elapsedMs += dtMs;
  }
  for (const s of suckMap.values()) {
    s.elapsedMs += dtMs;
  }
  for (const j of jarMoveMap.values()) {
    j.elapsedMs += dtMs;
  }
  for (const f of fallMap.values()) {
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
  tickJarSwarms(dtMs);
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
  for (const d of dropOutMap.values()) {
    if (d.delayMs > 0 || d.elapsedMs < d.durationMs) return true;
  }
  for (const d of dropInMap.values()) {
    if (d.delayMs > 0 || d.elapsedMs < d.durationMs) return true;
  }
  for (const h of highlightMap.values()) {
    if (h.elapsedMs < h.durationMs) return true;
  }
  for (const p of popMap.values()) {
    if (p.elapsedMs < p.durationMs) return true;
  }
  for (const s of suckMap.values()) {
    if (s.elapsedMs < s.durationMs) return true;
  }
  for (const j of jarMoveMap.values()) {
    if (j.elapsedMs < j.durationMs) return true;
  }
  for (const f of fallMap.values()) {
    if (f.delayMs > 0 || f.elapsedMs < f.durationMs) return true;
  }
  if (activeParticles.length > 0) return true;
  if (activeFloatingWins.length > 0) return true;
  if (winFlashActive) return true;
  if (shakeActive) return true;
  return false;
}

export function clearAllAnimations(): void {
  dropOutMap.clear();
  dropInMap.clear();
  highlightMap.clear();
  popMap.clear();
  suckMap.clear();
  jarMoveMap.clear();
  fallMap.clear();
  fallRigidCellIds.clear();
  activeParticles.length = 0;
  winFlashActive = false;
  shakeActive = false;
}

export function clearAllAnimationsAndFloats(): void {
  clearAllAnimations();
  activeFloatingWins.length = 0;
}
