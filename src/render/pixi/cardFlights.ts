/**
 * Card flight animations: deal-in from deck, layout transitions, and card flips.
 */
import { GamePhase } from '@/game/state/phases';
import type { TableSnapshot } from '@/game/state/table-state';

import type { CardPlacement } from './playLayout';
import { buildCardLayoutMap } from './playLayout';

// ---------------------------------------------------------------------------
// Movement flights
// ---------------------------------------------------------------------------

interface Flight {
  dealIn: boolean;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  scw: number;
  sch: number;
  ecw: number;
  ech: number;
}

const flights = new Map<string, Flight>();

// ---------------------------------------------------------------------------
// Flip animations
// ---------------------------------------------------------------------------

interface Flip {
  elapsedMs: number;
  durationMs: number;
}

const flips = new Map<string, Flip>();

const FLIP_DURATION_MS = 280;

function allCardIds(s: TableSnapshot): Set<string> {
  const set = new Set<string>();
  for (const c of s.dealer.hand.cards) set.add(c.id);
  for (const seat of s.seats) for (const c of seat.hand.cards) set.add(c.id);
  return set;
}

/** Build a faceUp map for all cards in a snapshot. */
function buildFaceUpMap(s: TableSnapshot): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const c of s.dealer.hand.cards) m.set(c.id, c.faceUp);
  for (const seat of s.seats) for (const c of seat.hand.cards) m.set(c.id, c.faceUp);
  return m;
}

function orderedCardIds(snapshot: TableSnapshot): string[] {
  const out: string[] = [];
  const maxR = Math.max(
    snapshot.dealer.hand.cards.length,
    ...snapshot.seats.map((s) => s.hand.cards.length),
  );
  for (let r = 0; r < maxR; r++) {
    for (let i = 0; i < 5; i++) {
      const c = snapshot.seats[i]!.hand.cards[r];
      if (c) out.push(c.id);
    }
    const d = snapshot.dealer.hand.cards[r];
    if (d) out.push(d.id);
  }
  return out;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function easeInOutBack(t: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

function queueLayoutTransitionFlights(
  prev: TableSnapshot,
  next: TableSnapshot,
  width: number,
  height: number,
  layoutNext: Map<string, CardPlacement>,
  staggerMs: number,
  durationMs: number,
  minDist: number,
): void {
  const oldLayout = buildCardLayoutMap(prev, width, height);
  let st = 0;
  for (const id of orderedCardIds(next)) {
    if (flights.has(id)) continue;
    const op = oldLayout.get(id);
    const np = layoutNext.get(id);
    if (!op || !np) continue;
    const dist = Math.hypot(np.x - op.x, np.y - op.y);
    const sizeDelta = Math.abs(np.cw - op.cw) + Math.abs(np.ch - op.ch);
    if (dist < minDist && sizeDelta < 5) continue;
    flights.set(id, {
      dealIn: false,
      delayMs: st * staggerMs,
      elapsedMs: 0,
      durationMs,
      sx: op.x,
      sy: op.y,
      ex: np.x,
      ey: np.y,
      scw: op.cw,
      sch: op.ch,
      ecw: np.cw,
      ech: np.ch,
    });
    st += 1;
  }
}

/**
 * Two-phase transition: player cards move first, then dealer cards follow
 * after a delay. Creates the "hero returns to rail, then dealer comes forward"
 * effect.
 */
function queueSplitTransitionFlights(
  prev: TableSnapshot,
  next: TableSnapshot,
  width: number,
  height: number,
  layoutNext: Map<string, CardPlacement>,
  playerDurationMs: number,
  dealerDelayMs: number,
  dealerDurationMs: number,
  minDist: number,
): void {
  const oldLayout = buildCardLayoutMap(prev, width, height);
  const dealerIds = new Set(next.dealer.hand.cards.map((c) => c.id));

  for (const id of orderedCardIds(next)) {
    if (flights.has(id)) continue;
    const op = oldLayout.get(id);
    const np = layoutNext.get(id);
    if (!op || !np) continue;
    const dist = Math.hypot(np.x - op.x, np.y - op.y);
    const sizeDelta = Math.abs(np.cw - op.cw) + Math.abs(np.ch - op.ch);
    if (dist < minDist && sizeDelta < 5) continue;

    const isDealer = dealerIds.has(id);
    flights.set(id, {
      dealIn: false,
      delayMs: isDealer ? dealerDelayMs : 0,
      elapsedMs: 0,
      durationMs: isDealer ? dealerDurationMs : playerDurationMs,
      sx: op.x,
      sy: op.y,
      ex: np.x,
      ey: np.y,
      scw: op.cw,
      sch: op.ch,
      ecw: np.cw,
      ech: np.ch,
    });
  }
}

export function clearCardFlights(): void {
  flights.clear();
  flips.clear();
}

export function areCardFlightsActive(): boolean {
  for (const f of flights.values()) {
    if (f.delayMs > 0) return true;
    if (f.elapsedMs < f.durationMs) return true;
  }
  for (const f of flips.values()) {
    if (f.elapsedMs < f.durationMs) return true;
  }
  return false;
}

export function syncCardFlights(
  prev: TableSnapshot | null,
  next: TableSnapshot,
  width: number,
  height: number,
): void {
  const prevSet = prev ? allCardIds(prev) : new Set<string>();
  const nextSet = allCardIds(next);
  for (const id of flights.keys()) {
    if (!nextSet.has(id)) flights.delete(id);
  }
  for (const id of flips.keys()) {
    if (!nextSet.has(id)) flips.delete(id);
  }

  // Detect faceDown→faceUp transitions and queue flip animations
  if (prev) {
    const prevFaces = buildFaceUpMap(prev);
    const nextFaces = buildFaceUpMap(next);
    for (const [id, nowUp] of nextFaces) {
      const wasUp = prevFaces.get(id);
      if (wasUp === false && nowUp === true && !flips.has(id)) {
        flips.set(id, { elapsedMs: 0, durationMs: FLIP_DURATION_MS });
      }
    }
  }

  const layout = buildCardLayoutMap(next, width, height);

  // Deck origin: near the dealer position (top-right area)
  const n = width < 640;
  const deckCx = n ? width * 0.66 : width * 0.72;
  const deckCy = height * 0.08;

  // Dealing → PlayerTurn: cards are already in position from deal-in animation.
  // Only the hero hand needs to fly to center — handled by the hero promotion below.
  if (prev && prev.phase === GamePhase.Dealing && next.phase === GamePhase.PlayerTurn) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 280, 5);
  }

  if (prev && prev.phase === GamePhase.Dealing && next.phase === GamePhase.InsuranceOffer) {
    // No transition needed — cards stay in place
  }

  if (prev && prev.phase === GamePhase.InsuranceOffer && next.phase === GamePhase.PlayerTurn) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 280, 5);
  }

  if (prev && prev.phase === GamePhase.InsuranceOffer && next.phase === GamePhase.RoundComplete) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 280, 5);
  }

  // Stand on a hand — if there's a next hand the hero stays in centre
  // (layout unchanged). If last hand, hero stays in centre during the
  // HandTransition pause (no movement needed — the retreat happens on
  // the HandTransition → DealerTurn transition).
  if (prev && prev.phase === GamePhase.PlayerTurn && next.phase === GamePhase.HandTransition) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 280, 3);
  }

  // Direct PlayerTurn → DealerTurn (rare; fallback).
  if (prev && prev.phase === GamePhase.PlayerTurn && next.phase === GamePhase.DealerTurn) {
    queueSplitTransitionFlights(prev, next, width, height, layout, 350, 200, 380, 1);
  }

  // Next hand becomes the hero — previous hero to rail, new hero to centre.
  if (prev && prev.phase === GamePhase.HandTransition && next.phase === GamePhase.PlayerTurn) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 320, 3);
  }

  // HandTransition → DealerTurn: hero cards retreat to the rail first,
  // then the dealer glides to centre for the showdown after a short delay.
  if (prev && prev.phase === GamePhase.HandTransition && next.phase === GamePhase.DealerTurn) {
    queueSplitTransitionFlights(prev, next, width, height, layout, 350, 200, 380, 1);
  }

  // Active seat changes within PlayerTurn.
  if (
    prev &&
    prev.phase === GamePhase.PlayerTurn &&
    next.phase === GamePhase.PlayerTurn &&
    prev.activeSeatIndex !== next.activeSeatIndex
  ) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 320, 3);
  }

  // Hero gets a new card (hit) — existing cards re-centre smoothly.
  if (
    prev &&
    prev.phase === GamePhase.PlayerTurn &&
    next.phase === GamePhase.PlayerTurn &&
    prev.activeSeatIndex === next.activeSeatIndex
  ) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 180, 2);
  }

  // Dealer draws a card — existing dealer cards re-spread smoothly.
  if (
    prev &&
    prev.phase === GamePhase.DealerTurn &&
    next.phase === GamePhase.DealerTurn
  ) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 200, 2);
  }

  // Dealer done → settlement begins.
  if (prev && prev.phase === GamePhase.DealerTurn && next.phase === GamePhase.Settlement) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 250, 3);
  }

  // Settlement advances hand by hand.
  if (prev && prev.phase === GamePhase.Settlement && next.phase === GamePhase.Settlement) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 200, 3);
  }

  // Settlement → RoundComplete.
  if (prev && prev.phase === GamePhase.Settlement && next.phase === GamePhase.RoundComplete) {
    queueLayoutTransitionFlights(prev, next, width, height, layout, 0, 250, 3);
  }

  const isDealerTurn = next.phase === GamePhase.DealerTurn;
  const dealFlightMs = isDealerTurn ? 300 : 220;
  const dealStaggerMs = isDealerTurn ? 35 : 25;

  const ordered = orderedCardIds(next);
  const newIds = ordered.filter((id) => !prevSet.has(id));
  let stagger = 0;
  for (const id of newIds) {
    if (flights.has(id)) continue;
    const pl = layout.get(id);
    if (!pl) continue;
    const cw = pl.cw;
    const ch = pl.ch;
    flights.set(id, {
      dealIn: true,
      delayMs: stagger * dealStaggerMs,
      elapsedMs: 0,
      durationMs: dealFlightMs,
      sx: deckCx - cw / 2,
      sy: deckCy,
      ex: pl.x,
      ey: pl.y,
      scw: cw,
      sch: ch,
      ecw: cw,
      ech: ch,
    });
    stagger += 1;
  }
}

export function stepCardFlights(dtMs: number): void {
  for (const [id, f] of flights) {
    if (f.delayMs > 0) {
      f.delayMs = Math.max(0, f.delayMs - dtMs);
      continue;
    }
    f.elapsedMs += dtMs;
    if (f.elapsedMs >= f.durationMs) {
      flights.delete(id);
    }
  }
  for (const [id, f] of flips) {
    f.elapsedMs += dtMs;
    if (f.elapsedMs >= f.durationMs) {
      flips.delete(id);
    }
  }
}

export interface CardMotion {
  x: number;
  y: number;
  cw: number;
  ch: number;
  alpha: number;
  scale: number;
  /** 0-1 scaleX multiplier for flip effect. 1 = normal, 0 = edge-on. */
  flipScaleX: number;
  /** true while in the first half of the flip (should show back). */
  flipShowBack: boolean;
}

export function applyCardFlight(
  id: string,
  placement: CardPlacement,
): CardMotion {
  let x = placement.x;
  let y = placement.y;
  let cw = placement.cw;
  let ch = placement.ch;
  let alpha = 1;
  let scale = 1;

  const f = flights.get(id);
  if (f) {
    if (f.dealIn) {
      if (f.delayMs > 0) {
        x = f.sx; y = f.sy; cw = f.scw; ch = f.sch; alpha = 0;
      } else {
        const t = Math.min(1, f.elapsedMs / f.durationMs);
        const e = easeOutCubic(t);
        x = f.sx + (f.ex - f.sx) * e;
        y = f.sy + (f.ey - f.sy) * e;
        cw = f.ecw;
        ch = f.ech;
        alpha = Math.min(1, t * 3);
      }
    } else {
      if (f.delayMs > 0) {
        x = f.sx; y = f.sy; cw = f.scw; ch = f.sch;
      } else {
        const t = Math.min(1, f.elapsedMs / f.durationMs);
        const e = easeInOutBack(t);
        x = f.sx + (f.ex - f.sx) * e;
        y = f.sy + (f.ey - f.sy) * e;
        cw = f.scw + (f.ecw - f.scw) * e;
        ch = f.sch + (f.ech - f.sch) * e;
      }
    }
  }

  // Flip animation
  let flipScaleX = 1;
  let flipShowBack = false;
  const fl = flips.get(id);
  if (fl) {
    const t = Math.min(1, fl.elapsedMs / fl.durationMs);
    // First half: squeeze to 0 (showing back). Second half: expand to 1 (showing face).
    if (t < 0.5) {
      flipScaleX = 1 - t * 2;
      flipShowBack = true;
    } else {
      flipScaleX = (t - 0.5) * 2;
      flipShowBack = false;
    }
  }

  return { x, y, cw, ch, alpha, scale, flipScaleX, flipShowBack };
}
