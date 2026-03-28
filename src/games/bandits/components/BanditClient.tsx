import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Home, RefreshCw, Settings, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';

import { BanditSession, GamePhase, BUY_BONUS_COST, type FreeSpinMode } from '../engine/session';
import { ReelCanvas, type FrameRect } from '../render/ReelCanvas';
import { BanditSettings } from './BanditSettings';
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

const glassPill = 'rounded-[14px] bg-white/[0.08] border border-white/[0.07]';
const infoPill = 'rounded-full bg-white/[0.06] border border-white/[0.06]';

export default function BanditClient() {
  const sessionRef = useRef<BanditSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new BanditSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [displayedWin, setDisplayedWin] = useState(0);
  const [frameRect, setFrameRect] = useState<FrameRect | null>(null);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    const handler = () => {
      unlockBanditAudio();
      preloadBanditSfx();
      startBanditBgm(0.15);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
      stopBanditBgm();
    };
  }, []);

  useEffect(() => {
    setBanditSfxMuted(!soundOn);
    setBanditBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle || snap.balance < snap.bet) return;
    unlockBanditAudio();
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

  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);

  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinChoice = snap.phase === GamePhase.FreeSpinChoice;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;
  const isGambleReveal = snap.phase === GamePhase.GambleReveal;

  return (
    <div
      className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-black text-white"
    >
      {/* Full-screen background image */}
      <img
        src="/bandits/bg2.png"
        alt=""
        className={cn(
          'pointer-events-none absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-700',
          isFreeSpinActive ? 'brightness-[0.6]' : 'brightness-[0.75]',
        )}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

      {/* Header */}
      <header
        className="relative z-10 flex shrink-0 items-center gap-2 px-2 pt-[max(0.25rem,env(safe-area-inset-top))] pb-0 lg:px-8 lg:pt-6 lg:pb-1"
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

        <div className={cn(glassPill, 'ml-auto flex h-9 min-w-0 items-center gap-2 overflow-visible px-3 lg:h-10 lg:px-3.5')}>
          <span className="shrink-0 text-[7px] font-semibold uppercase leading-none tracking-[0.15em] text-white/40 lg:text-[8px]">
            Balance
          </span>
          <span className="text-sm font-bold leading-none tabular-nums text-white lg:text-base">
            {formatMoney(snap.balance)}
          </span>
        </div>
      </header>

      {/* Game canvas */}
      <div className="relative z-10 min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        {/* Logo — always attached to top of frame */}
        <img
          src="/bandits/logo.png"
          alt="Breaking Bandits"
          className="pointer-events-none absolute left-1/2 z-40 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
          style={frameRect ? (() => {
            const isMobile = window.innerWidth < 1024;
            const logoH = isMobile
              ? Math.max(60, frameRect.w * 0.22)
              : Math.max(80, frameRect.w * 0.3);
            const overlap = isMobile ? 0.55 : 0.35;
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
        {/* Cowboy character — left of the frame */}
        <img
          src="/bandits/cowboy.png"
          alt=""
          className="pointer-events-none absolute bottom-0 left-[calc(2%-30px)] z-30 hidden h-[48%] w-auto object-contain brightness-[0.8] sepia-[0.25] saturate-[1.2] drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] xl:left-[calc(10%-50px)] xl:h-[62%] 2xl:left-[calc(16%-50px)] 2xl:h-[72%] lg:block"
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
          <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2">
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
      </div>

      {/* MOBILE: Spin button */}
      {!isFreeSpinActive && (
        <div className="pointer-events-none absolute bottom-[0.75rem] left-0 right-0 z-30 flex justify-center lg:hidden">
          <button
            type="button"
            onClick={onSpin}
            disabled={!canSpin}
            className={cn(
              'pointer-events-auto flex size-16 items-center justify-center rounded-full shadow-2xl transition-all active:scale-[0.90]',
              canSpin
                ? 'bg-amber-600 text-white shadow-amber-600/40'
                : 'bg-white/10 text-white/30',
            )}
          >
            {isSpinning ? (
              <svg className="size-7 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <RefreshCw className="size-8" strokeWidth={2.5} />
            )}
          </button>
        </div>
      )}

      {/* MOBILE footer */}
      <footer
        className="relative z-10 shrink-0 px-2 pb-[max(0.15rem,env(safe-area-inset-bottom))] pt-0 lg:hidden"
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
                ? 'text-amber-400'
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
              <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-amber-400/60">Free Spins</span>
              <span className="text-xs font-bold tabular-nums text-amber-400">
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
        className="relative z-10 hidden shrink-0 px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:block"
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
                ? 'text-amber-400 hover:bg-amber-400/10'
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
              <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-amber-400/70">Free Spins</span>
              <span className="text-sm font-bold tabular-nums text-amber-400">
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
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/25 hover:bg-amber-500'
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

      {/* Stake drawer */}
      <StakeDrawer
        open={stakeOpen}
        onClose={() => setStakeOpen(false)}
        betOptions={session.betOptions}
        currentBet={snap.bet}
        onSelect={(cents) => { session.setBet(cents); refresh(); }}
      />

      <BanditSettings
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
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1008] shadow-2xl sm:mx-4 sm:rounded-2xl',
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
                  ? 'border-amber-400 bg-amber-600/15 text-amber-300'
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
