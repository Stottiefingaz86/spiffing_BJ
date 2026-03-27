import type { MoneyCents } from '../domain/money';
import { money } from '../domain/money';
import type { Hand } from '../domain/hand';
import type { RuleSet } from './config';
import { isBlackjack, scoreHand } from './scoring';

export type HandOutcomeKind =
  | 'blackjack'
  | 'win'
  | 'lose'
  | 'push'
  | 'bust';

export interface HandSettlement {
  kind: HandOutcomeKind;
  /** Net change to player wallet for this hand (can be negative). */
  payout: MoneyCents;
}

function blackjackMultiplier(rules: RuleSet): number {
  switch (rules.blackjackPayout) {
    case '3:2':
      return 1.5;
    case '6:5':
      return 1.2;
    case '1:1':
      return 1;
    default:
      return 1.5;
  }
}

/**
 * Settle one player hand vs dealer after all play is complete.
 * `bet` is the wager for this hand in cents.
 */
export function settleHand(
  player: Hand,
  dealer: Hand,
  bet: MoneyCents,
  rules: RuleSet,
): HandSettlement {
  const playerBust = scoreHand(player.cards).bust;
  const dealerBust = scoreHand(dealer.cards).bust;
  const pBj = isBlackjack(player.cards);
  const dBj = isBlackjack(dealer.cards);

  if (pBj && dBj) {
    return { kind: 'push', payout: money(0) };
  }
  if (pBj && !dBj) {
    const win = Math.round(bet * blackjackMultiplier(rules));
    return { kind: 'blackjack', payout: money(win) };
  }
  if (!pBj && dBj) {
    return { kind: 'lose', payout: (-bet) as MoneyCents };
  }

  if (playerBust) {
    return { kind: 'bust', payout: (-bet) as MoneyCents };
  }
  if (dealerBust) {
    return { kind: 'win', payout: money(bet) };
  }

  const pt = scoreHand(player.cards).total;
  const dt = scoreHand(dealer.cards).total;

  if (pt > dt) return { kind: 'win', payout: money(bet) };
  if (pt < dt) return { kind: 'lose', payout: (-bet) as MoneyCents };
  return { kind: 'push', payout: money(0) };
}
