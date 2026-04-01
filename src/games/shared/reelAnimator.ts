/**
 * Shared 5-reel strip physics (Breaking Bandits + Aztec). Kept in `games/shared` so Aztec
 * does not import from the Bandits bundle path (cleaner prod chunks).
 */
const REELS = 5;

export interface ReelAnimState {
  cellOffset: number;
  totalCells: number;
  speed: number;
  spinning: boolean;
  stopped: boolean;
  bounceY: number;
  prepareLanding: boolean;
  isLanding: boolean;
}

export interface ReelAnimator {
  states: ReelAnimState[];
  startSpin(): void;
  stopReel(reelIndex: number): void;
  confirmLanding(reelIndex: number): void;
  boostReel(reelIndex: number): void;
  tick(deltaMs: number): void;
  allStopped(): boolean;
}

type Phase = 'idle' | 'accelerating' | 'fullSpeed' | 'decelerating' | 'waitingForSnap' | 'scrollingIn' | 'bouncing' | 'stopped';

interface InternalReel {
  phase: Phase;
  speed: number;
  cellOffset: number;
  totalCells: number;
  accelTimer: number;
  bounceTime: number;
  bounceY: number;
  scrollInStart: number;
  scrollInStartTotal: number;
  scrollInDecel: number;
  scrollInElapsed: number;
}

const MAX_SPEED = 0.52;
const ACCEL_DURATION = 180;
export const BANDITS_REEL_STOP_STAGGER_MS = 180;
export const BANDITS_REEL_STOP_BASE_DELAY_MS = 350;
const DECEL_RATE = 0.014;
const LANDING_TRIGGER_SPEED = 0.2;
const MIN_SPIN_CELLS = 6;
const LANDING_CELLS = 4;
const SCROLL_IN_MAX_MS = 1200;
const BOUNCE_DURATION = 250;
const BOUNCE_AMPLITUDE = 6;

export function createReelAnimator(): ReelAnimator {
  const internals: InternalReel[] = [];
  const states: ReelAnimState[] = [];

  for (let r = 0; r < REELS; r++) {
    internals.push({
      phase: 'idle',
      speed: 0,
      cellOffset: 0,
      totalCells: 0,
      accelTimer: 0,
      bounceTime: 0,
      bounceY: 0,
      scrollInStart: 0,
      scrollInStartTotal: 0,
      scrollInDecel: 0,
      scrollInElapsed: 0,
    });
    states.push({
      cellOffset: 0,
      totalCells: 0,
      speed: 0,
      spinning: false,
      stopped: true,
      bounceY: 0,
      prepareLanding: false,
      isLanding: false,
    });
  }

  function startSpin(): void {
    for (let r = 0; r < REELS; r++) {
      const s = internals[r];
      s.phase = 'accelerating';
      s.speed = 0.02;
      s.cellOffset = 0;
      s.totalCells = 0;
      s.accelTimer = 0;
      s.bounceTime = 0;
      s.bounceY = 0;
      s.scrollInStart = 0;
      s.scrollInStartTotal = 0;
      s.scrollInDecel = 0;
      s.scrollInElapsed = 0;
    }
  }

  function stopReel(reelIndex: number): void {
    if (reelIndex < 0 || reelIndex >= REELS) return;
    const s = internals[reelIndex];
    if (s.phase === 'accelerating' || s.phase === 'fullSpeed') {
      s.phase = 'decelerating';
    }
  }

  function boostReel(reelIndex: number): void {
    if (reelIndex < 0 || reelIndex >= REELS) return;
    const s = internals[reelIndex];
    if (s.phase === 'decelerating') {
      s.phase = 'fullSpeed';
      s.speed = MAX_SPEED * 1.3;
    } else if (s.phase === 'fullSpeed' || s.phase === 'accelerating') {
      s.speed = Math.min(s.speed + 0.15, MAX_SPEED * 1.4);
    }
  }

  function confirmLanding(reelIndex: number): void {
    if (reelIndex < 0 || reelIndex >= REELS) return;
    const s = internals[reelIndex];
    if (s.phase !== 'waitingForSnap') return;
    s.phase = 'scrollingIn';
    s.scrollInStart = s.cellOffset;
    s.scrollInStartTotal = s.totalCells;
    s.scrollInElapsed = 0;
    const distance = LANDING_CELLS - s.cellOffset;
    const v0 = Math.max(s.speed, 0.03);
    s.scrollInDecel = (v0 * v0) / (2 * distance);
  }

  function tick(deltaMs: number): void {
    const dt = deltaMs / 16.67;

    for (let r = 0; r < REELS; r++) {
      const s = internals[r];
      const st = states[r];

      switch (s.phase) {
        case 'idle':
        case 'stopped':
          st.spinning = false;
          st.stopped = true;
          st.cellOffset = 0;
          st.speed = 0;
          st.bounceY = 0;
          st.prepareLanding = false;
          st.isLanding = false;
          break;

        case 'accelerating': {
          s.accelTimer += deltaMs;
          const t = Math.min(s.accelTimer / ACCEL_DURATION, 1);
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          s.speed = 0.02 + (MAX_SPEED - 0.02) * ease;

          s.cellOffset += s.speed * dt;
          while (s.cellOffset >= 1) {
            s.cellOffset -= 1;
            s.totalCells++;
          }

          if (t >= 1) s.phase = 'fullSpeed';

          st.spinning = true;
          st.stopped = false;
          st.cellOffset = s.cellOffset;
          st.totalCells = s.totalCells;
          st.speed = s.speed;
          st.bounceY = 0;
          st.prepareLanding = false;
          st.isLanding = false;
          break;
        }

        case 'fullSpeed': {
          s.cellOffset += s.speed * dt;
          while (s.cellOffset >= 1) {
            s.cellOffset -= 1;
            s.totalCells++;
          }

          st.spinning = true;
          st.stopped = false;
          st.cellOffset = s.cellOffset;
          st.totalCells = s.totalCells;
          st.speed = s.speed;
          st.bounceY = 0;
          st.prepareLanding = false;
          st.isLanding = false;
          break;
        }

        case 'decelerating': {
          s.speed = Math.max(0.03, s.speed - DECEL_RATE * dt);

          s.cellOffset += s.speed * dt;
          while (s.cellOffset >= 1) {
            s.cellOffset -= 1;
            s.totalCells++;
          }

          const readyToLand = s.speed <= LANDING_TRIGGER_SPEED && s.totalCells >= MIN_SPIN_CELLS;

          st.spinning = true;
          st.stopped = false;
          st.cellOffset = s.cellOffset;
          st.totalCells = s.totalCells;
          st.speed = s.speed;
          st.bounceY = 0;
          st.prepareLanding = readyToLand;
          st.isLanding = false;

          if (readyToLand) {
            s.phase = 'waitingForSnap';
          }
          break;
        }

        case 'waitingForSnap': {
          s.speed = Math.max(0.03, s.speed - DECEL_RATE * 0.5 * dt);
          s.cellOffset += s.speed * dt;
          while (s.cellOffset >= 1) {
            s.cellOffset -= 1;
            s.totalCells++;
          }

          st.spinning = true;
          st.stopped = false;
          st.cellOffset = s.cellOffset;
          st.totalCells = s.totalCells;
          st.speed = s.speed;
          st.bounceY = 0;
          st.prepareLanding = true;
          st.isLanding = false;
          break;
        }

        case 'scrollingIn': {
          s.scrollInElapsed += deltaMs;
          const totalDist = LANDING_CELLS - s.scrollInStart;
          const covered =
            (s.totalCells - s.scrollInStartTotal) + (s.cellOffset - s.scrollInStart);
          const remaining = totalDist - covered;

          if (remaining > 0.01 && s.scrollInElapsed < SCROLL_IN_MAX_MS) {
            s.speed = Math.max(0.008, Math.sqrt(2 * s.scrollInDecel * Math.max(0, remaining)));

            s.cellOffset += s.speed * dt;
            while (s.cellOffset >= 1) {
              s.cellOffset -= 1;
              s.totalCells++;
            }

            st.spinning = true;
            st.stopped = false;
            st.cellOffset = s.cellOffset;
            st.totalCells = s.totalCells;
            st.speed = s.speed;
            st.bounceY = 0;
            st.prepareLanding = false;
            st.isLanding = true;
          } else {
            s.cellOffset = 0;
            s.totalCells = s.scrollInStartTotal + LANDING_CELLS;
            s.speed = 0;
            s.phase = 'bouncing';
            s.bounceTime = 0;
            s.bounceY = 0;

            st.spinning = true;
            st.stopped = false;
            st.cellOffset = 0;
            st.totalCells = s.totalCells;
            st.speed = 0;
            st.bounceY = 0;
            st.prepareLanding = false;
            st.isLanding = true;
          }
          break;
        }

        case 'bouncing': {
          s.bounceTime += deltaMs;
          const bt = Math.min(s.bounceTime / BOUNCE_DURATION, 1);
          const decay = Math.pow(1 - bt, 2);
          s.bounceY = Math.sin(bt * Math.PI * 3) * BOUNCE_AMPLITUDE * decay;

          if (bt >= 1) {
            s.bounceY = 0;
            s.phase = 'stopped';
          }

          st.spinning = false;
          st.stopped = s.phase === 'stopped';
          st.cellOffset = 0;
          st.totalCells = s.totalCells;
          st.speed = 0;
          st.bounceY = s.bounceY;
          st.prepareLanding = false;
          st.isLanding = false;
          break;
        }
      }
    }
  }

  function allStopped(): boolean {
    return internals.every((s) => s.phase === 'stopped' || s.phase === 'idle');
  }

  return { states, startSpin, stopReel, boostReel, confirmLanding, tick, allStopped };
}
