import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Home, RefreshCw, Settings, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';

import { BambooFortunesSession, GamePhase, BUY_BONUS_COST } from '../engine/session';
import type { Cluster } from '../engine/grid';
import { BambooFortunesCanvas } from '../render/BambooFortunesCanvas';
import { BambooFortunesSettingsModal } from './BambooFortunesSettingsModal';
import { preloadBFSfx, playBF, setBFSfxMuted, setBFBgmMuted, startBFBgm, stopBFBgm, unlockBFAudio, preloadBFBgm } from '../audio/bamboofortunesSfx';
import { countScatters } from '../engine/grid';
import { getSymbolMultiplier, type SymbolMultiplier } from '../engine/symbolMultipliers';
import { getPayoutMultiplier, SCATTER, type BambooSymbol } from '../engine/symbols';

const glassPill =
  'rounded-[14px] border border-amber-200/20 bg-gradient-to-b from-white/[0.16] to-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl';

/** Match Breaking Bandits / Hot Fiesta footer chips. */
const infoPill = 'rounded-full bg-white/[0.06] border border-white/[0.06]';

/** Google Shojumaru — loaded on `bamboofortunes.astro` via Layout `head` slot. */
const winFontClass = "font-['Shojumaru',cursive]";

const BF_ASSET_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';
const BF_LOGO_SRC = `${BF_ASSET_BASE}bamboofortunes/logo.png`;
const BF_BG_SRC = `${BF_ASSET_BASE}bamboofortunes/bg.png`;

export default function BambooFortunesClient() {
  return <BambooFortunesGame />;
}

function BambooFortunesGame() {
  const sessionRef = useRef<BambooFortunesSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new BambooFortunesSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [stakeOpen, setStakeOpen] = useState(false);
  const [displayedWin, setDisplayedWin] = useState(0);
  const [scatterCount, setScatterCount] = useState(0);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    preloadBFBgm();
    const handler = () => {
      unlockBFAudio();
      preloadBFSfx();
      startBFBgm(0.04);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
      stopBFBgm();
    };
  }, []);

  useEffect(() => {
    setBFSfxMuted(!soundOn);
    setBFBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    const s = session.getSnapshot();
    // Allow spinning from ShowWin (skip win display)
    if (s.phase === GamePhase.ShowWin) {
      session.dismissWin();
    }
    if (s.phase !== GamePhase.Idle && s.phase !== GamePhase.ShowWin) return;
    if (s.balance < (s.inFreeSpins ? 0 : s.bet)) return;

    unlockBFAudio();
    preloadBFSfx();
    startBFBgm(0.04);
    setDisplayedWin(0);
    targetWinRef.current = 0;
    lastSpinWinRef.current = 0;
    session.spin();
    refresh();
  }, [session, refresh]);

  const onReelsComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.Spinning) {
      session.reelsComplete();
    } else if (s.phase === GamePhase.FreeSpinSpinning) {
      session.freeSpinReelsComplete();
    }
    const updated = session.getSnapshot();
    setScatterCount(countScatters(updated.grid));
    refresh();
  }, [session, refresh]);

  const onScatterUpdate = useCallback((count: number) => {
    setScatterCount(count);
  }, []);

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

  // Auto-dismiss ShowWin after delay
  useEffect(() => {
    if (snap.phase !== GamePhase.ShowWin) return;
    const delay =
      snap.freeSpinsTotal > 0 && !snap.pendingFreeSpins ? 1200 : 1500;
    const timer = window.setTimeout(() => {
      const s = session.getSnapshot();
      if (s.phase !== GamePhase.ShowWin) return;
      // `inFreeSpins` is false during ShowWin; use pending + bonus state so free-spin wins call dismissFreeSpinWin.
      if (s.pendingFreeSpins) {
        session.dismissWin();
      } else if (s.freeSpinsTotal > 0) {
        session.dismissFreeSpinWin();
      } else {
        session.dismissWin();
      }
      refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [snap.phase, snap.revision, session, refresh, snap.freeSpinsTotal, snap.pendingFreeSpins]);

  // Auto-start free spins
  useEffect(() => {
    if (snap.phase !== GamePhase.FreeSpinIntro) return;
    const timer = window.setTimeout(() => {
      session.startFreeSpin();
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  // Update scatter count when idle (shows the scatter count from current grid)
  useEffect(() => {
    if (snap.phase === GamePhase.Idle || snap.phase === GamePhase.ShowWin) {
      setScatterCount(countScatters(snap.grid));
    }
  }, [snap.phase, snap.revision]);

  // Safety timeout
  useEffect(() => {
    if (snap.phase === GamePhase.Idle) return;
    const timer = window.setTimeout(() => {
      session.forceIdle();
      refresh();
    }, 20000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  const isFreeSpinActive = snap.inFreeSpins;
  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;
  const isShowWin = snap.phase === GamePhase.ShowWin;

  if (snap.phase === GamePhase.Idle && snap.spinWin === 0) {
    lastSpinWinRef.current = 0;
  }

  let targetWin: number;
  if (isFreeSpinActive) {
    targetWin = snap.freeSpinsTotalWin;
  } else if (isShowWin) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else if (snap.phase === GamePhase.Idle && snap.spinWin > 0) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else {
    targetWin = lastSpinWinRef.current;
  }

  targetWinRef.current = targetWin;

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

  const isSpinning = snap.phase === GamePhase.Spinning || snap.phase === GamePhase.FreeSpinSpinning;
  const canSpin = (snap.phase === GamePhase.Idle && snap.balance >= snap.bet) || snap.phase === GamePhase.ShowWin;
  const footerWinCents = targetWin > 0 ? Math.round(displayedWin) : 0;
  const showWin = footerWinCents;
  const winOverlayLine =
    isShowWin && snap.spinWin > 0
      ? formatPrimaryWinLine(snap.spinWin, snap.winClusters, snap.symbolMultipliers)
      : null;

  return (
    <div
      className={cn(
        'relative flex min-h-0 h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive
          ? 'bg-[#1a0d06]'
          : 'bg-[#0a1a0e]',
      )}
      onClick={() => {
        if (isFreeSpinOutro) {
          session.dismissFreeSpins();
          refresh();
        }
      }}
    >
      {/* Background: sharp base + masked blur — strong soft blur above ~mid, then less and less blur toward bottom */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <img
          src={BF_BG_SRC}
          alt=""
          className="absolute inset-0 h-full min-h-full w-full min-w-full object-cover object-center brightness-[0.9] contrast-[1.05] saturate-[1.12] scale-[1.08] max-lg:scale-110"
        />
        <img
          src={BF_BG_SRC}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full min-h-full w-full min-w-full object-cover object-center brightness-[0.9] contrast-[1.05] saturate-[1.12] scale-[1.08] blur-lg max-lg:scale-110"
          style={{
            maskImage:
              'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.88) 12%, rgba(0,0,0,0.58) 32%, rgba(0,0,0,0.38) 50%, rgba(0,0,0,0.2) 64%, rgba(0,0,0,0.08) 76%, transparent 88%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.88) 12%, rgba(0,0,0,0.58) 32%, rgba(0,0,0,0.38) 50%, rgba(0,0,0,0.2) 64%, rgba(0,0,0,0.08) 76%, transparent 88%)',
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
          }}
        />
        <FireflyCanvas />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_65%_at_50%_38%,transparent_0%,rgba(0,0,0,0.2)_45%,rgba(0,0,0,0.55)_100%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[38%]"
          style={{
            background:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 42%, rgba(0,0,0,0.82) 78%, rgba(0,0,0,0.92) 100%)',
          }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-10 flex shrink-0 items-center gap-2 px-3 pt-[max(0.5rem,calc(env(safe-area-inset-top)+0.15rem))] pb-0 lg:px-8 lg:pt-6 lg:pb-1"
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
          <span className="text-sm font-bold leading-none tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] lg:text-base">
            {formatMoney(snap.balance)}
          </span>
        </div>
      </header>

      {/* Game canvas */}
      <div
        className="relative z-10 min-h-0 flex-1 max-lg:-mt-[10px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute left-1/2 z-10 w-full max-w-[min(96vw,820px)] -translate-x-1/2 -top-[26px] max-lg:top-6 lg:-top-[48px]">
          <h1 className="relative m-0 flex justify-center px-2">
            <img
              src={BF_LOGO_SRC}
              alt="Bamboo Fortunes"
              className="h-[6.1rem] w-auto max-w-full object-contain object-center [filter:drop-shadow(0_4px_18px_rgba(0,0,0,0.88))] sm:h-[6.45rem] lg:h-[6.35rem] lg:-translate-x-[min(1.85vw,34px)] xl:h-32"
              decoding="async"
            />
          </h1>
        </div>

        <div className="h-full min-h-0 w-full [filter:drop-shadow(0_28px_56px_rgba(0,0,0,0.7))]">
          <BambooFortunesCanvas
            snapshot={snap}
            onReelsComplete={onReelsComplete}
            onScatterUpdate={onScatterUpdate}
            className="h-full w-full"
          />
        </div>

        {isShowWin && snap.spinWin > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
            <div className="relative max-w-[min(100%,22rem)] rounded-3xl border border-amber-400/35 bg-black/78 px-8 py-7 text-center shadow-[0_0_0_1px_rgba(250,204,21,0.12),0_24px_80px_rgba(0,0,0,0.75),0_0_60px_rgba(245,158,11,0.12)] backdrop-blur-xl sm:max-w-lg sm:px-12 sm:py-9">
              <p
                className={cn(
                  winFontClass,
                  'text-[10px] font-normal uppercase tracking-[0.42em] text-amber-300/95 sm:text-[11px]',
                )}
              >
                Total win
              </p>
              <p
                className={cn(
                  winFontClass,
                  'mt-2 text-5xl font-normal tabular-nums text-amber-200 [text-shadow:0_0_40px_rgba(251,191,36,0.45),0_2px_0_rgba(120,53,15,0.5)] sm:mt-3 sm:text-7xl',
                )}
              >
                {formatMoney(Math.max(0, Math.round(displayedWin)))}
              </p>
              {winOverlayLine && (
                <p
                  className={cn(
                    winFontClass,
                    'mt-4 max-w-[min(100%,22rem)] text-center text-xs font-normal leading-relaxed text-white/90 sm:text-sm',
                  )}
                >
                  {winOverlayLine}
                </p>
              )}
            </div>
          </div>
        )}

        {isFreeSpinIntro && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
            <div className="animate-bounce rounded-2xl bg-black/70 px-10 py-6 backdrop-blur-sm">
              <p className="text-center text-3xl font-black tracking-tight text-emerald-400 sm:text-4xl">
                FREE SPINS
              </p>
              <p className="mt-1 text-center text-5xl font-black text-white sm:text-6xl">
                &times;{snap.freeSpinsTotal}
              </p>
            </div>
          </div>
        )}

        {isFreeSpinOutro && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            onClick={() => { session.dismissFreeSpins(); refresh(); }}
          >
            <div className="rounded-2xl bg-black/75 px-10 py-8 backdrop-blur-sm">
              <p className="text-center text-2xl font-black tracking-tight text-emerald-400 sm:text-3xl">
                FREE SPINS COMPLETE
              </p>
              <p
                className={cn(
                  winFontClass,
                  'mt-2 text-center text-4xl font-normal text-yellow-400 sm:text-5xl',
                )}
              >
                {formatMoney(snap.freeSpinsTotalWin)}
              </p>
              <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
            </div>
          </div>
        )}

        {isFreeSpinActive && !isFreeSpinIntro && !isFreeSpinOutro && (
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
            <div className="rounded-full bg-emerald-500/90 px-4 py-1 shadow-lg shadow-emerald-500/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE SPINS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
            {snap.freeSpinsTotalWin > 0 && (
              <div
                className={cn(
                  winFontClass,
                  'rounded-full bg-black/55 px-3 py-0.5 text-[10px] font-normal tabular-nums text-yellow-300 backdrop-blur-sm sm:text-xs',
                )}
              >
                Session win {formatMoney(snap.freeSpinsTotalWin)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MOBILE footer + spin — same pattern as Breaking Bandits / Hot Fiesta */}
      <div className="relative z-10 shrink-0 lg:hidden">
        {!isFreeSpinActive && (
          <div className="pointer-events-none absolute -top-28 left-0 right-0 z-30 flex justify-center">
            <button
              type="button"
              onClick={onSpin}
              disabled={!canSpin}
              className={cn(
                'pointer-events-auto flex size-22 items-center justify-center rounded-full shadow-2xl transition-all active:scale-[0.90]',
                canSpin
                  ? 'bg-amber-600 text-white shadow-amber-600/40'
                  : 'bg-white/10 text-white/30',
              )}
            >
              {isSpinning ? (
                <svg className="size-9 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                <RefreshCw className="size-10" strokeWidth={2.5} />
              )}
            </button>
          </div>
        )}

        <footer
          className="px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto flex max-w-sm items-center gap-1.5">
            <button
              type="button"
              disabled={snap.phase !== GamePhase.Idle || snap.balance < BUY_BONUS_COST}
              className={cn(
                infoPill,
                'flex flex-1 flex-col items-center px-2 py-1.5 transition-all active:scale-[0.94]',
                snap.phase === GamePhase.Idle && snap.balance >= BUY_BONUS_COST
                  ? 'text-amber-400'
                  : 'text-white/20',
              )}
              onClick={() => {
                unlockBFAudio();
                preloadBFSfx();
                startBFBgm(0.04);
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
              <div className={cn(infoPill, 'flex flex-1 flex-col items-center px-2 py-1.5')}>
                <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-amber-400/60">Free Spins</span>
                <span className="text-xs font-bold tabular-nums text-amber-400">
                  {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
                </span>
              </div>
            ) : (
              <div className={cn(infoPill, 'flex flex-1 flex-col items-center px-2 py-1.5')}>
                <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/35">Win</span>
                <span
                  className={cn(
                    'text-xs font-bold tabular-nums transition-colors duration-300',
                    showWin > 0 ? 'text-emerald-400' : 'text-white/40',
                  )}
                >
                  {showWin > 0 ? formatMoney(showWin) : '—'}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => !isSpinning && setStakeOpen(true)}
              disabled={isSpinning}
              className={cn(infoPill, 'flex flex-1 items-center px-2 py-1.5 disabled:opacity-40')}
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
      </div>

      {/* DESKTOP footer — match Breaking Bandits */}
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
              unlockBFAudio();
              preloadBFSfx();
              startBFBgm(0.04);
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
            <span
              className={cn(
                'text-sm font-bold tabular-nums transition-colors duration-300',
                showWin > 0 ? 'text-emerald-400' : 'text-white/50',
              )}
            >
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

      <StakeDrawer
        open={stakeOpen}
        onClose={() => setStakeOpen(false)}
        betOptions={session.betOptions}
        currentBet={snap.bet}
        onSelect={(cents) => { session.setBet(cents); refresh(); }}
      />

      <BambooFortunesSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
      />
    </div>
  );
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  speed: number;
  hue: number;
}

function clusterWeight(cluster: Cluster, symbolMultipliers: SymbolMultiplier[]): number {
  const base = getPayoutMultiplier(cluster.symbol, cluster.cells.length);
  if (base <= 0) return 0;
  const sym =
    cluster.symbol === SCATTER
      ? 1
      : getSymbolMultiplier(symbolMultipliers, cluster.symbol as BambooSymbol);
  return base * sym;
}

function formatPrimaryWinLine(
  spinWin: number,
  clusters: Cluster[],
  symbolMultipliers: SymbolMultiplier[],
): string | null {
  if (spinWin <= 0 || clusters.length === 0) return null;
  const weights = clusters.map((c) => clusterWeight(c, symbolMultipliers));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  let bestI = 0;
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] > weights[bestI]) bestI = i;
  }
  const c = clusters[bestI]!;
  const share = Math.round((spinWin * weights[bestI]) / sum);
  return `${symbolWinLabel(c.symbol)} · ${c.cells.length} symbols · ${formatMoney(share)}`;
}

function symbolWinLabel(symbol: Cluster['symbol']): string {
  const em: Record<string, string> = {
    heart: '♥',
    spade: '♠',
    club: '♣',
    panda: '🐼',
    dragon: '🐉',
    gong: '🔔',
    wild: '✦',
    bonsai: '🌳',
    scatter: '★',
  };
  const s = symbol as string;
  const emoji = em[s] ?? '●';
  const title = s === 'scatter' ? 'Scatter' : s.charAt(0).toUpperCase() + s.slice(1);
  return `${emoji} ${title}`;
}

const FireflyCanvas = memo(function FireflyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const flies: Firefly[] = [];
    let raf = 0;

    function resize() {
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * Math.min(window.devicePixelRatio, 2);
      canvas!.height = h * Math.min(window.devicePixelRatio, 2);
      ctx!.setTransform(Math.min(window.devicePixelRatio, 2), 0, 0, Math.min(window.devicePixelRatio, 2), 0, 0);
    }

    function init() {
      resize();
      flies.length = 0;
      const count = Math.max(20, Math.floor((w * h) / 18000));
      for (let i = 0; i < count; i++) {
        flies.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.2,
          radius: 1.5 + Math.random() * 2.5,
          baseAlpha: 0.22 + Math.random() * 0.38,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.8,
          hue: 80 + Math.random() * 60,
        });
      }
    }

    let lastTime = 0;
    function tick(time: number) {
      const dt = Math.min(time - lastTime, 50) / 16;
      lastTime = time;

      ctx!.clearRect(0, 0, w, h);

      for (const f of flies) {
        f.phase += 0.008 * f.speed * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;

        f.vx += (Math.random() - 0.5) * 0.02 * dt;
        f.vy += (Math.random() - 0.5) * 0.015 * dt;
        f.vx *= 0.995;
        f.vy *= 0.995;

        if (f.x < -20) f.x = w + 20;
        if (f.x > w + 20) f.x = -20;
        if (f.y < -20) f.y = h + 20;
        if (f.y > h + 20) f.y = -20;

        const pulse = (Math.sin(f.phase) * 0.5 + 0.5);
        const alpha = f.baseAlpha * pulse;
        if (alpha < 0.01) continue;

        const r = f.radius * (0.8 + pulse * 0.4);

        const grad = ctx!.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 4);
        grad.addColorStop(0, `hsla(${f.hue}, 80%, 75%, ${alpha})`);
        grad.addColorStop(0.3, `hsla(${f.hue}, 70%, 60%, ${alpha * 0.5})`);
        grad.addColorStop(1, `hsla(${f.hue}, 60%, 50%, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(f.x, f.y, r * 4, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = `hsla(${f.hue}, 90%, 85%, ${alpha * 1.2})`;
        ctx!.beginPath();
        ctx!.arc(f.x, f.y, r * 0.6, 0, Math.PI * 2);
        ctx!.fill();
      }

      raf = requestAnimationFrame(tick);
    }

    init();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', init);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', init);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ mixBlendMode: 'screen' }}
    />
  );
});

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
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0d1a10] shadow-2xl sm:mx-4 sm:rounded-2xl',
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
                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
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
