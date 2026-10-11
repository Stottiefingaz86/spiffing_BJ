import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { publicAssetUrl } from '@/lib/publicUrl';
import { formatMoney } from '@/lib/formatMoney';
import { GamePreloader } from '@/components/GamePreloader';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';

import { BanditSession, GamePhase, BUY_BONUS_COST, type FreeSpinMode } from '../engine/session';
import { ReelCanvas, type FrameRect } from '../render/ReelCanvas';
import { FreeSpinChoiceOverlay, GambleRevealOverlay } from './GambleOverlay';
import {
  unlockBanditAudio,
  setBanditSfxMuted,
  setBanditBgmMuted,
  startBanditBgm,
  stopBanditBgm,
  playBandit,
  preloadBanditSfx,
} from '../audio/banditSfx';

const PRELOAD_ASSETS = [
  'bandits/bg2.png',
  'bandits/frame.png',
  'bandits/mask.png',
  'bandits/logo.png',
  'bandits/cowboy.png',
  'bandits/WILD.png',
  'bandits/scatter.png',
  'bandits/J.png',
  'bandits/q.png',
  'bandits/k.png',
  'bandits/a.png',
  'bandits/SKULL_SYMBOL.png',
  'bandits/FLASH.png',
  'bandits/DYNAMITE.png',
  'bandits/goldbag.png',
  'bandits/bullion.png',
  'bandits/sounds/spin.mp3',
  'bandits/sounds/reel stop.mp3',
  'bandits/sounds/scatter.mp3',
  'bandits/sounds/scatter_maybe.mp3',
  'bandits/sounds/WIN_LINE.mp3',
].map((p) => publicAssetUrl(p));

function handlePreloaderPlay() {
  unlockBanditAudio();
  preloadBanditSfx();
  startBanditBgm(0.15);
}

export default function BanditClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handlePreloaderPlay}>
      <BanditGame />
    </GamePreloader>
  );
}

function BanditGame() {
  const sessionRef = useRef<BanditSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new BanditSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);
  const [displayedWin, setDisplayedWin] = useState(0);
  const [frameRect, setFrameRect] = useState<FrameRect | null>(null);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  // Audio is activated by the preloader's onPlay callback.
  // This ensures BGM resumes if it was stopped, and cleans up on unmount.
  useEffect(() => {
    return () => { stopBanditBgm(); };
  }, []);

  useEffect(() => {
    setBanditSfxMuted(!soundOn);
    setBanditBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    // Allow spinning from ShowWins to skip win display
    if (snap.phase === GamePhase.ShowWins) {
      session.dismissWins();
    }
    const s = session.getSnapshot();
    if (s.phase !== GamePhase.Idle || s.balance < s.bet) return;
    unlockBanditAudio();
    preloadBanditSfx();
    startBanditBgm(0.15);
    playBandit('spin', 0.25);
    setDisplayedWin(0);
    targetWinRef.current = 0;
    lastSpinWinRef.current = 0;
    session.spin();
    refresh();
  }, [session, refresh, snap.phase, snap.balance, snap.bet]);

  const onSpinComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.Spinning) {
      session.spinComplete();
    } else if (s.phase === GamePhase.FreeSpinning) {
      session.freeSpinReelsComplete();
    }
    refresh();
  }, [session, refresh]);

  const onWildFeatureComplete = useCallback(() => {
    session.wildFeatureComplete();
    refresh();
  }, [session, refresh]);

  const onEvaluate = useCallback(() => {
    session.evaluate();
    refresh();
  }, [session, refresh]);

  const onPaylineDone = useCallback(() => {
    session.nextPayline();
    refresh();
  }, [session, refresh]);

  const onChooseMode = useCallback((mode: FreeSpinMode) => {
    session.chooseFreeSpinMode(mode);
    refresh();
  }, [session, refresh]);

  const onAcknowledgeGamble = useCallback(() => {
    session.acknowledgeGambleReveal();
    refresh();
  }, [session, refresh]);

  useEffect(() => {
    if (snap.phase !== GamePhase.FreeSpinIntro) return;
    const timer = window.setTimeout(() => {
      session.acknowledgeFreeSpinIntro();
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        unlockBanditAudio();
        preloadBanditSfx();
        startBanditBgm(0.15);
        if (snap.phase === GamePhase.FreeSpinOutro) {
          session.dismissFreeSpins();
          refresh();
        } else {
          onSpin();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSpin, snap.phase, session, refresh]);

  useEffect(() => {
    if (snap.phase === GamePhase.Idle) return;
    const timer = window.setTimeout(() => {
      session.forceIdle();
      refresh();
    }, 20000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  const isFreeSpinActive = snap.inFreeSpins;
  const isSpinning = snap.phase !== GamePhase.Idle && snap.phase !== GamePhase.FreeSpinOutro && snap.phase !== GamePhase.FreeSpinChoice;

  let targetWin: number;
  if (isFreeSpinActive) {
    targetWin = snap.freeSpinsTotalWin;
  } else if (snap.phase === GamePhase.ShowWins) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else if (snap.phase === GamePhase.Idle) {
    targetWin = lastSpinWinRef.current;
  } else {
    targetWin = 0;
  }

  useEffect(() => {
    targetWinRef.current = targetWin;
  }, [targetWin]);

  useEffect(() => {
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      setDisplayedWin((prev) => {
        const target = targetWinRef.current;
        if (target === 0 && prev === 0) return 0;
        if (prev >= target) return target;
        const speed = Math.max(1, (target - prev) / 400) * dt;
        return Math.min(target, prev + speed);
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const canSpin = (snap.phase === GamePhase.Idle || snap.phase === GamePhase.ShowWins) && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);
  const isBusy = isSpinning;

  const bridge = useSlotGameBridge({
    balanceCents: snap.balance,
    betCents: snap.bet,
    betOptionsCents: session.betOptions,
    isBusy,
    canSpin,
    showBuyBonus: true,
    buyBonusCostCents: BUY_BONUS_COST,
    canBuyBonus: snap.phase === GamePhase.Idle && snap.balance >= BUY_BONUS_COST && !snap.inFreeSpins,
    onBuyBonus: () => {
      session.buyBonus();
      refresh();
    },
    gameTitle: 'Breaking Bandits',
    soundEnabled: soundOn,
    musicEnabled: soundOn,
    onSpin,
    onSetBetCents: (cents) => {
      session.setBet(cents);
      refresh();
    },
    onToggleSound: () => setSoundOn((v) => !v),
    onToggleMusic: () => setSoundOn((v) => !v),
  });

  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinChoice = snap.phase === GamePhase.FreeSpinChoice;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;
  const isGambleReveal = snap.phase === GamePhase.GambleReveal;

  return (
    <SlotGameShell
      {...bridge.overlayProps}
      className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-black text-white"
    >
      <div className="relative flex h-full min-h-0 w-full flex-col">
      <div className="slot-bg">
        <img
          src={publicAssetUrl('bandits/bg2.png')}
          alt=""
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            isFreeSpinActive ? 'brightness-[0.6]' : 'brightness-[0.75]',
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
      </div>

      {/* Game canvas */}
      <div className="slot-stage" onClick={(e) => e.stopPropagation()}>
        {/* Logo — always attached to top of frame */}
        <img
          src={publicAssetUrl('bandits/logo.png')}
          alt="Breaking Bandits"
          className="pointer-events-none absolute left-1/2 z-40 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
          style={frameRect ? (() => {
            const isMobile = window.innerWidth < 1024;
            const logoH = isMobile
              ? Math.max(100, frameRect.w * 0.65)
              : Math.max(80, frameRect.w * 0.3);
            const overlap = isMobile ? 0.5 : 0.35;
            const top = Math.max(0, frameRect.y - logoH * overlap);
            return {
              top: `${top}px`,
              height: `${logoH}px`,
              transform: 'translateX(-50%)',
            };
          })() : {
            top: 0,
            height: '4rem',
            transform: 'translateX(-50%) translateY(5%)',
          }}
        />
        {/* Cowboy character — bottom-left, feet off screen */}
        <img
          src={publicAssetUrl('bandits/cowboy.png')}
          alt=""
          className="pointer-events-none absolute -bottom-36 -left-14 z-30 h-[55%] w-auto object-contain brightness-[0.8] sepia-[0.25] saturate-[1.2] drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] lg:-bottom-12 lg:left-[calc(2%-30px)] lg:h-[55%] xl:left-[calc(10%-50px)] xl:h-[65%] 2xl:left-[calc(16%-50px)] 2xl:h-[75%]"
        />

        <ReelCanvas
          snapshot={snap}
          onSpinComplete={onSpinComplete}
          onWildFeatureComplete={onWildFeatureComplete}
          onEvaluate={onEvaluate}
          onPaylineDone={onPaylineDone}
          onFrameLayout={setFrameRect}
          className="h-full w-full"
        />

        {/* Free Spin Intro */}
        {isFreeSpinIntro && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
            <div className="animate-bounce rounded-2xl bg-black/70 px-10 py-6 backdrop-blur-sm">
              <p className="text-center text-3xl font-black tracking-tight text-amber-400 sm:text-4xl">
                FREE SPINS
              </p>
              <p className="mt-1 text-center text-5xl font-black text-white sm:text-6xl">
                &times;{snap.freeSpinsTotal}
              </p>
            </div>
          </div>
        )}

        <FreeSpinChoiceOverlay
          visible={isFreeSpinChoice}
          freeSpinsTotal={snap.freeSpinsTotal}
          onChoose={onChooseMode}
        />

        <GambleRevealOverlay
          visible={isGambleReveal}
          result={snap.gambleThumbResult}
          pot={snap.gamblePot}
          onAcknowledge={onAcknowledgeGamble}
        />

        {/* Free Spin Outro */}
        {isFreeSpinOutro && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            onClick={() => { session.dismissFreeSpins(); refresh(); }}
          >
            <div className="rounded-2xl bg-black/75 px-10 py-8 backdrop-blur-sm">
              <p className="text-center text-2xl font-black tracking-tight text-amber-400 sm:text-3xl">
                FREE SPINS COMPLETE
              </p>
              <p className="mt-2 text-center text-4xl font-black text-emerald-400 sm:text-5xl">
                {formatMoney(snap.freeSpinsTotalWin)}
              </p>
              {snap.freeSpinMode === 'gamble' && snap.gamblePot > 0 && (
                <p className="mt-1 text-center text-lg text-amber-400/70">
                  Pot: {formatMoney(snap.gamblePot)}
                </p>
              )}
              <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
            </div>
          </div>
        )}

        {/* Free Spin Counter */}
        {isFreeSpinActive && !isFreeSpinIntro && !isFreeSpinOutro && !isFreeSpinChoice && !isGambleReveal && (
          <div className="slot-win-chip">
            <div className="flex items-center gap-3 rounded-full bg-amber-600/90 px-4 py-1 shadow-lg shadow-amber-600/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE SPINS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
              {snap.freeSpinMode === 'gamble' && (
                <span className="text-xs font-bold tabular-nums text-yellow-100">
                  Pot: {formatMoney(snap.gamblePot)}
                </span>
              )}
            </div>
          </div>
        )}

        {showWin > 0 && (
          <div className="slot-win-chip">
            <div className="rounded-full bg-black/55 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-sm font-bold tabular-nums text-emerald-400">{formatMoney(showWin)}</span>
            </div>
          </div>
        )}
      </div>
      </div>
    </SlotGameShell>
  );
}
