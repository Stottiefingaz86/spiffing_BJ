/**
 * Operator-configurable blackjack rules.
 * V1 uses a conservative subset; flags exist for future toggles.
 */

export type DealerHoleRule = 'stand_soft_17' | 'hit_soft_17';

export type BlackjackPayout = '3:2' | '6:5' | '1:1';

/** Which initial two-card totals allow doubling down. */
export type DoubleOnRule = '9_10_11' | '10_11' | 'any';

export interface RuleSet {
  dealerHoleRule: DealerHoleRule;
  blackjackPayout: BlackjackPayout;
  /** Feature flags reserved for later versions (must not affect V1 paths if false). */
  insuranceEnabled: boolean;
  doubleEnabled: boolean;
  doubleOn: DoubleOnRule;
  splitEnabled: boolean;
  surrenderEnabled: boolean;
}

export const DEFAULT_RULE_SET_V1: RuleSet = {
  dealerHoleRule: 'hit_soft_17',
  blackjackPayout: '3:2',
  insuranceEnabled: true,
  doubleEnabled: true,
  doubleOn: '9_10_11',
  splitEnabled: false,
  surrenderEnabled: false,
};
