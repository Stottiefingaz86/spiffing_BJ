import type { Card } from './card';

/** Player or dealer hand in logical order (index 0 = first dealt). */
export interface Hand {
  cards: Card[];
}

export function emptyHand(): Hand {
  return { cards: [] };
}
