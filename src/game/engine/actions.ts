import type { GamePhase } from '../state/phases';
import type { HandIndex } from '../state/table-state';

export type GameAction =
  | { type: 'ENTER_PHASE'; phase: GamePhase }
  | { type: 'PLACE_BET'; seat: HandIndex; chipValue: number }
  | { type: 'CLEAR_BET'; seat: HandIndex }
  | { type: 'CLEAR_ALL_BETS' }
  | { type: 'UNDO_LAST_BET' }
  | { type: 'DEAL' }
  | { type: 'DEAL_NEXT_CARD' }
  | { type: 'TAKE_INSURANCE' }
  | { type: 'DECLINE_INSURANCE' }
  | { type: 'HIT' }
  | { type: 'STAND' }
  | { type: 'DOUBLE' }
  | { type: 'COMPLETE_HAND_TRANSITION' }
  | { type: 'DEALER_PLAY_STEP' }
  | { type: 'SETTLE_NEXT_HAND' }
  | { type: 'ACK_ROUND_COMPLETE' }
  | { type: 'REBET_LAST' };
