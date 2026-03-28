import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import type { FreeSpinMode } from '../engine/session';

interface FreeSpinChoiceProps {
  visible: boolean;
  freeSpinsTotal: number;
  onChoose: (mode: FreeSpinMode) => void;
}

export function FreeSpinChoiceOverlay({ visible, freeSpinsTotal, onChoose }: FreeSpinChoiceProps) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-amber-900/30 bg-[#1a1008]/95 px-8 py-8 shadow-2xl">
        <h2 className="mb-1 text-center text-2xl font-black tracking-tight text-amber-400 sm:text-3xl">
          FREE SPINS
        </h2>
        <p className="mb-6 text-center text-4xl font-black text-white sm:text-5xl">
          &times;{freeSpinsTotal}
        </p>
        <p className="mb-6 text-center text-sm text-white/60">
          Choose your play, partner
        </p>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => onChoose('standard')}
            className={cn(
              'flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 px-4 py-5 transition-all',
              'hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-[0.97]',
            )}
          >
            <span className="text-3xl">🤠</span>
            <span className="text-sm font-bold uppercase tracking-wide text-emerald-400">Safe Play</span>
            <span className="text-[11px] text-white/50">Wins paid as they land</span>
          </button>
          <button
            type="button"
            onClick={() => onChoose('gamble')}
            className={cn(
              'flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-red-500/40 bg-red-500/10 px-4 py-5 transition-all',
              'hover:border-red-400/60 hover:bg-red-500/20 active:scale-[0.97]',
            )}
          >
            <span className="text-3xl">🎰</span>
            <span className="text-sm font-bold uppercase tracking-wide text-red-400">All In</span>
            <span className="text-[11px] text-white/50">Collect &amp; risk for 2x</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface GambleRevealProps {
  visible: boolean;
  result: 'up' | 'down' | null;
  pot: number;
  onAcknowledge: () => void;
}

export function GambleRevealOverlay({ visible, result, pot, onAcknowledge }: GambleRevealProps) {
  if (!visible || !result) return null;

  const isUp = result === 'up';

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onAcknowledge}
    >
      <div className="mx-4 max-w-md rounded-2xl border border-amber-900/30 bg-[#1a1008]/95 px-8 py-8 shadow-2xl">
        <div className="mb-4 text-center text-6xl">
          {isUp ? '👍' : '👎'}
        </div>
        <h2
          className={cn(
            'mb-2 text-center text-3xl font-black tracking-tight',
            isUp ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          {isUp ? 'DOUBLED!' : 'BUSTED!'}
        </h2>
        {isUp ? (
          <p className="mb-2 text-center text-xl font-bold text-white">
            Pot is now {formatMoney(pot)}
          </p>
        ) : (
          <p className="mb-2 text-center text-xl font-bold text-white/60">
            Pot of {formatMoney(pot)} lost
          </p>
        )}
        <p className="mt-4 text-center text-xs text-white/40">Tap to continue</p>
      </div>
    </div>
  );
}
