/**
 * Quest Raider — drop, highlight, pop, fall, particles (5×3 line-pay avalanche).
 * Flush wall + heavy stone motion (Gonzo-style): full-cell slabs, tilt while falling, snap square on land.
 */

import type { Grid } from '../engine/grid';
import { REELS, ROWS, TempleSymbol } from '../engine/symbols';

function symbolForCellIdInGrid(grid: Grid, cellId: number): TempleSymbol | undefined {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < REELS; c++) {
      const cell = grid[r]?.[c];
      if (cell && cell.id === cellId) return cell.symbol;
    }
  }
  return undefined;
}

function easeInQuad(t: number): number {
  return t * t;
}

/** Fraction of vertical drop completed (0 = top, 1 = landed): accelerates like gravity, eases last bit into slot */
function brickDropTravel(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const landStart = 0.82;
  if (t <= landStart) {
    const u = t / landStart;
    return Math.pow(u, 1.78) * 0.88;
  }
  const u = (t - landStart) / (1 - landStart);
  return 0.88 + 0.12 * (1 - Math.pow(1 - u, 2.6));
}

/** Same idea for shorter falls (cascade) */
function brickShortFallTravel(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const landStart = 0.78;
  if (t <= landStart) {
    const u = t / landStart;
    return Math.pow(u, 1.72) * 0.86;
  }
  const u = (t - landStart) / (1 - landStart);
  return 0.86 + 0.14 * (1 - Math.pow(1 - u, 2.4));
}

/**
 * Spin / fluid fall: mostly t² (acceleration from rest), then a short ease-out so velocity → 0 at landing.
 * Raw t² ends with non-zero speed and reads as a snap/bounce; no overshoot here (not a spring).
 */
function gravitySpinFallTravel(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const knee = 0.84;
  const atKnee = 0.885;
  if (t < knee) {
    const u = t / knee;
    return atKnee * u * u;
  }
  const u = (t - knee) / (1 - knee);
  return atKnee + (1 - atKnee) * (1 - Math.pow(1 - u, 3));
}

/** Time to fall `dist` rows under constant g from rest scales ~√dist; keeps long drops from feeling “snapped”. */
function fluidFallDurationMs(baseMs: number, rowDist: number): number {
  const d = Math.max(1, rowDist);
  return Math.round(baseMs * Math.sqrt(d));
}

/** Stable pseudo-random in [-1, 1] per cell id — used for tilt/sway so each stone feels distinct */
function stoneTiltUnit(cellId: number): number {
  const s = Math.sin(cellId * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

function stoneTiltRad(cellId: number, maxDeg: number): number {
  return stoneTiltUnit(cellId) * ((maxDeg * Math.PI) / 180);
}

export interface CellRenderState {
  xOffset: number;
  yOffset: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** Radians; + = clockwise (Pixi). Used for brick tilt on landing / pop. */
  rotation: number;
}

// --- drop out ---
interface DropOutAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
  /** Spin: each tile pops loose then falls — not one moving slab. */
  spinExplode?: boolean;
  /** When the cell is no longer in `grid`, draw uses this at (row,col). */
  symbol?: TempleSymbol;
}
const dropOutMap = new Map<number, DropOutAnim>();

function cellStateFromDropOut(d: DropOutAnim): CellRenderState {
  if (d.delayMs > 0) return { xOffset: 0, yOffset: 0, scaleX: 1, scaleY: 1, alpha: 1, rotation: 0 };
  const t = Math.min(1, d.elapsedMs / d.durationMs);
  const fallDist = ROWS - d.row + 1.2;

  if (!d.spinExplode) {
    const e = brickDropTravel(t);
    const tilt = stoneTiltRad(d.cellId, 11);
    const wobble = stoneTiltUnit(d.cellId + d.row * 13) * 0.034 * e;
    const colNudge = stoneTiltUnit(d.cellId + d.col * 3) * 0.015 * e;
    return {
      xOffset: wobble + colNudge,
      yOffset: fallDist * e,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      rotation: tilt * e,
    };
  }

  /** Spin clear: straight vertical gravity drop. */
  const se = gravitySpinFallTravel(t);
  return {
    xOffset: 0,
    yOffset: fallDist * se,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    rotation: 0,
  };
}

export function queueDropOutAnimations(
  grid: { id: number }[][],
  durationMs = 172,
  /** Left → right: each “reel” column releases after the previous (ms). */
  colStaggerMs = 76,
  /** Within a column, bottom row leads slightly (strip falling away). */
  rowStaggerMs = 11,
): number {
  dropOutMap.clear();
  let maxEnd = 0;
  for (let c = 0; c < REELS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      const delay = c * colStaggerMs + (ROWS - 1 - r) * rowStaggerMs;
      dropOutMap.set(cell.id, { cellId: cell.id, row: r, col: c, delayMs: delay, elapsedMs: 0, durationMs });
      maxEnd = Math.max(maxEnd, delay + durationMs);
    }
  }
  return maxEnd;
}

/** One exploding tile leaving the grid (spin clear); does not clear other animations. */
export function appendSpinExplodeDropOut(
  cellId: number,
  row: number,
  col: number,
  durationMs: number,
  symbol: TempleSymbol,
  delayMs = 0,
): void {
  dropOutMap.set(cellId, {
    cellId,
    row,
    col,
    delayMs: Math.max(0, delayMs),
    elapsedMs: 0,
    durationMs,
    spinExplode: true,
    symbol,
  });
}

// --- drop in (slab falls straight down its column, gravity + landing thud) ---
interface DropInAnim {
  cellId: number;
  row: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
}
const dropInMap = new Map<number, DropInAnim>();

/**
 * Vertical drop → brief “loose” (not a locked wall) → snap flush — “come together”.
 * `looseW` is continuous at the handoff so x/rot don’t pop.
 */
function cellStateFromDropIn(d: DropInAnim): CellRenderState {
  const tiltA = stoneTiltRad(d.cellId, 8);
  const stackAbove = 2.35;
  const spread = stoneTiltUnit(d.cellId + d.col * 17) * 0.042;
  const looseRot = stoneTiltRad(d.cellId + 5, 5);
  if (d.delayMs > 0) {
    return {
      xOffset: 0,
      yOffset: -(d.row + stackAbove),
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      rotation: tiltA * 0.35,
    };
  }
  const t = Math.min(1, d.elapsedMs / d.durationMs);
  const fallDist = d.row + stackAbove;
  const e = brickDropTravel(t);
  const yOffset = -fallDist * (1 - e);

  const looseStart = 0.7;
  const snapStart = 0.86;
  let looseW = 0;
  if (t < looseStart) {
    looseW = 0;
  } else if (t < snapStart) {
    const u = (t - looseStart) / (snapStart - looseStart);
    looseW = Math.sin(u * Math.PI * 0.5);
  } else {
    const u = (t - snapStart) / (1 - snapStart);
    looseW = Math.pow(1 - u, 2.2);
  }

  const xOff = spread * looseW;
  const settleBlend = Math.min(1, t * 1.12);
  let rot =
    Math.sin(t * Math.PI) * tiltA * (1 - settleBlend * 0.82) + looseRot * looseW * 0.88;
  if (t >= snapStart) {
    const u = (t - snapStart) / (1 - snapStart);
    rot *= 1 - u * 0.96;
  }

  return { xOffset: xOff, yOffset, scaleX: 1, scaleY: 1, alpha: 1, rotation: rot };
}

export function queueDropInAnimations(
  grid: { id: number }[][],
  baseDurationMs = 198,
  colStaggerMs = 52,
  rowStaggerMs = 14,
  onlyIds?: Set<number>,
): number {
  dropInMap.clear();
  let maxEnd = 0;
  for (let c = 0; c < REELS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cell = grid[r]?.[c];
      if (!cell) continue;
      if (onlyIds && !onlyIds.has(cell.id)) continue;
      const jitter = Math.round(stoneTiltUnit(cell.id + c * 9) * 10);
      const delay = c * colStaggerMs + (ROWS - 1 - r) * rowStaggerMs + jitter;
      const dist = r + 1;
      const dur = baseDurationMs + dist * 20;
      dropInMap.set(cell.id, { cellId: cell.id, row: r, col: c, delayMs: delay, elapsedMs: 0, durationMs: dur });
      maxEnd = Math.max(maxEnd, delay + dur);
    }
  }
  return maxEnd;
}

// --- highlight ---
interface HighlightAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}
const highlightMap = new Map<number, HighlightAnim>();

function cellStateFromHighlight(_h: HighlightAnim): CellRenderState {
  /** Keep scale locked — scaling reads like rubber, not solid stone (glow is drawn separately). */
  return { xOffset: 0, yOffset: 0, scaleX: 1, scaleY: 1, alpha: 1, rotation: 0 };
}

export function queueHighlightAnimations(cellIds: number[], durationMs = 420): void {
  highlightMap.clear();
  for (const id of cellIds) {
    highlightMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
  }
}

// --- pop ---
interface PopAnim {
  cellId: number;
  elapsedMs: number;
  durationMs: number;
}
const popMap = new Map<number, PopAnim>();

function cellStateFromPop(p: PopAnim): CellRenderState {
  const t = Math.min(1, p.elapsedMs / p.durationMs);
  const ease = easeInQuad(t);
  /** Rigid slab: no squash/stretch — crumble reads as fade + tilt only */
  return {
    xOffset: -0.04 * ease,
    yOffset: 0.02 * ease,
    scaleX: 1,
    scaleY: 1,
    alpha: 1 - ease * ease,
    rotation: -0.08 * ease,
  };
}

export function queuePopAnimations(cellIds: number[], durationMs = 320): void {
  popMap.clear();
  for (const id of cellIds) {
    popMap.set(id, { cellId: id, elapsedMs: 0, durationMs });
  }
}

// --- fall ---
export interface FallAnim {
  cellId: number;
  fromRow: number;
  toRow: number;
  col: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
  /** Spin fall-in / spin clear: level slabs, smooth curve, no air rotation. */
  fluid?: boolean;
  /** Locked at queue time so texture matches the moving tile even if grid refs mutate mid-anim. */
  symbol?: TempleSymbol;
}
const fallMap = new Map<number, FallAnim>();
/**
 * Cascade falls only: staggered `fallMap` entries delete as each tile lands; without this, draw briefly
 * falls back to `gridCell.symbol` and textures can pop. Held until `clearAllAnimations`.
 */
const cascadeFallTileSymbolById = new Map<number, TempleSymbol>();

function cellStateFromFall(f: FallAnim): CellRenderState {
  if (f.delayMs > 0) {
    return {
      xOffset: 0,
      yOffset: f.fromRow - f.toRow,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      rotation: 0,
    };
  }
  const t = Math.min(1, f.elapsedMs / f.durationMs);
  const rowDelta = f.fromRow - f.toRow;
  const e = f.fluid ? gravitySpinFallTravel(t) : brickShortFallTravel(t);
  const yOffset = rowDelta * (1 - e);
  if (t >= 1) {
    return { xOffset: 0, yOffset: 0, scaleX: 1, scaleY: 1, alpha: 1, rotation: 0 };
  }
  if (f.fluid) {
    return { xOffset: 0, yOffset, scaleX: 1, scaleY: 1, alpha: 1, rotation: 0 };
  }
  const tiltMax = stoneTiltRad(f.cellId, 7);
  const airPhase = t < 0.82 ? Math.sin(t * Math.PI) : 0;
  let rot = airPhase * tiltMax;
  if (t > 0.82) {
    const lt = (t - 0.82) / 0.18;
    rot *= 1 - lt;
  }
  return { xOffset: 0, yOffset, scaleX: 1, scaleY: 1, alpha: 1, rotation: rot };
}

/** Optional timing for `queueFallAnimations` (cascade uses defaults). */
export interface FallAnimTimingOptions {
  colStaggerMs?: number;
  rowStaggerMs?: number;
  indexStaggerMs?: number;
  /**
   * Spin / reel strip: same start time for every cell in a column so the stack stays physically
   * contiguous (no “top brick seated while air below”). Left→right still uses `colStaggerMs`.
   */
  columnStrip?: boolean;
  /**
   * Spin fall-in: bottom row of each column starts first, then up — blocks stack instead of one slab.
   * Uses `rowStaggerMs` with `(ROWS - 1 - toRow)` (ignored when `columnStrip` is true).
   */
  stackBottomFirst?: boolean;
  /** No per-cell ms jitter on delays (spin = steady rhythm). */
  suppressDelayJitter?: boolean;
  /** Smooth vertical ease + zero rotation (pair with stackBottomFirst for spin fall-in). */
  fluidFall?: boolean;
}

export type FallMove = {
  cellId: number;
  fromRow: number;
  toRow: number;
  col: number;
  /** Prefer this for rendering — tied to the moving cell at queue time (avoids texture vs slot mismatches). */
  symbol?: TempleSymbol;
};

/**
 * Fluid fall-in + survivor refills — snappy but still √-distance weighted.
 */
export const QUEST_RAIDER_SPIN_CLEAR_FALL_BASE_MS = 148;
/** Trap-door strip — short base so tiles read fast; √(dist) still scales longer falls. */
export const QUEST_RAIDER_SPIN_STRIP_DROP_BASE_MS = 108;
/** Fixed ms between opening each reel’s trap (overlap allowed). */
export const QUEST_RAIDER_SPIN_STRIP_COL_OFFSET_MS = 38;
/** L→R stagger for new symbols landing (row clicks / fall-in). */
export const QUEST_RAIDER_SPIN_REEL_COL_STAGGER_MS = 48;
export const QUEST_RAIDER_SPIN_CLEAR_FALL_TIMING: FallAnimTimingOptions = {
  colStaggerMs: 0,
  rowStaggerMs: 3,
  stackBottomFirst: true,
  suppressDelayJitter: true,
  fluidFall: true,
  indexStaggerMs: 0,
};
/** Spin fall-in: bottom-first stack per reel, fluid gravity curve. */
export const QUEST_RAIDER_SPIN_FALL_IN_TIMING: FallAnimTimingOptions = {
  colStaggerMs: QUEST_RAIDER_SPIN_REEL_COL_STAGGER_MS,
  rowStaggerMs: 2,
  indexStaggerMs: 0,
  stackBottomFirst: true,
  suppressDelayJitter: true,
  fluidFall: true,
};

/**
 * Strip trap-door: whole column releases as one beat — no row stagger (reads as a single drop).
 * Shorter base ms than fall-in so the clear pass feels quick while motion curve matches.
 */
export function questRaiderSpinStripExplodeTiming(row: number): { delayMs: number; durationMs: number } {
  const delayMs = 0;
  const fallDistCells = ROWS - row + 1.2;
  const dist = Math.max(1, Math.round(fallDistCells));
  const durationMs = fluidFallDurationMs(QUEST_RAIDER_SPIN_STRIP_DROP_BASE_MS, dist);
  return { delayMs, durationMs };
}

export function estimateSpinClearColumnExplodeMaxEndMs(removals: { removedRow: number }[]): number {
  let maxEnd = 0;
  for (const rem of removals) {
    const { delayMs, durationMs } = questRaiderSpinStripExplodeTiming(rem.removedRow);
    maxEnd = Math.max(maxEnd, delayMs + durationMs);
  }
  return maxEnd;
}

function fallMoveDelayDurationAndFluid(
  m: FallMove,
  index: number,
  durationMs: number,
  staggerMs: number,
  timing?: FallAnimTimingOptions,
): { delayMs: number; durationMs: number; fluid: boolean } {
  const colS = timing?.colStaggerMs ?? 10;
  const rowS = timing?.rowStaggerMs ?? 4;
  const idxS = timing?.indexStaggerMs ?? staggerMs;
  const strip = timing?.columnStrip === true;
  const dist = Math.abs(m.toRow - m.fromRow);
  const fluid = timing?.fluidFall === true;
  const dur = fluid ? fluidFallDurationMs(durationMs, dist) : durationMs + dist * 26;
  let delay: number;
  if (strip) {
    delay = m.col * colS;
  } else {
    const jitter =
      timing?.suppressDelayJitter === true
        ? 0
        : Math.round(stoneTiltUnit(m.cellId + m.col * 17) * 7);
    const rowTerm =
      timing?.stackBottomFirst === true ? (ROWS - 1 - m.toRow) * rowS : m.toRow * rowS;
    delay = m.col * colS + rowTerm + index * idxS + jitter;
  }
  return { delayMs: Math.max(0, delay), durationMs: dur, fluid };
}

/** Max `delay + duration` for a batch — must match `queueFallAnimations` / `appendFallAnimations`. */
export function estimateFallAnimBatchMaxEndMs(
  moves: FallMove[],
  durationMs: number,
  staggerMs = 5,
  timing?: FallAnimTimingOptions,
): number {
  let maxEnd = 0;
  for (let i = 0; i < moves.length; i++) {
    const { delayMs, durationMs: dur } = fallMoveDelayDurationAndFluid(
      moves[i],
      i,
      durationMs,
      staggerMs,
      timing,
    );
    maxEnd = Math.max(maxEnd, delayMs + dur);
  }
  return maxEnd;
}

export function queueFallAnimations(
  moves: FallMove[],
  durationMs = 212,
  staggerMs = 5,
  timing?: FallAnimTimingOptions,
  /** If set, each fall uses the symbol from this grid for that `cellId` for the whole animation. */
  symbolSnapshotGrid?: Grid,
  /**
   * Line-pay cascades: keep one art per `cellId` until `clearAllAnimations`, so staggered landings
   * don’t briefly read `cell.symbol` after `fallMap` deletes that id.
   */
  holdCascadeTileSymbols = false,
): number {
  fallMap.clear();
  if (holdCascadeTileSymbols) cascadeFallTileSymbolById.clear();
  let maxEnd = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const { delayMs, durationMs: dur, fluid } = fallMoveDelayDurationAndFluid(
      m,
      i,
      durationMs,
      staggerMs,
      timing,
    );
    const symbol: TempleSymbol =
      m.symbol ??
      (symbolSnapshotGrid !== undefined ? symbolForCellIdInGrid(symbolSnapshotGrid, m.cellId) : undefined) ??
      TempleSymbol.BirdBlue;
    if (holdCascadeTileSymbols) cascadeFallTileSymbolById.set(m.cellId, symbol);
    fallMap.set(m.cellId, { ...m, delayMs, elapsedMs: 0, durationMs: dur, fluid, symbol });
    maxEnd = Math.max(maxEnd, delayMs + dur);
  }
  return maxEnd;
}

/** Add fall moves without clearing existing falls / drop-outs (spin clear waves). */
export function appendFallAnimations(
  moves: FallMove[],
  durationMs = 212,
  staggerMs = 5,
  timing?: FallAnimTimingOptions,
  symbolSnapshotGrid?: Grid,
): number {
  let batchMax = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const { delayMs, durationMs: dur, fluid } = fallMoveDelayDurationAndFluid(
      m,
      i,
      durationMs,
      staggerMs,
      timing,
    );
    const symbol: TempleSymbol =
      m.symbol ??
      (symbolSnapshotGrid !== undefined ? symbolForCellIdInGrid(symbolSnapshotGrid, m.cellId) : undefined) ??
      TempleSymbol.BirdBlue;
    fallMap.set(m.cellId, { ...m, delayMs, elapsedMs: 0, durationMs: dur, fluid, symbol });
    batchMax = Math.max(batchMax, delayMs + dur);
  }
  return batchMax;
}

/** Cascade fall: locked tile art for `cellId` until next `clearAllAnimations`. */
export function getCascadeFallTileSymbol(cellId: number): TempleSymbol | undefined {
  return cascadeFallTileSymbolById.get(cellId);
}

/** Fall record for a cell (read-only) — use `symbol` for art while falling. */
export function getFallAnimForCell(cellId: number): FallAnim | undefined {
  return fallMap.get(cellId);
}

/** While a cell is in `fallMap`, use this for its art (falls back to grid cell if unset). */
export function getFallAnimSymbolSnapshot(cellId: number): TempleSymbol | undefined {
  return fallMap.get(cellId)?.symbol;
}

export function getSpinExplodeOrphans(grid: { id: number }[][]): {
  cellId: number;
  row: number;
  col: number;
  symbol: TempleSymbol;
}[] {
  const inGrid = new Set<number>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < REELS; c++) {
      inGrid.add(grid[r][c].id);
    }
  }
  const out: { cellId: number; row: number; col: number; symbol: TempleSymbol }[] = [];
  for (const d of dropOutMap.values()) {
    if (!d.spinExplode || d.symbol === undefined) continue;
    if (inGrid.has(d.cellId)) continue;
    out.push({ cellId: d.cellId, row: d.row, col: d.col, symbol: d.symbol });
  }
  out.sort((a, b) => a.col - b.col || a.row - b.row || a.cellId - b.cellId);
  return out;
}

function combinedState(s: CellRenderState): CellRenderState {
  return s;
}

export function getCellAnimState(cellId: number): CellRenderState | null {
  const dropOut = dropOutMap.get(cellId);
  if (dropOut) return combinedState(cellStateFromDropOut(dropOut));
  const dropIn = dropInMap.get(cellId);
  if (dropIn) return combinedState(cellStateFromDropIn(dropIn));
  const pop = popMap.get(cellId);
  if (pop) return combinedState(cellStateFromPop(pop));
  const highlight = highlightMap.get(cellId);
  if (highlight) return combinedState(cellStateFromHighlight(highlight));
  const fall = fallMap.get(cellId);
  if (fall) return combinedState(cellStateFromFall(fall));
  return null;
}

// --- particles ---
export type ParticleKind = 'debris' | 'smoke';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  life: number;
  maxLife: number;
  size: number;
  baseSize: number;
  rotation: number;
  rotSpeed: number;
  aspect: number;
  /** Thick pulverized-stone cloud vs light wisp */
  dense?: boolean;
}

const activeParticles: Particle[] = [];

const SMOKE_DUST = [0x5c5348, 0x7a6e62, 0x4a433c, 0x8c8072, 0x3d3830, 0x6b6358];
const STONE_DUST_DARK = [0x2a2824, 0x353330, 0x3e3b36, 0x48443e, 0x322f2c, 0x4a4540];
const STONE_CHIP = [0x1c1a18, 0x252220, 0x2e2b27, 0x383430];

export function spawnParticles(x: number, y: number, color: number, count = 12, speed = 4, lifeMs = 620): void {
  const n = Math.max(count, 10);
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 1.1;
    const v = speed * (0.55 + Math.random() * 1.05);
    const sz = 2.5 + Math.random() * 4;
    activeParticles.push({
      kind: 'debris',
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 3.2,
      color,
      life: 0,
      maxLife: lifeMs * (0.75 + Math.random() * 0.7),
      size: sz,
      baseSize: sz,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.28,
      aspect: 0.45 + Math.random() * 0.55,
    });
  }
}

/**
 * Stone slab shatter: dark chips + grit burst + dense grey-brown dust cloud (Gonzo-style).
 */
export function spawnBrickExplosion(cx: number, cy: number, accentColor: number, spread = 14): void {
  const shardN = 22;
  for (let i = 0; i < shardN; i++) {
    const angle = (Math.PI * 2 * i) / shardN + (Math.random() - 0.5) * 1.15;
    const v = 3 + Math.random() * 5.5;
    const useAccent = Math.random() < 0.22;
    const col = useAccent ? accentColor : STONE_CHIP[Math.floor(Math.random() * STONE_CHIP.length)];
    const sz = 2.4 + Math.random() * 5;
    activeParticles.push({
      kind: 'debris',
      x: cx + (Math.random() - 0.5) * spread * 0.92,
      y: cy + (Math.random() - 0.5) * spread * 0.92,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 3.2,
      color: col,
      life: 0,
      maxLife: 420 + Math.random() * 520,
      size: sz,
      baseSize: sz,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.55,
      aspect: 0.32 + Math.random() * 0.55,
    });
  }

  const gritN = 32;
  for (let i = 0; i < gritN; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = 1.8 + Math.random() * 5;
    const sz = 1 + Math.random() * 2.2;
    activeParticles.push({
      kind: 'debris',
      x: cx + (Math.random() - 0.5) * spread * 0.75,
      y: cy + (Math.random() - 0.5) * spread * 0.75,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 2.8,
      color: STONE_CHIP[Math.floor(Math.random() * STONE_CHIP.length)],
      life: 0,
      maxLife: 220 + Math.random() * 320,
      size: sz,
      baseSize: sz,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.9,
      aspect: 0.4 + Math.random() * 0.45,
    });
  }

  const denseSmokeN = 18;
  for (let i = 0; i < denseSmokeN; i++) {
    const col = STONE_DUST_DARK[Math.floor(Math.random() * STONE_DUST_DARK.length)];
    const bs = 12 + Math.random() * 22;
    const ang = Math.random() * Math.PI * 2;
    const puff = 0.8 + Math.random() * 2.4;
    activeParticles.push({
      kind: 'smoke',
      x: cx + (Math.random() - 0.5) * spread * 0.88,
      y: cy + (Math.random() - 0.5) * spread * 0.88,
      vx: Math.cos(ang) * puff,
      vy: Math.sin(ang) * puff - (0.6 + Math.random() * 1.2),
      color: col,
      life: 0,
      maxLife: 880 + Math.random() * 700,
      size: bs,
      baseSize: bs,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.1,
      aspect: 0.75 + Math.random() * 0.45,
      dense: true,
    });
  }

  const wispN = 26;
  for (let i = 0; i < wispN; i++) {
    const col = SMOKE_DUST[Math.floor(Math.random() * SMOKE_DUST.length)];
    const bs = 6 + Math.random() * 14;
    activeParticles.push({
      kind: 'smoke',
      x: cx + (Math.random() - 0.5) * (spread * 1.15),
      y: cy + (Math.random() - 0.5) * (spread * 1.05),
      vx: (Math.random() - 0.5) * 2.2,
      vy: (Math.random() - 0.5) * 1.8 - (0.4 + Math.random() * 1.1),
      color: col,
      life: 0,
      maxLife: 620 + Math.random() * 750,
      size: bs,
      baseSize: bs,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.08,
      aspect: 0.82 + Math.random() * 0.38,
      dense: false,
    });
  }
}

export function getParticles(): readonly Particle[] {
  return activeParticles;
}

// --- floating win ---
export interface FloatingWinText {
  x: number;
  y: number;
  amount: number;
  elapsedMs: number;
  durationMs: number;
}

const activeFloatingWins: FloatingWinText[] = [];

export function spawnFloatingWin(x: number, y: number, amount: number, durationMs = 2200): void {
  activeFloatingWins.push({ x, y, amount, elapsedMs: 0, durationMs });
}

export function getFloatingWins(): readonly FloatingWinText[] {
  return activeFloatingWins;
}

// --- camera shake ---
let shakeIntensity = 0;
let shakeElapsed = 0;
let shakeDuration = 0;
let shakeActive = false;

export function triggerCameraShake(intensity = 7, durationMs = 380): void {
  shakeIntensity = intensity;
  shakeDuration = durationMs;
  shakeElapsed = 0;
  shakeActive = true;
}

export function getCameraShakeOffset(): { x: number; y: number } {
  if (!shakeActive) return { x: 0, y: 0 };
  const decay = 1 - shakeElapsed / Math.max(1, shakeDuration);
  const amp = shakeIntensity * decay;
  const ph = shakeElapsed * 0.055;
  return {
    x: (Math.sin(ph * 2.1) * 0.72 + Math.sin(ph * 4.3) * 0.28) * amp,
    y: (Math.cos(ph * 1.8) * 0.68 + Math.cos(ph * 3.6) * 0.32) * amp,
  };
}

export function tickAnimations(dtMs: number): void {
  const dt = Math.min(Math.max(dtMs, 0), 40);
  for (const d of dropOutMap.values()) {
    if (d.delayMs > 0) {
      d.delayMs -= dt;
      continue;
    }
    d.elapsedMs += dt;
  }
  for (const [id, d] of [...dropOutMap]) {
    if (d.delayMs <= 0 && d.elapsedMs >= d.durationMs) dropOutMap.delete(id);
  }
  for (const d of dropInMap.values()) {
    if (d.delayMs > 0) {
      d.delayMs -= dt;
      continue;
    }
    d.elapsedMs += dt;
  }
  for (const h of highlightMap.values()) h.elapsedMs += dt;
  for (const p of popMap.values()) p.elapsedMs += dt;
  for (const f of fallMap.values()) {
    if (f.delayMs > 0) {
      f.delayMs -= dt;
      continue;
    }
    f.elapsedMs += dt;
  }
  for (const [id, f] of [...fallMap]) {
    if (f.delayMs <= 0 && f.elapsedMs >= f.durationMs) fallMap.delete(id);
  }
  for (let i = activeFloatingWins.length - 1; i >= 0; i--) {
    activeFloatingWins[i].elapsedMs += dt;
    if (activeFloatingWins[i].elapsedMs >= activeFloatingWins[i].durationMs) {
      activeFloatingWins.splice(i, 1);
    }
  }
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    const pdt = dt / 16;
    if (p.kind === 'smoke') {
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.991 + 0.022 * pdt;
      const t = p.life / Math.max(1, p.maxLife);
      const billow = p.dense ? 4.6 : 3.5;
      p.size = p.baseSize * (1 + billow * t);
      p.rotation += p.rotSpeed * pdt;
      p.life += dt;
    } else {
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
      p.vy += 0.11 * pdt;
      p.vx *= 0.994;
      p.rotation += p.rotSpeed * pdt;
      p.life += dt;
    }
    if (p.life >= p.maxLife) activeParticles.splice(i, 1);
  }
  if (shakeActive) {
    shakeElapsed += dt;
    if (shakeElapsed >= shakeDuration) shakeActive = false;
  }
}

export function clearAllAnimations(): void {
  dropOutMap.clear();
  dropInMap.clear();
  highlightMap.clear();
  popMap.clear();
  fallMap.clear();
  cascadeFallTileSymbolById.clear();
  activeParticles.length = 0;
  shakeActive = false;
}

export function clearAllAnimationsAndFloats(): void {
  clearAllAnimations();
  activeFloatingWins.length = 0;
}
