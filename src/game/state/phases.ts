/**
 * Top-level session phases. Renderer and shell subscribe to this enum only,
 * not to internal sub-transitions unless exposed deliberately.
 */
export enum GamePhase {
  Loading = 'loading',
  Ready = 'ready',
  Betting = 'betting',
  Dealing = 'dealing',
  InsuranceOffer = 'insurance_offer',
  PlayerTurn = 'player_turn',
  HandTransition = 'hand_transition',
  DealerTurn = 'dealer_turn',
  Settlement = 'settlement',
  RoundComplete = 'round_complete',
  Reshuffling = 'reshuffling',
  Error = 'error',
}
