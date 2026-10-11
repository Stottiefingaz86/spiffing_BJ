import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { publicAssetUrl } from '@/lib/publicUrl';
import { formatMoney } from '@/lib/formatMoney';
import { GamePreloader } from '@/components/GamePreloader';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';

import { HotFiestaSession, GamePhase, BUY_BONUS_COST } from '../engine/session';
import { HotFiestaCanvas } from '../render/HotFiestaCanvas';
import { preloadHFSfx, playHF, setHFSfxMuted, setHFBgmMuted, startHFBgm, stopHFBgm, unlockHFAudio, preloadHFBgm } from '../audio/hotfiestaSfx';

const PRELOAD_ASSETS = [
  'hotfiesta/bg.png',
  'hotfiesta/logo.png',
  'hotfiesta/hat.png',
  'hotfiesta/taco.png',
  'hotfiesta/chilli.png',
  'hotfiesta/cactus.png',
  'hotfiesta/drum.png',
  'hotfiesta/maracas.png',
  'hotfiesta/tequila_bottle.png',
  'hotfiesta/scatter.png',
  'hotfiesta/x2.png',
].map((p) => publicAssetUrl(p));

function handleHFPreloaderPlay() {
  unlockHFAudio();
  preloadHFSfx();
  void startHFBgm(0.04);
}

export default function HotFiestaClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handleHFPreloaderPlay}>
      <HotFiestaGame />
    </GamePreloader>
  );
}

function HotFiestaGame() {
  const sessionRef = useRef<HotFiestaSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new HotFiestaSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);
  const [displayedWin, setDisplayedWin] = useState(0);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    preloadHFBgm();
    const handler = () => {
      unlockHFAudio();
      preloadHFSfx();
      startHFBgm(0.04);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
      stopHFBgm();
    };
  }, []);

  useEffect(() => {
    setHFSfxMuted(!soundOn);
    setHFBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle || snap.balance < snap.bet) return;
    unlockHFAudio();
    preloadHFSfx();
    startHFBgm(0.04);
    playHF('spin', 0.25);
    setDisplayedWin(0);
    targetWinRef.current = 0;
    lastSpinWinRef.current = 0;
    session.spin();
    refresh();
  }, [session, refresh, snap.phase, snap.balance, snap.bet]);

  const onDropComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.FreeSpinDropping) {
      session.freeSpinDropComplete();
    } else {
      session.dropComplete();
    }
    refresh();
  }, [session, refresh]);

  const onCascadeStepComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.FreeSpinCascading) {
      session.freeSpinNextCascade();
    } else {
      session.nextCascade();
    }
    refresh();
  }, [session, refresh]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
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
    if (snap.phase !== GamePhase.ShowWin) return;
    const timer = window.setTimeout(() => {
      session.dismissWin();
      refresh();
    }, 800);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  useEffect(() => {
    if (snap.phase !== GamePhase.FreeSpinIntro) return;
    const timer = window.setTimeout(() => {
      session.startFreeSpin();
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  useEffect(() => {
    if (snap.phase === GamePhase.Idle) return;
    const timer = window.setTimeout(() => {
      session.forceIdle();
      refresh();
    }, 15000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  const isFreeSpinActive = snap.inFreeSpins;
  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;

  const isCascading = snap.phase === GamePhase.Cascading || snap.phase === GamePhase.FreeSpinCascading;
  const isShowWin = snap.phase === GamePhase.ShowWin;

  const currentCascadeWin =
    isCascading && snap.currentCascadeIndex >= 0
      ? Math.round(
          snap.bet *
            snap.cascadeSteps
              .slice(0, snap.currentCascadeIndex + 1)
              .reduce((s, st) => s + st.payoutMultiplier, 0),
        )
      : 0;

  let targetWin: number;
  if (isFreeSpinActive) {
    targetWin = snap.freeSpinsTotalWin - snap.spinWin + currentCascadeWin;
    if (targetWin < 0) targetWin = 0;
    if (!isCascading) targetWin = snap.freeSpinsTotalWin;
  } else if (isCascading) {
    targetWin = currentCascadeWin;
    if (currentCascadeWin > 0) lastSpinWinRef.current = currentCascadeWin;
  } else if (isShowWin) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else {
    targetWin = lastSpinWinRef.current;
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

  const isBusy = snap.phase !== GamePhase.Idle && snap.phase !== GamePhase.FreeSpinOutro;
  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);

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
    gameTitle: 'Hot Fiesta',
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

  return (
    <SlotGameShell
      {...bridge.overlayProps}
      className={cn(
        'relative flex h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive
          ? 'bg-[#1a0a0a]'
          : 'bg-[#1a1040]',
      )}
    >
      <div
        className="relative flex h-full min-h-0 w-full flex-col"
        onClick={() => {
          if (isFreeSpinOutro) {
            session.dismissFreeSpins();
            refresh();
          }
        }}
      >
      {/* Background image */}
      <div className="slot-bg overflow-hidden bg-[#2a1810]">
        <img
          src={publicAssetUrl('hotfiesta/bg.png')}
          alt=""
          className="absolute inset-0 h-full w-full blur-[2px] scale-[1.05] brightness-[0.85] object-cover"
        />
        {/* Dark gradient at bottom for UI readability */}
        <div
          className="absolute inset-x-0 bottom-0 h-[30%]"
          style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.9) 100%)' }}
        />
      </div>


      {/* Game canvas */}
      <div
        className="slot-stage"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Logo — absolutely positioned so it doesn't shrink the grid */}
        <div className="pointer-events-none absolute left-0 right-0 z-10 flex justify-center -top-[70px] max-lg:top-[35px]">
          <img src={publicAssetUrl('hotfiesta/logo.png')} alt="Hot Fiesta" className="h-36 lg:h-40 w-auto" style={{ willChange: 'transform' }} />
        </div>

        <HotFiestaCanvas
          snapshot={snap}
          onDropComplete={onDropComplete}
          onCascadeStepComplete={onCascadeStepComplete}
          className="h-full w-full"
        />

        {/* Free Spin Intro Overlay */}
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

        {/* Free Spin Outro Overlay */}
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
              <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
            </div>
          </div>
        )}

        {/* Free Spin Counter Badge */}
        {isFreeSpinActive && !isFreeSpinIntro && !isFreeSpinOutro && (
          <div className="slot-win-chip">
            <div className="rounded-full bg-amber-500/90 px-4 py-1 shadow-lg shadow-amber-500/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE SPINS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      {showWin > 0 && (
        <div className="slot-win-chip">
          <div className="rounded-full bg-black/55 px-4 py-1.5 backdrop-blur-sm">
            <span className="text-sm font-bold tabular-nums text-emerald-400">{formatMoney(showWin)}</span>
          </div>
        </div>
      )}
      </div>
    </SlotGameShell>
  );
}
