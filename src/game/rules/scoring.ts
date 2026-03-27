import type { Card, Rank } from '../domain/card';

export interface HandTotal {
  /** Best total ≤ 21 if possible; otherwise lowest total > 21. */
  total: number;
  soft: boolean;
  bust: boolean;
}

const RANK_VALUES: Record<Rank, number[]> = {
  A: [1, 11],
  '2': [2],
  '3': [3],
  '4': [4],
  '5': [5],
  '6': [6],
  '7': [7],
  '8': [8],
  '9': [9],
  '10': [10],
  J: [10],
  Q: [10],
  K: [10],
};

/** Only face-up cards contribute to visible totals (e.g. dealer hole hidden). */
export function getVisibleCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.faceUp);
}

export function scoreHand(cards: Card[]): HandTotal {
  const visible = getVisibleCards(cards);
  let min = 0;
  let max = 0;
  let acesAs11 = 0;

  for (const card of visible) {
    const values = RANK_VALUES[card.rank];
    if (card.rank === 'A') {
      min += 1;
      max += 11;
      acesAs11 += 1;
    } else {
      const v = values[0];
      min += v;
      max += v;
    }
  }

  if (max > 21 && acesAs11 > 0) {
    while (max > 21 && acesAs11 > 0) {
      max -= 10;
      acesAs11 -= 1;
    }
  }

  const soft = acesAs11 > 0 && max <= 21;
  const best = max <= 21 ? max : min;
  const bust = best > 21;

  return { total: best, soft, bust };
}

export function isBlackjack(cards: Card[]): boolean {
  const visible = getVisibleCards(cards);
  if (visible.length !== 2) return false;
  const { total, bust } = scoreHand(visible);
  return !bust && total === 21;
}

export function isSoft17(cards: Card[]): boolean {
  const { total, soft, bust } = scoreHand(cards);
  return !bust && total === 17 && soft;
}
