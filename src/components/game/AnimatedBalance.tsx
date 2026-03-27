import { useEffect, useRef, useState } from 'react';

import { formatMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';

interface DeltaPopup {
  id: number;
  amount: number;
}

let popupId = 0;

export interface RoundResult {
  label: string;
  payout: number;
}

/**
 * Counts displayed balance from the previous value to `cents` (ease-out),
 * with a color flash, floating delta indicator, and optional round result banner.
 */
export function AnimatedBalance({
  cents,
  className,
  roundResult,
}: {
  cents: number;
  className?: string;
  roundResult?: RoundResult | null;
}) {
  const [display, setDisplay] = useState(cents);
  const displayRef = useRef(cents);
  const prevCentsRef = useRef(cents);
  displayRef.current = display;

  const [flash, setFlash] = useState<'win' | 'lose' | null>(null);
  const [popups, setPopups] = useState<DeltaPopup[]>([]);

  // Round result banner state
  const [visibleResult, setVisibleResult] = useState<RoundResult | null>(null);
  const prevResultRef = useRef<RoundResult | null>(null);

  useEffect(() => {
    if (roundResult && roundResult !== prevResultRef.current) {
      setVisibleResult(roundResult);
      prevResultRef.current = roundResult;
    } else if (!roundResult && prevResultRef.current) {
      const timer = window.setTimeout(() => setVisibleResult(null), 600);
      prevResultRef.current = null;
      return () => clearTimeout(timer);
    }
  }, [roundResult]);

  useEffect(() => {
    if (cents === prevCentsRef.current) return;

    const delta = cents - prevCentsRef.current;
    prevCentsRef.current = cents;

    if (delta > 0) {
      setFlash('win');
    } else if (delta < 0) {
      setFlash('lose');
    }

    const pid = ++popupId;
    setPopups((prev) => [...prev, { id: pid, amount: delta }]);
    const popupTimer = window.setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== pid));
    }, 1400);

    const flashTimer = window.setTimeout(() => setFlash(null), 800);

    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(cents);
      return () => {
        clearTimeout(popupTimer);
        clearTimeout(flashTimer);
      };
    }

    const from = displayRef.current;
    const totalDelta = cents - from;
    const duration = Math.min(1000, 350 + Math.abs(totalDelta) * 0.25);
    const t0 = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - u) ** 3;
      const next = Math.round(from + totalDelta * eased);
      setDisplay(next);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(popupTimer);
      clearTimeout(flashTimer);
    };
  }, [cents]);

  const isWin = visibleResult && visibleResult.payout > 0;
  const isLoss = visibleResult && visibleResult.payout < 0;

  return (
    <span className="relative inline-flex items-center">
      <span
        className={cn(
          'inline-block tabular-nums tracking-tight transition-colors duration-500',
          flash === 'win' && 'text-emerald-400',
          flash === 'lose' && 'text-rose-400',
          className,
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {formatMoney(display)}
      </span>

      {popups.map((p) => (
        <span
          key={p.id}
          className={cn(
            'pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold tabular-nums',
            'animate-delta-popup',
            p.amount >= 0 ? 'text-emerald-400' : 'text-rose-400',
          )}
        >
          {p.amount >= 0 ? '+' : '−'}
          {formatMoney(Math.abs(p.amount))}
        </span>
      ))}

      {visibleResult && (
        <span
          className={cn(
            'pointer-events-none absolute left-1/2 top-full mt-2 flex -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap rounded-xl px-4 py-2 shadow-lg backdrop-blur-md',
            'animate-result-slide-in',
            isWin && 'border border-emerald-400/60 bg-emerald-950/80 text-emerald-300',
            isLoss && 'border border-rose-400/60 bg-rose-950/80 text-rose-300',
            !isWin && !isLoss && 'border border-white/30 bg-black/70 text-white/80',
          )}
        >
          <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] opacity-80">
            {visibleResult.label}
          </span>
          <span className="text-base font-black tabular-nums sm:text-lg">
            {visibleResult.payout > 0 ? '+' : visibleResult.payout < 0 ? '−' : ''}
            {formatMoney(Math.abs(visibleResult.payout))}
          </span>
        </span>
      )}
    </span>
  );
}
