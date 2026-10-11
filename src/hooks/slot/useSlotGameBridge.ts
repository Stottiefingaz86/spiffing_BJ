import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTO_DELAYS, type SpeedLevel } from '@/hooks/slot/slotConstants';
import { setSlotSpeedLevel } from '@/hooks/slot/slotSpeed';
import type { ThemeChrome } from '@/contexts/ThemeChromeContext';

/** Animation duration scale by speed level (1 = normal, lower = faster). */
export const SPEED_DURATION_SCALE: Record<SpeedLevel, number> = {
  0: 1,
  1: 0.72,
  2: 0.48,
};

export interface SlotGameBridgeInput {
  /** Balance in cents */
  balanceCents: number;
  /** Current bet in cents */
  betCents: number;
  /** Bet ladder in cents */
  betOptionsCents: readonly number[];
  /** True while reels/cascades/features are running */
  isBusy: boolean;
  canSpin: boolean;
  canBuyBonus?: boolean;
  /** Buy-bonus cost in cents; omit or 0 to hide */
  buyBonusCostCents?: number;
  showBuyBonus?: boolean;
  gameTitle: string;
  themeChrome?: ThemeChrome;
  soundEnabled: boolean;
  musicEnabled: boolean;
  onSpin: () => void;
  onSetBetCents: (cents: number) => void;
  onBuyBonus?: () => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
}

export function useSlotGameBridge(input: SlotGameBridgeInput) {
  const {
    balanceCents,
    betCents,
    betOptionsCents,
    isBusy,
    canSpin,
    canBuyBonus = false,
    buyBonusCostCents = 0,
    showBuyBonus = false,
    gameTitle,
    themeChrome = 'dark',
    soundEnabled,
    musicEnabled,
    onSpin,
    onSetBetCents,
    onBuyBonus,
    onToggleSound,
    onToggleMusic,
  } = input;

  const [speedLevel, setSpeedLevel] = useState<SpeedLevel>(0);
  const [betPickerOpen, setBetPickerOpen] = useState(false);
  const [autoPlayOpen, setAutoPlayOpen] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoSpinsRemaining, setAutoSpinsRemaining] = useState(0);

  const wasBusyRef = useRef(false);
  const onSpinRef = useRef(onSpin);
  onSpinRef.current = onSpin;

  const balance = balanceCents / 100;
  const bet = betCents / 100;
  const betOptions = betOptionsCents.map((c) => c / 100);
  const buyBonusCost = buyBonusCostCents / 100;

  const openBetPicker = useCallback(() => {
    if (isAutoPlaying || isBusy) return;
    setBetPickerOpen(true);
  }, [isAutoPlaying, isBusy]);

  const closeBetPicker = useCallback(() => setBetPickerOpen(false), []);

  const selectBet = useCallback(
    (amountDollars: number) => {
      const cents = Math.round(amountDollars * 100);
      onSetBetCents(cents);
      // Keep picker open so the player can preview / change before confirming
    },
    [onSetBetCents],
  );

  const cycleSpeed = useCallback(() => {
    setSpeedLevel((prev) => {
      const next = ((prev + 1) % 3) as SpeedLevel;
      setSlotSpeedLevel(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setSlotSpeedLevel(speedLevel);
  }, [speedLevel]);

  const openAutoPlay = useCallback(() => {
    if (isAutoPlaying || isBusy) return;
    setAutoPlayOpen(true);
  }, [isAutoPlaying, isBusy]);

  const closeAutoPlay = useCallback(() => setAutoPlayOpen(false), []);

  const startAutoPlay = useCallback(
    (spins: number, spinCostDollars: number) => {
      const cents = Math.round(spinCostDollars * 100);
      onSetBetCents(cents);
      setAutoSpinsRemaining(spins);
      setIsAutoPlaying(true);
      setAutoPlayOpen(false);
    },
    [onSetBetCents],
  );

  const stopAutoPlay = useCallback(() => {
    setIsAutoPlaying(false);
    setAutoSpinsRemaining(0);
  }, []);

  const handleSpin = useCallback(() => {
    if (!canSpin || isBusy || isAutoPlaying) return;
    onSpinRef.current();
  }, [canSpin, isBusy, isAutoPlaying]);

  const handleBuyBonus = useCallback(() => {
    if (!showBuyBonus || !onBuyBonus || !canBuyBonus || isBusy || isAutoPlaying) return;
    onBuyBonus();
  }, [showBuyBonus, onBuyBonus, canBuyBonus, isBusy, isAutoPlaying]);

  // After a busy→idle transition while autoplaying, consume one spin credit
  useEffect(() => {
    if (wasBusyRef.current && !isBusy && isAutoPlaying) {
      setAutoSpinsRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) setIsAutoPlaying(false);
        return Math.max(0, next);
      });
    }
    wasBusyRef.current = isBusy;
  }, [isBusy, isAutoPlaying]);

  // Kick next autoplay spin when idle
  useEffect(() => {
    if (!isAutoPlaying || isBusy) return;
    if (autoSpinsRemaining <= 0) {
      setIsAutoPlaying(false);
      return;
    }
    if (balanceCents < betCents) {
      setIsAutoPlaying(false);
      setAutoSpinsRemaining(0);
      return;
    }
    if (!canSpin) return;

    const id = window.setTimeout(() => {
      onSpinRef.current();
    }, AUTO_DELAYS[speedLevel]);

    return () => window.clearTimeout(id);
  }, [
    isAutoPlaying,
    isBusy,
    autoSpinsRemaining,
    balanceCents,
    betCents,
    canSpin,
    speedLevel,
  ]);

  return {
    overlayProps: {
      themeChrome,
      gameTitle,
      showBuyBonus,
      balance,
      bet,
      isSpinning: isBusy,
      isAutoPlaying,
      autoSpinsRemaining,
      autoPlayOpen,
      betPickerOpen,
      betOptions,
      speedLevel,
      soundEnabled,
      musicEnabled,
      canSpin: canSpin && !isBusy,
      canBuyBonus: showBuyBonus && canBuyBonus && !isBusy && !isAutoPlaying,
      buyBonusCost,
      onOpenBetPicker: openBetPicker,
      onBuyBonus: handleBuyBonus,
      onCloseBetPicker: closeBetPicker,
      onSelectBet: selectBet,
      onCycleSpeed: cycleSpeed,
      onToggleSound,
      onToggleMusic,
      onSpin: handleSpin,
      onOpenAutoPlay: openAutoPlay,
      onCloseAutoPlay: closeAutoPlay,
      onStartAutoPlay: startAutoPlay,
      onStopAutoPlay: stopAutoPlay,
    },
    speedLevel,
    speedScale: SPEED_DURATION_SCALE[speedLevel],
    isAutoPlaying,
    stopAutoPlay,
  };
}
