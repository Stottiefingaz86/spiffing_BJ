import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isAztecParMathEnabled,
  setAztecParMathDevOverride,
} from '../math/aztecParMath';
import { PAYING_SYMBOLS, TempleSymbol, getLinePayout } from '../engine/symbols';
import {
  AZTEC_SYMBOL1_STANDIN,
  AZTEC_SYMBOL_TEXTURES,
} from '../render/aztecSymbolTextures';

const PAYTABLE_ROW_ORDER: TempleSymbol[] = [
  TempleSymbol.Wild,
  TempleSymbol.Scatter,
  ...PAYING_SYMBOLS,
];

const SYMBOL_HELP_NAME: Record<TempleSymbol, string> = {
  [TempleSymbol.Wild]: 'Wild',
  [TempleSymbol.Scatter]: 'Scatter',
  [TempleSymbol.MaskSilver]: 'Stone mask',
  [TempleSymbol.MaskGreen]: 'Feathered serpent',
  [TempleSymbol.MaskGold]: 'Sun mask',
  [TempleSymbol.MaskPurple]: 'Eagle',
  [TempleSymbol.CreatureTan]: 'Sun medallion',
  [TempleSymbol.BirdRed]: 'Jaguar',
  [TempleSymbol.BirdBlue]: 'Water rite',
};

function symbolTextureSrc(sym: TempleSymbol): string {
  return (
    AZTEC_SYMBOL_TEXTURES[sym] ??
    AZTEC_SYMBOL_TEXTURES[AZTEC_SYMBOL1_STANDIN]!
  );
}

function formatLineCoins(sym: TempleSymbol, n: 3 | 4 | 5): string {
  const v = getLinePayout(sym, n);
  if (v <= 0) return '—';
  return String(v);
}

interface AztecSettingsModalProps {
  open: boolean;
  onClose: () => void;
  sfxOn: boolean;
  bgmOn: boolean;
  onToggleSfx: () => void;
  onToggleBgm: () => void;
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

export function AztecSettingsModal({
  open,
  onClose,
  sfxOn,
  bgmOn,
  onToggleSfx,
  onToggleBgm,
}: AztecSettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);
  const isDev = import.meta.env.DEV;
  const [parMathOn, setParMathOn] = useState(true);

  useEffect(() => {
    if (open && isDev) {
      setParMathOn(isAztecParMathEnabled());
    }
  }, [open, isDev]);

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
    'relative mx-0 flex w-full max-w-md max-h-[85dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1518] shadow-2xl sm:mx-4 sm:rounded-2xl',
    'transition-transform duration-300 ease-out',
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
        <header className="shrink-0 flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Aztec</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4',
              'text-sm leading-relaxed text-white/75',
            )}
          >
            <div className="space-y-4 pb-1">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200/90">Paytable</h3>
                <p className="mt-1 text-[11px] leading-snug text-white/45">
                  Line wins: coin amounts × your line bet (same rules as the reels
                  {isDev ? (parMathOn ? '; PAR sheet paytable' : '; classic paytable') : ''}).
                </p>
                <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/25">
                  <div className="grid grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,0.85fr))] gap-x-1 border-b border-white/10 px-2 py-2 sm:px-3">
                    <span className="pl-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      Symbol
                    </span>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      ×3
                    </span>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      ×4
                    </span>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      ×5
                    </span>
                  </div>
                  {PAYTABLE_ROW_ORDER.map((sym) => {
                    const p3 = getLinePayout(sym, 3);
                    const p4 = getLinePayout(sym, 4);
                    const p5 = getLinePayout(sym, 5);
                    const noDirectPay = p3 <= 0 && p4 <= 0 && p5 <= 0;
                    return (
                      <div
                        key={sym}
                        className="grid grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,0.85fr))] items-center gap-x-1 border-b border-white/[0.06] px-2 py-2 last:border-b-0 sm:px-3"
                      >
                        <div className="flex min-w-0 items-center gap-2 pl-0.5">
                          <img
                            src={symbolTextureSrc(sym)}
                            alt=""
                            className="size-9 shrink-0 rounded-md bg-black/40 object-contain p-0.5 ring-1 ring-white/10 sm:size-10"
                            draggable={false}
                          />
                          <span className="truncate text-xs font-medium text-white/85">
                            {SYMBOL_HELP_NAME[sym]}
                          </span>
                        </div>
                        <span className="text-center text-xs font-bold tabular-nums text-amber-100/95">
                          {formatLineCoins(sym, 3)}
                        </span>
                        <span className="text-center text-xs font-bold tabular-nums text-amber-100/95">
                          {formatLineCoins(sym, 4)}
                        </span>
                        <span className="text-center text-xs font-bold tabular-nums text-amber-100/95">
                          {formatLineCoins(sym, 5)}
                        </span>
                        {noDirectPay && sym === TempleSymbol.Wild ? (
                          <p className="col-span-4 -mt-0.5 px-1 pb-1 text-[10px] leading-snug text-white/35">
                            Substitutes for paying symbols. Three or more wilds on a line from the left trigger free falls.
                            No separate wild coin row on the PAR sheet.
                          </p>
                        ) : null}
                        {noDirectPay && sym === TempleSymbol.Scatter ? (
                          <p className="col-span-4 -mt-0.5 px-1 pb-1 text-[10px] leading-snug text-white/35">
                            Does not pay as a line symbol in this build; shown for artwork reference.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <p>
                <strong className="text-amber-200/90">5×3</strong>,{' '}
                <strong className="text-amber-200/90">20 fixed bet lines</strong>. Wins need at least one symbol on reel 1
                and adjacent matches left-to-right; highest win per line only.
              </p>
              <p>
                <strong className="text-amber-200/90">After a win:</strong> winning line symbols are removed; others drop and
                new symbols fall. You can chain multiple wins in one round; multipliers cap at{' '}
                <strong className="text-white">×5</strong> (main) and <strong className="text-white">×15</strong> (free
                falls), with higher steps using the max after that.
              </p>
              <p>
                <strong className="text-amber-200/90">Free falls:</strong> <strong className="text-white">3+ wilds</strong>{' '}
                <strong className="text-white">in a row on a bet line from the left</strong> award{' '}
                <strong className="text-white">10</strong> free falls per qualifying line (e.g. two lines → 20). Retriggers
                add the same way during the feature. There is no separate scatter / free-fall symbol on the PAR strips.
              </p>
              <p>
                <strong className="text-amber-200/90">Wild</strong> can land on any reel and substitutes for paying symbols
                on lines.{' '}
                <em className="text-white/50">RTP ~95.97% is a design reference; this demo math is not certified.</em>
              </p>
            </div>
          </div>

          <footer className="shrink-0 space-y-2 border-t border-white/10 bg-[#141014] px-5 py-3">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
              <div className="pr-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Music</span>
                <p className="mt-0.5 text-[11px] leading-snug text-white/40">Background loop</p>
              </div>
              <Toggle on={bgmOn} onToggle={onToggleBgm} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
              <div className="pr-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Sound effects</span>
                <p className="mt-0.5 text-[11px] leading-snug text-white/40">Spins, wins, reels</p>
              </div>
              <Toggle on={sfxOn} onToggle={onToggleSfx} />
            </div>
            {isDev ? (
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-4 py-3">
                <div className="pr-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">PAR math</span>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/45">Dev only — strips + sheet paytable</p>
                </div>
                <Toggle
                  on={parMathOn}
                  onToggle={() => {
                    const next = !parMathOn;
                    setParMathOn(next);
                    setAztecParMathDevOverride(next);
                  }}
                />
              </div>
            ) : null}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
