import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import { publicAssetUrl } from '@/lib/publicUrl';
import { GamePreloader } from '@/components/GamePreloader';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';

import { QuestRaiderSession, GamePhase } from '../engine/session';
import { QuestRaiderCanvas } from '../render/QuestRaiderCanvas';
import {
  preloadTFSfx,
  playTF,
  setTFSfxMuted,
  startTFBgm,
  stopTFBgm,
  setTFBgmMuted,
  unlockTFAudio,
  preloadTFBgm,
} from '../audio/questRaiderSfx';

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const PRELOAD_ASSETS = [
  'quest_raiders/bg.png',
  'quest_raiders/logo.png',
  'quest_raiders/frame.png',
  'quest_raiders/mask.png',
  'quest_raiders/wild.png',
  'quest_raiders/scatter.png',
  'quest_raiders/symbol1.png',
  'quest_raiders/symbol2.png',
  'quest_raiders/symbol3.png',
  'quest_raiders/symbol4.png',
  'quest_raiders/symbol5.png',
  'quest_raiders/symbol6.png',
  'quest_raiders/symbol7.png',
  'quest_raiders/spin.mp3',
  'quest_raiders/reel_end.mp3',
  'quest_raiders/win.mp3',
  'quest_raiders/bgm.mp3',
].map((p) => publicAssetUrl(p));

function handleQuestPreloaderPlay() {
  unlockTFAudio();
  void preloadTFSfx();
  void startTFBgm();
}

export default function QuestRaiderClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handleQuestPreloaderPlay}>
      <QuestRaiderGame />
    </GamePreloader>
  );
}

function QuestRaiderGame() {
  const sessionRef = useRef<QuestRaiderSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new QuestRaiderSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [sfxOn, setSfxOn] = useState(true);
  const [bgmOn, setBgmOn] = useState(true);
  const [displayedWin, setDisplayedWin] = useState(0);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef(0);
  const cameraShakeRef = useRef({ x: 0, y: 0 });

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    preloadTFBgm();
    const startAudio = () => {
      unlockTFAudio();
      void preloadTFSfx();
      void startTFBgm();
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('touchstart', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('touchstart', startAudio);
      window.removeEventListener('keydown', startAudio);
      stopTFBgm();
    };
  }, []);

  useEffect(() => {
    setTFSfxMuted(!sfxOn);
  }, [sfxOn]);

  useEffect(() => {
    setTFBgmMuted(!bgmOn);
  }, [bgmOn]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle || snap.balance < snap.bet) return;
    unlockTFAudio();
    preloadTFSfx();
    void startTFBgm();
    playTF('spin', 0.22);
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
    }, 900);
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
    }, 18000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  const isFreeSpinActive = snap.inFreeSpins;
  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;
  const isCascading = snap.phase === GamePhase.Cascading || snap.phase === GamePhase.FreeSpinCascading;
  const isShowWin = snap.phase === GamePhase.ShowWin;

  const currentCascadeWin =
    isCascading && snap.currentCascadeIndex >= 0
      ? snap.cascadeSteps.slice(0, snap.currentCascadeIndex + 1).reduce((s, st) => s + st.payoutCents, 0)
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
    showBuyBonus: false,
    gameTitle: 'Quest Raider',
    soundEnabled: sfxOn,
    musicEnabled: bgmOn,
    onSpin,
    onSetBetCents: (cents) => {
      session.setBet(cents);
      refresh();
    },
    onToggleSound: () => setSfxOn((v) => !v),
    onToggleMusic: () => setBgmOn((v) => !v),
  });

  return (
    <SlotGameShell
      {...bridge.overlayProps}
      className={cn(
        'relative h-dvh max-h-dvh overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive ? 'bg-[#181008]' : 'bg-[#121016]',
      )}
    >
      <div
        className="relative h-full w-full"
        onClick={() => {
          if (isFreeSpinOutro) {
            session.dismissFreeSpins();
            refresh();
          }
        }}
      >
        <div className="slot-bg">
          <div
            className={cn(
              'absolute inset-0 bg-[#0f0e12] transition-opacity duration-700',
              isFreeSpinActive ? 'opacity-95' : 'opacity-100',
            )}
            style={{
              backgroundImage: `url(${ASSET_BASE}quest_raiders/bg.png)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div
            className={cn(
              'absolute inset-0 mix-blend-soft-light',
              isFreeSpinActive
                ? 'bg-gradient-to-b from-transparent via-amber-950/14 to-stone-950/18'
                : 'bg-gradient-to-b from-transparent via-emerald-950/10 to-violet-950/14',
            )}
          />
          <div
            className={cn(
              'absolute inset-0 mix-blend-overlay',
              isFreeSpinActive
                ? 'bg-gradient-to-b from-transparent via-amber-950/8 to-stone-900/14'
                : 'bg-gradient-to-b from-transparent via-teal-950/6 to-[#12101a]/16',
            )}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(42vh,520px)]"
            style={{
              background: isFreeSpinActive
                ? 'linear-gradient(to bottom, transparent 0%, rgba(32,18,10,0.28) 44%, rgba(18,10,6,0.58) 80%, rgba(10,6,4,0.72) 100%)'
                : 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 46%, rgba(0,0,0,0.52) 82%, rgba(0,0,0,0.68) 100%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background: isFreeSpinActive
                ? 'radial-gradient(ellipse 105% 95% at 50% 48%, transparent 0%, transparent 40%, rgba(36,18,10,0.22) 72%, rgba(14,8,5,0.55) 100%)'
                : 'radial-gradient(ellipse 105% 95% at 50% 48%, transparent 0%, transparent 40%, rgba(0,0,0,0.2) 72%, rgba(0,0,0,0.52) 100%)',
            }}
          />
        </div>

        <div className="slot-stage" onClick={(e) => e.stopPropagation()}>
          <QuestRaiderCanvas
            snapshot={snap}
            onDropComplete={onDropComplete}
            onCascadeStepComplete={onCascadeStepComplete}
            cameraShakeRef={cameraShakeRef}
            className="relative z-10 h-full w-full min-h-0"
          />
          <div
            className="pointer-events-none absolute inset-0 z-[15]"
            aria-hidden
            style={{
              background: isFreeSpinActive
                ? 'radial-gradient(ellipse 102% 90% at 50% 44%, transparent 0%, transparent 42%, rgba(48,28,16,0.12) 62%, rgba(22,12,8,0.34) 100%)'
                : 'radial-gradient(ellipse 102% 90% at 50% 44%, transparent 0%, transparent 42%, rgba(0,0,0,0.1) 64%, rgba(0,0,0,0.3) 100%)',
            }}
          />

          {isFreeSpinIntro && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="animate-bounce rounded-2xl bg-black/70 px-10 py-6 backdrop-blur-sm">
                <p className="text-center text-3xl font-black tracking-tight text-amber-400 sm:text-4xl">FREE FALLS</p>
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
                <p className="text-center text-2xl font-black tracking-tight text-amber-400 sm:text-3xl">
                  FREE FALLS COMPLETE
                </p>
                <p className="mt-2 text-center text-4xl font-black text-emerald-400 sm:text-5xl">
                  {formatMoney(snap.freeSpinsTotalWin)}
                </p>
                <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
              </div>
            </div>
          )}

          {isFreeSpinActive && !isFreeSpinIntro && !isFreeSpinOutro && (
            <div className="slot-win-chip">
              <div className="rounded-full bg-amber-600/90 px-4 py-1 shadow-lg shadow-amber-700/30">
                <span className="text-xs font-black tabular-nums text-white">
                  FREE FALLS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
                </span>
              </div>
            </div>
          )}

          {showWin > 0 && !isFreeSpinOutro && (
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
