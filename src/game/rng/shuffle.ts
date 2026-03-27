import type { RandomSource } from './random-source';

/** In-place Fisher–Yates shuffle. */
export function shuffleInPlace<T>(items: T[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
