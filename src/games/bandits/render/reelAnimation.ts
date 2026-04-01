/** Re-export shared animator so Bandits imports stay stable. */
export {
  BANDITS_REEL_STOP_BASE_DELAY_MS,
  BANDITS_REEL_STOP_STAGGER_MS,
  createReelAnimator,
  type ReelAnimState,
  type ReelAnimator,
} from '../../shared/reelAnimator';
