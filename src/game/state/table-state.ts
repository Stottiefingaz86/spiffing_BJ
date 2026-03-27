import type { Hand } from '../domain/hand';
import type { MoneyCents } from '../domain/money';
import type { HandSettlement } from '../rules/settlement';
import type { GamePhase } from './phases';

export const HAND_COUNT = 5 as const;

export type HandIndex = 0 | 1 | 2 | 3 | 4;

export type PlayerHandStatus =
  | 'idle'
  | 'betting'
  | 'active'
  | 'stood'
  | 'bust'
  | 'settled';

export interface PlayerSeatState {
  index: HandIndex;
  /** Included in current round (has a bet). */
  inRound: boolean;
  bet: MoneyCents;
  /** Insurance wager (half of main bet); 0 if not insured. */
  insuranceBet: MoneyCents;
  hand: Hand;
  status: PlayerHandStatus;
  settlement?: HandSettlement;
}

export interface DealerState {
  hand: Hand;
}

/**
 * Immutable-friendly snapshot consumed by Pixi and React shell.
 * The live `GameSession` may hold additional non-serialized refs (e.g. shoe).
 */
export interface TableSnapshot {
  phase: GamePhase;
  balance: MoneyCents;
  dealer: DealerState;
  seats: PlayerSeatState[];
  /** Index of seat receiving player actions; null during betting / dealer / settlement. */
  activeSeatIndex: HandIndex | null;
  /**
   * Seat whose turn just ended; used only in {@link GamePhase.HandTransition} so layout
   * stays on that hand until the client completes the pause and advances play.
   */
  handTransitionFrom: HandIndex | null;
  /**
   * After the last player action, keep this seat's cards in hero layout through dealer /
   * settlement / round complete (so the hand does not snap to the small rail).
   */
  heroSeatIndex: HandIndex | null;
  /** During Settlement: seat currently being revealed with its result. */
  settlementRevealIndex: HandIndex | null;
  /** Monotonic; bump when state advances for render diffing. */
  revision: number;
  lastError?: string;
}
