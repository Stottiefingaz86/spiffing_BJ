/** Playing card domain: rank, suit, and stable runtime identity for animation tracking. */

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  /** Monotonic id assigned when the card enters play (deck / shoe). */
  id: string;
  rank: Rank;
  suit: Suit;
  faceUp: boolean;
}

export function createCardId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}
