import type { Hand } from '../domain/hand';
import type { RuleSet } from './config';
import { isSoft17, scoreHand } from './scoring';

/**
 * Whether the dealer must take another card with the current up-cards (all face-up for simulation).
 */
export function dealerShouldHit(hand: Hand, rules: RuleSet): boolean {
  const { total, bust } = scoreHand(hand.cards);
  if (bust) return false;
  if (total < 17) return true;
  if (total > 17) return false;
  // Hard 17 — stand
  if (!isSoft17(hand.cards)) return false;
  // Soft 17
  return rules.dealerHoleRule === 'hit_soft_17';
}
