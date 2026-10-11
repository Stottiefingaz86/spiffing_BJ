import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { publicAssetUrl } from '@/lib/publicUrl';
import { formatMoney } from '@/lib/formatMoney';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';
import { GamePreloader } from '@/components/GamePreloader';
import { FrootJarzSession, GamePhase, BUY_BONUS_COST } from '../engine/session';
import { FrootJarzCanvas } from '../render/FrootJarzCanvas';
import { preloadFJSfx, playFJ, setFJSfxMuted, setFJBgmMuted, startFJBgm, stopFJBgm, unlockFJAudio, preloadBgm } from '../audio/frootjarzSfx';

const FJ_BG_SRC = publicAssetUrl('frootshoot/bg.png');

const PRELOAD_ASSETS = [
  'frootshoot/bg.png',
  'frootshoot/symbols/s1.png',
  'frootshoot/symbols/s2.png',
  'frootshoot/symbols/s3.png',
  'frootshoot/symbols/s4.png',
  'frootshoot/symbols/s5.png',
  'frootshoot/symbols/s6.png',
  'frootshoot/symbols/jar.png',
  'frootshoot/LOGO.png',
  'frootshoot/symbols/sounds/spin.mp3',
  'frootshoot/symbols/sounds/scatter.mp3',
  'frootshoot/reelend.mp3',
].map((p) => publicAssetUrl(p));

function handleFJPreloaderPlay() {
  unlockFJAudio();
  preloadFJSfx();
  startFJBgm(0.04);
}

export default function FrootJarzClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handleFJPreloaderPlay}>
      <FrootJarzGame />
    </GamePreloader>
  );
}

function FrootJarzGame() {
  const sessionRef = useRef<FrootJarzSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new FrootJarzSession();
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
    preloadBgm();
    const handler = () => {
      unlockFJAudio();
      preloadFJSfx();
      startFJBgm(0.04);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
      stopFJBgm();
    };
  }, []);

  useEffect(() => {
    setFJSfxMuted(!soundOn);
    setFJBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle || snap.balance < snap.bet) return;
    unlockFJAudio();
    preloadFJSfx();
    startFJBgm(0.04);
    playFJ('spin', 0.1);
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
    gameTitle: 'Fruity Rush',
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
          ? 'bg-gradient-to-b from-[#1a0e0a] via-[#3d1f0a] to-[#1a0e0a]'
          : 'bg-[#0a0f1c]',
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
        {!isFreeSpinActive && (
          <div className="slot-bg overflow-hidden bg-[#0a0f1c]">
            <img
              src={FJ_BG_SRC}
              alt=""
              className="absolute inset-0 h-full w-full blur-[2px] scale-[1.05] brightness-[0.85] object-cover"
              loading="eager"
              decoding="async"
            />
            <div
              className="absolute inset-x-0 bottom-0 h-[30%]"
              style={{
                background:
                  'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.9) 100%)',
              }}
            />
          </div>
        )}

        <div
          className="slot-stage"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-none absolute left-0 right-0 z-10 flex justify-center -top-[75px] max-lg:-top-[45px]">
            <img src={publicAssetUrl('frootshoot/LOGO.png')} alt="Fruity Rush" className="h-64 lg:h-64 w-auto" style={{ willChange: 'transform' }} />
          </div>

          <FrootJarzCanvas
            snapshot={snap}
            onDropComplete={onDropComplete}
            onCascadeStepComplete={onCascadeStepComplete}
            className="h-full w-full"
          />

          {isFreeSpinIntro && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="animate-bounce rounded-2xl bg-black/70 px-10 py-6 backdrop-blur-sm">
                <p className="text-center text-3xl font-black tracking-tight text-amber-400 sm:text-4xl">FREE SPINS</p>
                <p className="mt-1 text-center text-5xl font-black text-white sm:text-6xl">&times;{snap.freeSpinsTotal}</p>
              </div>
            </div>
          )}

          {isFreeSpinOutro && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center"
              onClick={() => {
                session.dismissFreeSpins();
                refresh();
              }}
            >
              <div className="rounded-2xl bg-black/75 px-10 py-8 backdrop-blur-sm">
                <p className="text-center text-2xl font-black tracking-tight text-amber-400 sm:text-3xl">FREE SPINS COMPLETE</p>
                <p className="mt-2 text-center text-4xl font-black text-emerald-400 sm:text-5xl">
                  {formatMoney(snap.freeSpinsTotalWin)}
                </p>
                <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
              </div>
            </div>
          )}

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

