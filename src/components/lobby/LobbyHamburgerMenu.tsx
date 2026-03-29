import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slotGlassPill } from '@/components/game/slotChrome';

const menuItemClass =
  'flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white/[0.1] active:bg-white/[0.07] sm:px-3.5 sm:py-3 sm:text-xs sm:tracking-[0.16em]';

/** Minimal 3-line menu — compact, even strokes, round caps */
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0 text-current', className)}
      width={14}
      height={10}
      viewBox="0 0 14 10"
      fill="none"
      aria-hidden
    >
      <path
        d="M1 1.25h12M1 5h12M1 8.75h12"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LobbyHamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const menuId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);

  const updatePanelPosition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(280, typeof window !== 'undefined' ? window.innerWidth - 16 : 280);
    let left = r.left;
    const pad = 8;
    if (left + maxW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - maxW - pad);
    }
    setPanelStyle({
      top: r.bottom + 6,
      left,
      width: maxW,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const portal =
    open &&
    typeof document !== 'undefined' &&
    panelStyle &&
    createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[9998] cursor-default bg-black/55 backdrop-blur-[2px]"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
        <div
          id={menuId}
          role="menu"
          className={cn(
            slotGlassPill,
            'fixed z-[9999] rounded-2xl border border-white/[0.14] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.55)]',
          )}
          style={{
            top: panelStyle.top,
            left: panelStyle.left,
            width: panelStyle.width,
          }}
        >
          <nav className="font-staatliches flex flex-col gap-0.5" aria-label="Lobby navigation">
            <a
              role="menuitem"
              href="/"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              Lobby
            </a>
            <a
              role="menuitem"
              href="#games"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              Games
            </a>
            <button
              type="button"
              role="menuitem"
              disabled
              className={cn(menuItemClass, 'cursor-not-allowed text-left text-white/38')}
              title="Coming soon"
            >
              Work
            </button>
            <a
              role="menuitem"
              href="mailto:hello@spiffingstudios.com?subject=Spiffing%20studio%20demo"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              Contact
            </a>
          </nav>
        </div>
      </>,
      document.body,
    );

  return (
    <div className="relative flex justify-start">
      <button
        ref={btnRef}
        type="button"
        className={cn(
          slotGlassPill,
          'flex h-10 w-10 shrink-0 items-center justify-center backdrop-blur-md text-white/65 hover:text-white active:scale-[0.94] sm:h-11 sm:w-11',
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X className="size-[14px] sm:size-[15px]" strokeWidth={1.5} />
        ) : (
          <MenuIcon />
        )}
      </button>
      {portal}
    </div>
  );
}
