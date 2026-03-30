import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestRaiderSettingsModalProps {
  open: boolean;
  onClose: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
        on ? 'bg-emerald-500' : 'bg-white/15',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow-md transition-transform duration-200',
          on ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export function QuestRaiderSettingsModal({
  open,
  onClose,
  soundOn,
  onToggleSound,
}: QuestRaiderSettingsModalProps) {
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
  }, [open, mounted]);

  if (!mounted) return null;

  const drawerPanel = cn(
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1518] shadow-2xl sm:mx-4 sm:rounded-2xl',
    'transition-transform duration-300 ease-out max-h-[85dvh]',
    visible ? 'translate-y-0 sm:translate-y-0' : 'translate-y-full sm:translate-y-8',
  );

  const overlay = cn(
    'fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center',
    'transition-opacity duration-300',
    visible ? 'opacity-100' : 'pointer-events-none opacity-0',
  );

  return createPortal(
    <div className={overlay} onClick={onClose}>
      <div className={drawerPanel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Quest Raider</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-white/75">
          <p>
            <strong className="text-amber-200/90">5×3</strong>, <strong className="text-amber-200/90">20 fixed bet lines</strong>.
            Wins need at least one symbol on reel 1 and adjacent matches left-to-right; highest win per line only.
          </p>
          <p>
            <strong className="text-amber-200/90">Avalanche™:</strong> winning line symbols are removed; others drop and
            new symbols fall. Unlimited avalanches per round; win multipliers cap at{' '}
            <strong className="text-white">×5</strong> (main) and <strong className="text-white">×15</strong> (free falls),
            with higher steps using the max after that.
          </p>
          <p>
            <strong className="text-amber-200/90">Free falls:</strong> <strong className="text-white">3+</strong> Free Fall
            symbols <strong className="text-white">in a row on a bet line from the left</strong> award{' '}
            <strong className="text-white">10</strong> free falls per qualifying line (e.g. two lines → 20). Retriggers add
            the same way during the feature.
          </p>
          <p>
            <strong className="text-amber-200/90">Wild</strong> appears on reels 2–4 only; it substitutes for paying symbols
            and can stand in for <strong className="text-amber-200/90">Free Fall</strong> symbols on a line per the official
            game sheet. <em className="text-white/50">RTP ~95.97% is a design reference; this demo math is not certified.</em>
          </p>
          <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Sound</span>
            <Toggle on={soundOn} onToggle={onToggleSound} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
