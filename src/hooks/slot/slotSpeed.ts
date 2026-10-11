import type { SpeedLevel } from '@/hooks/slot/slotConstants';

/** How fast slot animations run (1 = normal, higher = faster). */
const SPEED_TIME_SCALE: Record<SpeedLevel, number> = {
  0: 1,
  1: 1.45,
  2: 2.1,
};

let timeScale = 1;

export function setSlotSpeedLevel(level: SpeedLevel): void {
  timeScale = SPEED_TIME_SCALE[level] ?? 1;
}

export function getSlotSpeedTimeScale(): number {
  return timeScale;
}

/** Scale ticker delta so reels / cascades finish faster at higher turbo levels. */
export function scaleSlotDelta(deltaMs: number): number {
  return deltaMs * timeScale;
}

/** Scale wall-clock delays (reel stop stagger, etc.). */
export function scaleSlotDelay(ms: number): number {
  return Math.max(16, Math.round(ms / timeScale));
}
