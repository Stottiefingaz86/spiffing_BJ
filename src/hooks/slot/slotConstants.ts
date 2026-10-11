export const BET_OPTIONS = [
  0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 150,
] as const

export type SpeedLevel = 0 | 1 | 2

export const SPIN_DURATIONS: Record<SpeedLevel, number> = {
  0: 1200,
  1: 800,
  2: 500,
}

export const AUTO_DELAYS: Record<SpeedLevel, number> = {
  0: 700,
  1: 450,
  2: 300,
}

/** Buy bonus costs this many times the current bet. */
export const BUY_BONUS_MULTIPLIER = 100
