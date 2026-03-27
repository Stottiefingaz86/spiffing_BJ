/**
 * Count-up for visible hand totals (dealer + seats). BUST snaps on once the engine reports bust.
 */
import { scoreHand } from '@/game/rules/scoring';
import { GamePhase } from '@/game/state/phases';
import type { TableSnapshot } from '@/game/state/table-state';

const DURATION_MS = 520;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type DCell = {
  show: number;
  target: number;
  t0: number;
};

let dealer: DCell | null = null;
const seats: (DCell | null)[] = [null, null, null, null, null];

function pushTarget(cell: DCell | null, target: number, now: number): DCell {
  const show = cell ? cell.show : 0;
  return { show, target, t0: now };
}

export function syncTableScoreAnimations(snapshot: TableSnapshot): void {
  if (snapshot.phase === GamePhase.Betting) {
    dealer = null;
    for (let i = 0; i < 5; i++) seats[i] = null;
    return;
  }

  const now = performance.now();
  const d = scoreHand(snapshot.dealer.hand.cards);
  if (d.bust) {
    dealer = null;
  } else {
    const t = d.total;
    if (!dealer || dealer.target !== t) {
      dealer = pushTarget(dealer, t, now);
    }
  }

  for (let i = 0; i < 5; i++) {
    const seat = snapshot.seats[i]!;
    if (seat.hand.cards.length === 0) {
      seats[i] = null;
      continue;
    }
    const s = scoreHand(seat.hand.cards);
    if (s.bust) {
      seats[i] = null;
    } else {
      const t = s.total;
      const c = seats[i];
      if (!c || c.target !== t) {
        seats[i] = pushTarget(c, t, now);
      }
    }
  }
}

export function tickTableScoreAnimations(now: number): boolean {
  const step = (cell: DCell | null): DCell | null => {
    if (!cell) return null;
    if (cell.show === cell.target) return cell;
    const u = Math.min(1, (now - cell.t0) / DURATION_MS);
    const next = Math.round(cell.show + (cell.target - cell.show) * easeOutCubic(u));
    cell.show = next;
    return cell;
  };

  let dirty = false;
  const beforeD = dealer?.show;
  dealer = step(dealer);
  if (dealer && dealer.show !== beforeD) dirty = true;
  if (dealer && dealer.show !== dealer.target) dirty = true;

  for (let i = 0; i < 5; i++) {
    const before = seats[i]?.show;
    seats[i] = step(seats[i]);
    if (seats[i] && seats[i]!.show !== before) dirty = true;
    if (seats[i] && seats[i]!.show !== seats[i]!.target) dirty = true;
  }
  return dirty;
}

export function tableScoreAnimationsActive(): boolean {
  if (dealer && dealer.show !== dealer.target) return true;
  return seats.some((c) => c && c.show !== c.target);
}

export function animatedDealerScoreLabel(snapshot: TableSnapshot): string {
  const t = scoreHand(snapshot.dealer.hand.cards);
  if (!dealer) return String(t.total);
  return String(dealer.show);
}

export function animatedSeatScoreLabel(snapshot: TableSnapshot, seatIndex: number): string {
  const s = scoreHand(snapshot.seats[seatIndex]!.hand.cards);
  const c = seats[seatIndex];
  if (!c) return String(s.total);
  return String(c.show);
}
