import { createCardId, RANKS, SUITS, type Card, type Rank, type Suit } from '../domain/card';
import type { RandomSource } from './random-source';
import type { ShoeProvider } from './providers';
import { shuffleInPlace } from './shuffle';

export interface ShoeOptions {
  deckCount: number;
  /** Reshuffle when remaining cards <= this count (cut card). */
  penetrationReserve: number;
  rng: RandomSource;
  /** Prefix for generated card ids (e.g. shoe generation). */
  idPrefix: string;
}

/**
 * Multi-deck shoe with deterministic draw order and reshuffle when low.
 */
export class Shoe implements ShoeProvider {
  private readonly deckCount: number;
  private readonly penetrationReserve: number;
  private readonly rng: RandomSource;
  private readonly idPrefix: string;
  private stack: Card[] = [];
  private nextId = 0;

  constructor(options: ShoeOptions) {
    this.deckCount = options.deckCount;
    this.penetrationReserve = options.penetrationReserve;
    this.rng = options.rng;
    this.idPrefix = options.idPrefix;
    this.reshuffle();
  }

  needsReshuffle(): boolean {
    return this.stack.length <= this.penetrationReserve;
  }

  remaining(): number {
    return this.stack.length;
  }

  reshuffle(): void {
    const cards: Card[] = [];
    for (let d = 0; d < this.deckCount; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          cards.push(this.makeCard(rank, suit, true));
        }
      }
    }
    shuffleInPlace(cards, this.rng);
    this.stack = cards;
  }

  draw(faceUp: boolean): Card {
    if (this.stack.length === 0) {
      this.reshuffle();
    }
    const card = this.stack.pop();
    if (!card) {
      throw new Error('Shoe draw failed after reshuffle');
    }
    return { ...card, faceUp };
  }

  /** Peek without removing (debug / future server sync). */
  peek(depth: number): readonly Card[] {
    return this.stack.slice(this.stack.length - depth, this.stack.length);
  }

  private makeCard(rank: Rank, suit: Suit, faceUp: boolean): Card {
    const id = createCardId(this.idPrefix, this.nextId++);
    return { id, rank, suit, faceUp };
  }
}
