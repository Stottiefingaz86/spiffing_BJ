import type { RuleSet } from '../rules/config';
import type { MoneyCents } from '../domain/money';

/** Visual tokens for theming the Pixi table + CSS shell. */
export interface TableTheme {
  feltBackground: string;
  feltAccent: string;
  uiGreen: string;
  uiPink: string;
  uiDanger: string;
  chipPalette: string[];
}

export interface BrandingAssets {
  studioLogoUrl?: string;
  cardBackUrl?: string;
  /** Optional RTP or loading label; operator-controlled copy. */
  loadingBadgeText?: string;
}

export interface TableLimits {
  minBet: MoneyCents;
  maxBet: MoneyCents;
}

export interface EnabledActions {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
  surrender: boolean;
  insurance: boolean;
}

export interface CopyPack {
  gameTitle: string;
  gameSubtitle: string;
  balanceLabel: string;
  deal: string;
  hit: string;
  stand: string;
  double: string;
  clear: string;
  undo: string;
  rebet: string;
}

/** Side-bet toggles for future versions (no logic in V1). */
export interface SideBetConfig {
  perfectPairs: boolean;
  twentyOnePlusThree: boolean;
}

/**
 * Operator-facing configuration: rules, limits, branding, and feature flags.
 * Loaded at runtime in production; defaults suit local development.
 */
export interface OperatorConfig {
  operatorId: string;
  tableId: string;
  currencyCode: string;
  tableLimits: TableLimits;
  rules: RuleSet;
  deckCount: number;
  /** Cards remaining before reshuffle trigger. */
  penetrationReserve: number;
  theme: TableTheme;
  branding: BrandingAssets;
  enabledActions: EnabledActions;
  copy: CopyPack;
  sideBets: SideBetConfig;
  defaultSoundOn: boolean;
  defaultLanguage: string;
}
