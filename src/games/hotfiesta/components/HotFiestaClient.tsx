import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Home, RefreshCw, Settings, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import { GamePreloader } from '@/components/GamePreloader';

import { HotFiestaSession, GamePhase, BUY_BONUS_COST } from '../engine/session';
import { HotFiestaCanvas } from '../render/HotFiestaCanvas';
import { HotFiestaSettingsModal } from './HotFiestaSettingsModal';
import { preloadHFSfx, playHF, setHFSfxMuted, setHFBgmMuted, startHFBgm, stopHFBgm, unlockHFAudio, preloadHFBgm } from '../audio/hotfiestaSfx';

const PRELOAD_ASSETS = [
  '/frootshoot/first spin.wav',
  '/frootshoot/row_clcik.wav',
  '/frootshoot/explode.wav',
];

const glassPill =
  'rounded-[14px] bg-white/[0.08] border border-white/[0.07]';

const infoPill =
  'rounded-full bg-white/[0.06] border border-white/[0.06]';

function handleHFPreloaderPlay() {
  unlockHFAudio();
  preloadHFSfx();
  startHFBgm(0.04);
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [stakeOpen, setStakeOpen] = useState(false);
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

  const isSpinning = snap.phase !== GamePhase.Idle && snap.phase !== GamePhase.FreeSpinOutro;
  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);

  return (
    <div
      className={cn(
        'relative flex h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive
          ? 'bg-gradient-to-b from-[#1a0a0a] via-[#4a1a0a] to-[#1a0a0a]'
          : 'bg-gradient-to-b from-[#1a1040] via-[#2e1858] to-[#1a1040]',
      )}
      onClick={() => {
        if (isFreeSpinOutro) {
          session.dismissFreeSpins();
          refresh();
        }
      }}
    >
      {/* Background pattern */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `repeating-conic-gradient(rgba(255,180,0,0.15) 0% 25%, transparent 0% 50%)`,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.5rem,calc(env(safe-area-inset-top)+0.15rem))] pb-0 lg:px-8 lg:pt-6 lg:pb-1"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href="/"
          className={cn(glassPill, 'flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]')}
          aria-label="Back to lobby"
        >
          <Home className="size-4" strokeWidth={1.8} />
        </a>
        <button
          type="button"
          className={cn(glassPill, 'flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]')}
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className={cn(glassPill, 'flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]')}
          aria-label={soundOn ? 'Mute' : 'Unmute'}
          onClick={() => setSoundOn((v) => !v)}
        >
          {soundOn
            ? <Volume2 className="size-4" strokeWidth={1.8} />
            : <VolumeX className="size-4" strokeWidth={1.8} />}
        </button>

        <div className="flex-1" />

        <div
          className={cn(
            glassPill,
            'ml-auto flex h-9 min-w-0 items-center gap-2 overflow-visible px-3 lg:h-10 lg:px-3.5',
          )}
        >
          <span className="shrink-0 text-[7px] font-semibold uppercase leading-none tracking-[0.15em] text-white/40 lg:text-[8px]">
            Balance
          </span>
          <span className="text-sm font-bold leading-none tabular-nums text-white lg:text-base">
            {formatMoney(snap.balance)}
          </span>
        </div>
      </header>

      {/* Game canvas */}
      <div
        className="relative min-h-0 flex-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="pointer-events-none absolute left-0 right-0 z-10 flex justify-center -top-[30px] max-lg:-top-[20px]">
          <h1
            className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-orange-400 to-red-500 drop-shadow-lg lg:text-5xl"
            style={{ textShadow: '0 2px 12px rgba(255,100,0,0.3)' }}
          >
            HOT FIESTA
          </h1>
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
              <p className="text-center text-3xl font-black tracking-tight text-orange-400 sm:text-4xl">
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
              <p className="text-center text-2xl font-black tracking-tight text-orange-400 sm:text-3xl">
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
          <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2">
            <div className="rounded-full bg-orange-500/90 px-4 py-1 shadow-lg shadow-orange-500/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE SPINS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE: Spin button */}
      {!isFreeSpinActive && (
        <div
          className="pointer-events-none absolute bottom-[1.4375rem] left-0 right-0 z-30 flex justify-center lg:hidden"
        >
          <button
            type="button"
            onClick={onSpin}
            disabled={!canSpin}
            className={cn(
              'pointer-events-auto flex size-24 items-center justify-center rounded-full shadow-2xl transition-all active:scale-[0.90]',
              canSpin
                ? 'bg-[#ff6600] text-white shadow-orange-500/40'
                : 'bg-white/10 text-white/30',
            )}
          >
            {isSpinning ? (
              <svg className="size-9 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <RefreshCw className="size-11" strokeWidth={2.5} />
            )}
          </button>
        </div>
      )}

      {/* MOBILE footer */}
      <footer
        className="shrink-0 px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] lg:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-sm items-center gap-1.5">
          <button
            type="button"
            disabled={snap.phase !== GamePhase.Idle || snap.balance < BUY_BONUS_COST}
            className={cn(
              infoPill,
              'flex flex-1 flex-col items-center px-2 py-1 transition-all active:scale-[0.94]',
              snap.phase === GamePhase.Idle && snap.balance >= BUY_BONUS_COST
                ? 'text-orange-400'
                : 'text-white/20',
            )}
            onClick={() => {
              session.buyBonus();
              setDisplayedWin(0);
              targetWinRef.current = 0;
              lastSpinWinRef.current = 0;
              refresh();
            }}
          >
            <span className="flex items-center gap-0.5 text-[7px] font-semibold uppercase tracking-[0.15em] opacity-70">
              <Zap className="size-2.5" strokeWidth={2.2} />
              Bonus Buy
            </span>
            <span className="text-xs font-bold tabular-nums">{formatMoney(BUY_BONUS_COST)}</span>
          </button>

          {isFreeSpinActive ? (
            <div className={cn(infoPill, 'flex flex-1 flex-col items-center px-2 py-1')}>
              <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-orange-400/60">Free Spins</span>
              <span className="text-xs font-bold tabular-nums text-orange-400">
                {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          ) : (
            <div className={cn(infoPill, 'flex flex-1 flex-col items-center px-2 py-1')}>
              <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/35">Win</span>
              <span className={cn(
                'text-xs font-bold tabular-nums transition-colors duration-300',
                showWin > 0 ? 'text-emerald-400' : 'text-white/40',
              )}>
                {showWin > 0 ? formatMoney(showWin) : '—'}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => !isSpinning && setStakeOpen(true)}
            disabled={isSpinning}
            className={cn(infoPill, 'flex flex-1 items-center px-2 py-1 disabled:opacity-40')}
          >
            <div className="flex flex-1 flex-col items-center">
              <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/35">Stake</span>
              <span className="text-xs font-bold tabular-nums text-white">{formatMoney(snap.bet)}</span>
            </div>
            <div className="flex size-5 items-center justify-center rounded bg-white/10">
              <ChevronDown className="size-3 text-white/50" />
            </div>
          </button>
        </div>
      </footer>

      {/* DESKTOP footer */}
      <footer
        className="hidden shrink-0 px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:block"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button
            type="button"
            disabled={isFreeSpinActive || snap.phase !== GamePhase.Idle || snap.balance < BUY_BONUS_COST}
            className={cn(
              infoPill,
              'flex flex-1 flex-col items-center px-3 py-1.5 transition-all active:scale-[0.94]',
              snap.phase === GamePhase.Idle && snap.balance >= BUY_BONUS_COST && !isFreeSpinActive
                ? 'text-orange-400 hover:bg-orange-400/10'
                : 'text-white/20',
            )}
            onClick={() => {
              session.buyBonus();
              setDisplayedWin(0);
              targetWinRef.current = 0;
              lastSpinWinRef.current = 0;
              refresh();
            }}
          >
            <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.18em] opacity-70">
              <Zap className="size-2.5" strokeWidth={2.2} />
              Bonus Buy
            </span>
            <span className="text-sm font-bold tabular-nums">{formatMoney(BUY_BONUS_COST)}</span>
          </button>

          {isFreeSpinActive ? (
            <div className={cn(infoPill, 'flex flex-1 flex-col items-center px-3 py-1.5')}>
              <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-orange-400/70">Free Spins</span>
              <span className="text-sm font-bold tabular-nums text-orange-400">
                {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !isSpinning && setStakeOpen(true)}
              disabled={isSpinning}
              className={cn(infoPill, 'flex flex-1 items-center gap-1 px-3 py-1.5 hover:bg-white/[0.08] disabled:opacity-40')}
            >
              <div className="flex flex-1 flex-col items-center">
                <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/40">Stake</span>
                <span className="text-sm font-bold tabular-nums text-white">{formatMoney(snap.bet)}</span>
              </div>
              <div className="flex size-6 items-center justify-center rounded-md bg-white/10">
                <ChevronDown className="size-3.5 text-white/60" />
              </div>
            </button>
          )}

          <div className={cn(infoPill, 'flex flex-1 flex-col items-center px-3 py-1.5')}>
            <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/40">Win</span>
            <span className={cn(
              'text-sm font-bold tabular-nums transition-colors duration-300',
              showWin > 0 ? 'text-emerald-400' : 'text-white/50',
            )}>
              {showWin > 0 ? formatMoney(showWin) : '—'}
            </span>
          </div>

          {!isFreeSpinActive && (
            <button
              type="button"
              onClick={onSpin}
              disabled={!canSpin}
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-black transition-all active:scale-[0.97]',
                canSpin
                  ? 'bg-[#ff6600] text-white shadow-lg shadow-orange-500/25 hover:bg-[#ff7711]'
                  : 'bg-white/10 text-white/30',
              )}
            >
              {isSpinning ? (
                <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                <RefreshCw className="size-7" strokeWidth={2.5} />
              )}
            </button>
          )}
        </div>
      </footer>

      {/* Stake selector drawer */}
      <StakeDrawer
        open={stakeOpen}
        onClose={() => setStakeOpen(false)}
        betOptions={session.betOptions}
        currentBet={snap.bet}
        onSelect={(cents) => { session.setBet(cents); refresh(); }}
      />

      <HotFiestaSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
      />
    </div>
  );
}

function StakeDrawer({
  open,
  onClose,
  betOptions,
  currentBet,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  betOptions: number[];
  currentBet: number;
  onSelect: (cents: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      closingRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      closingRef.current = true;
      const timer = setTimeout(() => {
        if (closingRef.current) setMounted(false);
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  const overlay = cn(
    'fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center',
    'transition-opacity duration-300',
    visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
  );

  const panel = cn(
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1525] shadow-2xl sm:mx-4 sm:rounded-2xl',
    'transition-transform duration-300 ease-out',
    visible ? 'translate-y-0' : 'translate-y-full sm:translate-y-8',
  );

  return createPortal(
    <div className={overlay} onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Select Stake</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </header>

        <div className="grid grid-cols-3 gap-2.5 px-5 py-5">
          {betOptions.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => { onSelect(cents); onClose(); }}
              className={cn(
                'flex items-center justify-center rounded-xl border-2 py-3.5 text-sm font-bold tabular-nums transition-all active:scale-95',
                cents === currentBet
                  ? 'border-orange-400 bg-orange-500/15 text-orange-300'
                  : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20',
              )}
            >
              {formatMoney(cents)}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
