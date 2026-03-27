/**
 * Abstraction for randomness. V1: `Math.random` wrapper.
 * Future: deterministic seeds, crypto RNG, server-provided draws.
 */
export interface RandomSource {
  /** Uniform float in [0, 1). */
  next(): number;
}

export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}
