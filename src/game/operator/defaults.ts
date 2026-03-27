import { money } from '../domain/money';
import { DEFAULT_RULE_SET_V1 } from '../rules/config';
import type { OperatorConfig } from './config';

export const DEFAULT_OPERATOR_CONFIG: OperatorConfig = {
  operatorId: 'local-dev',
  tableId: 'mh-blackjack-1',
  currencyCode: 'USD',
  tableLimits: {
    minBet: money(100),
    maxBet: money(1_000_000),
  },
  rules: DEFAULT_RULE_SET_V1,
  deckCount: 8,
  penetrationReserve: 52,
  theme: {
    feltBackground: '#2d2451',
    feltAccent: '#4c3d78',
    uiGreen: '#4ade80',
    uiPink: '#f472b6',
    uiDanger: '#f87171',
    chipPalette: ['#9ca3af', '#22c55e', '#eab308', '#a855f7', '#f43f5e'],
  },
  branding: {
    loadingBadgeText: '96%',
  },
  enabledActions: {
    hit: true,
    stand: true,
    double: true,
    split: false,
    surrender: false,
    insurance: true,
  },
  copy: {
    gameTitle: 'MULTI-HAND BLACKJACK',
    gameSubtitle: 'WITH 21+3 & PERFECT PAIRS SIDE BET',
    balanceLabel: 'BALANCE',
    deal: 'DEAL',
    hit: 'HIT',
    stand: 'STAND',
    double: 'DOUBLE',
    clear: 'CLEAR',
    undo: 'UNDO',
    rebet: 'REBET',
  },
  sideBets: {
    perfectPairs: false,
    twentyOnePlusThree: false,
  },
  defaultSoundOn: true,
  defaultLanguage: 'en',
};
