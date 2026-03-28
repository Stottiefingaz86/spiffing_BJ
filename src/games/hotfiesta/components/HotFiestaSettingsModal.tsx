import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HotFiestaSettingsModalProps {
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
        on ? 'bg-orange-500' : 'bg-white/15',
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

export function HotFiestaSettingsModal({
  open,
  onClose,
  soundOn,
  onToggleSound,
}: HotFiestaSettingsModalProps) {
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

  const drawerPanel = cn(
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1525] shadow-2xl sm:mx-4 sm:rounded-2xl',
    'transition-transform duration-300 ease-out max-h-[85dvh]',
    visible ? 'translate-y-0 sm:translate-y-0' : 'translate-y-full sm:translate-y-8',
  );

  const overlay = cn(
    'fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center',
    'transition-opacity duration-300',
    visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
  );

  return createPortal(
    <div className={overlay} onClick={onClose}>
      <div className={drawerPanel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-6 py-6">
          <div className="flex items-center justify-between">
            <Toggle on={!soundOn} onToggle={onToggleSound} />
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">Mute All</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-6 pb-6">
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
          >
            Back to Casino
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
