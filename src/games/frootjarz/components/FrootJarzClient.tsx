import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Home, RefreshCw, Volume2, VolumeX, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';

import { FrootJarzSession, GamePhase, BUY_BONUS_COST } from '../engine/session';
import { FrootJarzCanvas } from '../render/FrootJarzCanvas';

const glassPill =
  'rounded-[14px] bg-white/[0.08] border border-white/[0.07] shadow-[0_0_20px_rgba(168,85,247,0.06)]';

const footerPill =
  'rounded-[10px] bg-white/[0.06] border border-white/[0.06]';

export default function FrootJarzClient() {
  const sessionRef = useRef<FrootJarzSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new FrootJarzSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);

  const [displayedWin, setDisplayedWin] = useState(0);
  const targetWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle || snap.balance < snap.bet) return;
    setDisplayedWin(0);
    targetWinRef.current = 0;
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

  // Spacebar and tap-anywhere to spin
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

  // Auto-dismiss win display
  useEffect(() => {
    if (snap.phase !== GamePhase.ShowWin) return;
    const timer = window.setTimeout(() => {
      session.dismissWin();
      refresh();
    }, 800);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  // Free Spin Intro: auto-advance after 2s
  useEffect(() => {
    if (snap.phase !== GamePhase.FreeSpinIntro) return;
    const timer = window.setTimeout(() => {
      session.startFreeSpin();
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  // Auto-fire next free spin after cascade completes (when in FreeSpinCascading and all done -> starts next automatically via session)
  // The session handles auto-advancing, but we need to detect when a free spin's ShowWin-equivalent pause is needed
  // Since FreeSpinDropping/Cascading transitions happen in session, we just need to re-fire startFreeSpin
  // when we end up back at FreeSpinIntro-like state. Actually the session auto-chains, so we just refresh.

  // Safety timeout: force idle from ANY stuck phase after 10s
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

  // Compute target win from cascade progress
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
    // During free spins, show accumulated total + current cascade progress
    targetWin = snap.freeSpinsTotalWin - snap.spinWin + currentCascadeWin;
    if (targetWin < 0) targetWin = 0;
    // Between spins (no cascade), just show the running total
    if (!isCascading) targetWin = snap.freeSpinsTotalWin;
  } else if (isCascading) {
    targetWin = currentCascadeWin;
  } else if (isShowWin) {
    targetWin = snap.spinWin;
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

  const isSpinning = snap.phase !== GamePhase.Idle && snap.phase !== GamePhase.FreeSpinOutro;
  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);

  return (
    <div
      className={cn(
        'flex h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive
          ? 'bg-gradient-to-b from-[#1a0e0a] via-[#3d1f0a] to-[#1a0e0a]'
          : 'bg-gradient-to-b from-[#1a1230] via-[#2c1f4a] to-[#1a1230]',
      )}
      onClick={() => {
        if (isFreeSpinOutro) {
          session.dismissFreeSpins();
          refresh();
        } else if (canSpin) {
          onSpin();
        }
      }}
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.25rem))] sm:px-6 lg:px-12 lg:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href="/"
          className={cn(glassPill, 'flex size-10 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.94]')}
          aria-label="Back to lobby"
        >
          <Home className="size-[17px]" strokeWidth={1.8} />
        </a>

        <h1 className="mx-auto text-lg font-black tracking-tight sm:text-xl lg:text-2xl">
          <span className="text-[#c084fc]">FROOT</span>{' '}
          <span className="text-white">JARZ</span>
        </h1>

        <button
          type="button"
          disabled={snap.phase !== GamePhase.Idle || snap.balance < BUY_BONUS_COST}
          className={cn(
            glassPill,
            'flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.94]',
            snap.phase === GamePhase.Idle && snap.balance >= BUY_BONUS_COST
              ? 'text-amber-400 hover:bg-amber-400/10'
              : 'text-white/20',
          )}
          onClick={() => {
            session.buyBonus();
            setDisplayedWin(0);
            targetWinRef.current = 0;
            refresh();
          }}
        >
          <Zap className="size-3.5" strokeWidth={2.2} />
          <span className="hidden sm:inline">Buy Bonus</span>
          <span className="tabular-nums">{formatMoney(BUY_BONUS_COST)}</span>
        </button>

        <button
          type="button"
          className={cn(glassPill, 'flex size-10 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.94]')}
          aria-label={soundOn ? 'Mute' : 'Unmute'}
          onClick={() => setSoundOn((v) => !v)}
        >
          {soundOn ? <Volume2 className="size-[17px]" strokeWidth={1.8} /> : <VolumeX className="size-[17px]" strokeWidth={1.8} />}
        </button>
      </header>

      {/* Canvas */}
      <div
        className="relative min-h-0 flex-1 px-2 sm:px-4 lg:px-8"
        onClick={(e) => e.stopPropagation()}
      >
        <FrootJarzCanvas
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
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
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
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
            <div className="rounded-full bg-amber-500/90 px-5 py-1.5 shadow-lg shadow-amber-500/30">
              <span className="text-sm font-black tabular-nums text-white sm:text-base">
                FREE SPINS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <footer
        className="shrink-0 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-6 lg:px-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          {/* Balance pill */}
          <div className={cn(footerPill, 'flex flex-1 flex-col items-center px-3 py-1.5')}>
            <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/40">Balance</span>
            <span className="text-sm font-bold tabular-nums text-white sm:text-base">{formatMoney(snap.balance)}</span>
          </div>

          {/* Bet pill with controls (or FREE SPINS counter) */}
          {isFreeSpinActive ? (
            <div className={cn(footerPill, 'flex flex-1 flex-col items-center px-3 py-1.5')}>
              <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-amber-400/70">Free Spins</span>
              <span className="text-sm font-bold tabular-nums text-amber-400 sm:text-base">
                {snap.freeSpinsRemaining} / {snap.freeSpinsTotal}
              </span>
            </div>
          ) : (
            <div className={cn(footerPill, 'flex flex-1 items-center gap-1 px-2 py-1.5')}>
              <button
                type="button"
                onClick={() => { session.decreaseBet(); refresh(); }}
                disabled={isSpinning}
                className="flex size-6 items-center justify-center rounded-md bg-white/10 text-white/60 hover:bg-white/15 active:scale-95 disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <div className="flex flex-1 flex-col items-center">
                <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/40">Total Bet</span>
                <span className="text-sm font-bold tabular-nums text-white sm:text-base">{formatMoney(snap.bet)}</span>
              </div>
              <button
                type="button"
                onClick={() => { session.increaseBet(); refresh(); }}
                disabled={isSpinning}
                className="flex size-6 items-center justify-center rounded-md bg-white/10 text-white/60 hover:bg-white/15 active:scale-95 disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
            </div>
          )}

          {/* Win pill */}
          <div className={cn(footerPill, 'flex flex-1 flex-col items-center px-3 py-1.5')}>
            <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/40">Win</span>
            <span className={cn(
              'text-sm font-bold tabular-nums transition-colors duration-300 sm:text-base',
              showWin > 0 ? 'text-emerald-400' : 'text-white/50',
            )}>
              {showWin > 0 ? formatMoney(showWin) : '—'}
            </span>
          </div>

          {/* Spin button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSpin(); }}
            disabled={!canSpin}
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.97] sm:h-16 sm:w-16 sm:text-base',
              canSpin
                ? 'bg-[#22c55e] text-white shadow-lg shadow-emerald-500/25 hover:bg-[#2dd468]'
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
        </div>
      </footer>
    </div>
  );
}
