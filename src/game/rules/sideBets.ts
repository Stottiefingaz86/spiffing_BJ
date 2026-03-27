import type { Card, Rank, Suit } from '../domain/card';

export interface SideBetOutcome {
  name: string;
  multiplier: number;
}

// ---------------------------------------------------------------------------
// Perfect Pairs — player's first two cards
// ---------------------------------------------------------------------------

const RED_SUITS: Set<Suit> = new Set(['hearts', 'diamonds']);

function sameColor(a: Suit, b: Suit): boolean {
  return RED_SUITS.has(a) === RED_SUITS.has(b);
}

export function evaluatePerfectPairs(cards: Card[]): SideBetOutcome | null {
  if (cards.length < 2) return null;
  const [a, b] = [cards[0]!, cards[1]!];
  if (a.rank !== b.rank) return null;

  if (a.suit === b.suit) return { name: 'Perfect Pair', multiplier: 25 };
  if (sameColor(a.suit, b.suit)) return { name: 'Coloured Pair', multiplier: 12 };
  return { name: 'Mixed Pair', multiplier: 6 };
}

// ---------------------------------------------------------------------------
// 21+3 — player's first two cards + dealer's face-up card
// ---------------------------------------------------------------------------

const RANK_ORDER: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function isStraight(ranks: Rank[]): boolean {
  const vals = ranks.map((r) => RANK_ORDER[r]).sort((a, b) => a - b);
  if (vals[2]! - vals[0]! === 2 && new Set(vals).size === 3) return true;
  // Ace-high wrap: Q-K-A
  const highVals = ranks.map((r) => (r === 'A' ? 14 : RANK_ORDER[r])).sort((a, b) => a - b);
  return highVals[2]! - highVals[0]! === 2 && new Set(highVals).size === 3;
}

function isFlush(suits: Suit[]): boolean {
  return suits[0] === suits[1] && suits[1] === suits[2];
}

function isThreeOfAKind(ranks: Rank[]): boolean {
  return ranks[0] === ranks[1] && ranks[1] === ranks[2];
}

export function evaluateTwentyOnePlusThree(
  playerCards: Card[],
  dealerUpcard: Card,
): SideBetOutcome | null {
  if (playerCards.length < 2) return null;

  const three = [playerCards[0]!, playerCards[1]!, dealerUpcard];
  const ranks = three.map((c) => c.rank);
  const suits = three.map((c) => c.suit);
  const flush = isFlush(suits);
  const straight = isStraight(ranks);
  const trips = isThreeOfAKind(ranks);

  if (trips && flush) return { name: 'Suited Trips', multiplier: 100 };
  if (straight && flush) return { name: 'Straight Flush', multiplier: 40 };
  if (trips) return { name: 'Three of a Kind', multiplier: 30 };
  if (straight) return { name: 'Straight', multiplier: 10 };
  if (flush) return { name: 'Flush', multiplier: 5 };
  return null;
}
