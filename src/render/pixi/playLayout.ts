/**
 * Card and seat layout for the play surface.
 *
 * The canvas is split into three vertical zones:
 *   Top zone    — Dealer cards + badge
 *   Middle zone — Hero (active hand, large)
 *   Bottom zone — Rail (inactive hands)
 *
 * When there's no hero (dealer turn / settlement / round complete),
 * the dealer gets the top zone and the rail moves up into the middle.
 */
import { GamePhase } from '@/game/state/phases';
import type { HandIndex, TableSnapshot } from '@/game/state/table-state';

export const INACTIVE_HAND_SCALE = 0.88;

export interface CardPlacement {
  x: number;
  y: number;
  cw: number;
  ch: number;
}

export interface SeatUiSpot {
  index: HandIndex;
  sx: number;
  sy: number;
  isHero: boolean;
}

export function heroSeatForLayout(snapshot: TableSnapshot): HandIndex | null {
  if (
    snapshot.phase === GamePhase.HandTransition &&
    snapshot.handTransitionFrom !== null
  ) {
    // Always keep the finishing hand in hero position during the pause,
    // even for the last hand. The retreat-to-rail animation happens when
    // DealerTurn begins via queueSplitTransitionFlights.
    return snapshot.handTransitionFrom;
  }
  if (snapshot.phase === GamePhase.PlayerTurn && snapshot.activeSeatIndex !== null) {
    return snapshot.activeSeatIndex;
  }
  if (snapshot.phase === GamePhase.DealerTurn) return null;
  if (snapshot.phase === GamePhase.Settlement) return null;
  if (snapshot.phase === GamePhase.RoundComplete) return null;
  return null;
}

function isNarrow(w: number): boolean {
  return w < 640;
}

/**
 * Shared layout geometry used by both card placement and UI spot positioning.
 */
function computeLayout(snapshot: TableSnapshot, width: number, height: number) {
  const n = isNarrow(width);
  const cx = width / 2;

  const heroI = heroSeatForLayout(snapshot);
  const hasHero = heroI !== null;

  // Keep hero-present zone proportions during DealerTurn / Settlement /
  // RoundComplete so rail hands never shift — only the former hero animates
  // to its rail slot.
  const expectsHero = hasHero ||
    snapshot.phase === GamePhase.Dealing ||
    snapshot.phase === GamePhase.InsuranceOffer ||
    snapshot.phase === GamePhase.HandTransition ||
    snapshot.phase === GamePhase.DealerTurn ||
    snapshot.phase === GamePhase.Settlement ||
    snapshot.phase === GamePhase.RoundComplete;

  // Dealer goes big & centred once no player hand is active.
  const dealerShowdown = !hasHero && (
    snapshot.phase === GamePhase.DealerTurn ||
    snapshot.phase === GamePhase.Settlement ||
    snapshot.phase === GamePhase.RoundComplete
  );

  // Top margin — leave room for phase banner text
  const topPad = n ? 28 : 34;

  // ---- Zone heights (fractions of remaining canvas below topPad) ----
  const playH = height - topPad;

  const dealerZoneH = playH * (n ? 0.22 : 0.26);
  const dealerZoneTop = topPad;

  const railZoneH = playH * (n ? 0.26 : 0.26);
  const railZoneTop = height - railZoneH;

  // Hero zone: the space between dealer and rail
  const heroZoneTop = dealerZoneTop + dealerZoneH;
  const heroZoneH = railZoneTop - heroZoneTop;

  // ---- Card sizes — constrained to fit within their zone ----
  // During showdown the dealer uses the full area above the rail.
  const showdownAreaH = railZoneTop - topPad;
  const dealerSizeZoneH = dealerShowdown ? showdownAreaH : dealerZoneH;
  const dealerMaxCh = dealerSizeZoneH * 0.55;
  const dealerMaxCw = dealerMaxCh / 1.4;
  const dealerCardCount = snapshot.dealer.hand.cards.length || 2;
  const dealerOverlap = 0.50;
  const dealerPillRoom = 40;
  const dealerPadX = n ? width * 0.06 : width * 0.08;
  const dealerAvailW = (dealerShowdown ? width : width * 0.55) - dealerPadX * 2 - dealerPillRoom;
  const dealerFitCw = dealerAvailW / (1 + (dealerCardCount - 1) * dealerOverlap);
  const dealerBaseCw = dealerShowdown
    ? (n ? width * 0.26 : width * 0.15)
    : (n ? width * 0.20 : width * 0.12);
  const dealerCw = Math.min(dealerBaseCw, dealerMaxCw, dealerFitCw);
  const dealerCh = dealerCw * 1.4;

  // Hero cards: start big but shrink if the hand has many cards so they fit.
  const heroCardCount = (heroI !== null ? snapshot.seats[heroI]!.hand.cards.length : 2) || 2;
  const heroOverlap = 0.44;
  const heroPadX = n ? width * 0.08 : width * 0.10;
  const heroAvailW = width - heroPadX * 2;
  const heroFitCw = heroAvailW / (1 + (heroCardCount - 1) * heroOverlap);
  const heroMaxCh = heroZoneH * 0.82;
  const heroMaxCw = heroMaxCh / 1.4;
  const heroBaseCw = n ? width * 0.30 : width * 0.16;
  const heroCw = Math.min(heroBaseCw, heroMaxCw, heroFitCw);
  const heroCh = heroCw * 1.4;

  // Rail cards: fit within rail zone with room for score pill above + bet below.
  // On mobile keep them compact so 5 hands never overlap each other.
  const railLabelRoom = n ? 36 : 20;
  const railMaxCh = (railZoneH - railLabelRoom) * (n ? 0.52 : 0.62);
  const railMaxCw = railMaxCh / 1.4;
  const railBaseCw = n ? width * 0.058 : width * 0.08;
  const railCw = Math.min(railMaxCw, railBaseCw);
  const railCh = railCw * 1.4;

  // ---- Positions ----
  // NOTE: card (x,y) is the card CENTER, not top-left.

  // Dealer: during showdown, dead centre in the available space above the rail.
  const showdownAvail = railZoneTop - topPad;
  const dealerY = dealerShowdown
    ? topPad + showdownAvail * 0.50
    : dealerZoneTop + dealerCh / 2 + 6;
  const dealerCx = dealerShowdown ? cx : (n ? width * 0.72 : width * 0.75);

  // Hero: card center pushed up from zone midpoint
  const heroTopY = heroZoneTop + heroZoneH * 0.36;

  // Rail: centre cards in the rail zone vertically
  const railCardY = n
    ? railZoneTop + railZoneH * 0.45
    : railZoneTop + railZoneH / 2 - 4;

  // Rail horizontal distribution — FIXED slots based on seat index (0–4).
  // Every seat always occupies the same X so hands never shuffle around.
  const railPadX = n ? width * 0.05 : width * 0.08;
  const usableW = width - railPadX * 2;
  const slotGap = usableW / 5;

  return {
    n, cx, heroI, hasHero, dealerShowdown,
    dealerCw, dealerCh, dealerY, dealerCx,
    heroCw, heroCh, heroTopY,
    railCw, railCh, railCardY,
    railPadX, slotGap,
  };
}

// ---------------------------------------------------------------------------
// Card layout
// ---------------------------------------------------------------------------

export function buildCardLayoutMap(
  snapshot: TableSnapshot,
  width: number,
  height: number,
): Map<string, CardPlacement> {
  const m = new Map<string, CardPlacement>();
  const L = computeLayout(snapshot, width, height);

  // ---- Dealer ----
  const dCards = snapshot.dealer.hand.cards;
  const dSpread = L.dealerCw * 0.50;
  const dTotalW = (dCards.length - 1) * dSpread;
  dCards.forEach((card, i) => {
    m.set(card.id, {
      x: L.dealerCx - dTotalW / 2 + i * dSpread,
      y: L.dealerY,
      cw: L.dealerCw,
      ch: L.dealerCh,
    });
  });

  // ---- Players ----
  for (let i = 0; i < 5; i++) {
    const seat = snapshot.seats[i]!;
    const cards = seat.hand.cards;
    if (cards.length === 0) continue;

    if (L.hasHero && i === L.heroI) {
      const sp = L.heroCw * 0.44;
      const tw = (cards.length - 1) * sp;
      cards.forEach((card, ci) => {
        m.set(card.id, {
          x: L.cx - tw / 2 + ci * sp,
          y: L.heroTopY,
          cw: L.heroCw,
          ch: L.heroCh,
        });
      });
    } else {
      // Fixed X based on seat index — never shifts when hero changes
      const sx = L.railPadX + L.slotGap * (i + 0.5);
      const baseOverlap = L.n ? 0.42 : 0.44;
      let sp = L.railCw * baseOverlap;
      // Shrink spread if cards would overflow the slot
      const maxSpread = L.slotGap * 0.88;
      const neededW = (cards.length - 1) * sp + L.railCw;
      if (neededW > maxSpread && cards.length > 1) {
        sp = (maxSpread - L.railCw) / (cards.length - 1);
      }
      const tw = (cards.length - 1) * sp;
      cards.forEach((card, ci) => {
        m.set(card.id, {
          x: sx - tw / 2 + ci * sp,
          y: L.railCardY,
          cw: L.railCw,
          ch: L.railCh,
        });
      });
    }
  }

  return m;
}

// ---------------------------------------------------------------------------
// Seat UI spots (for score / bet / status pill positioning)
// ---------------------------------------------------------------------------

export function buildSeatUiSpots(
  snapshot: TableSnapshot,
  width: number,
  height: number,
): SeatUiSpot[] {
  const L = computeLayout(snapshot, width, height);
  const out: SeatUiSpot[] = [];

  for (let i = 0; i < 5; i++) {
    if (L.hasHero && i === L.heroI) {
      out.push({ index: i as HandIndex, sx: L.cx, sy: L.heroTopY, isHero: true });
    } else {
      const sx = L.railPadX + L.slotGap * (i + 0.5);
      out.push({ index: i as HandIndex, sx, sy: L.railCardY, isHero: false });
    }
  }

  return out;
}
