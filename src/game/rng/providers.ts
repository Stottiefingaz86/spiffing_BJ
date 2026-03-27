import type { Card } from '../domain/card';

/**
 * Future: swap implementations for server-dealt shoes or certified RNG pipelines.
 */
export interface ShoeProvider {
  draw(faceUp: boolean): Card;
  needsReshuffle(): boolean;
  remaining(): number;
  reshuffle(): void;
}
