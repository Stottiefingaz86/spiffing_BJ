import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { publicAssetUrl } from '@/lib/publicUrl';
import { BanditSymbol, PAYTABLE, type PaytableEntry } from '../engine/symbols';

interface BanditSettingsProps {
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
        on ? 'bg-amber-600' : 'bg-white/15',
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

const SYMBOL_IMAGES: Partial<Record<BanditSymbol, string>> = {
  [BanditSymbol.Wild]: publicAssetUrl('bandits/WILD.png'),
  [BanditSymbol.Scatter]: publicAssetUrl('bandits/scatter.png'),
  [BanditSymbol.Revolver]: publicAssetUrl('bandits/bullion.png'),
  [BanditSymbol.Shotgun]: publicAssetUrl('bandits/FLASH.png'),
  [BanditSymbol.Dynamite]: publicAssetUrl('bandits/DYNAMITE.png'),
  [BanditSymbol.Boots]: publicAssetUrl('bandits/goldbag.png'),
  [BanditSymbol.Horseshoe]: publicAssetUrl('bandits/SKULL_SYMBOL.png'),
  [BanditSymbol.King]: publicAssetUrl('bandits/k.png'),
  [BanditSymbol.Queen]: publicAssetUrl('bandits/q.png'),
  [BanditSymbol.Jack]: publicAssetUrl('bandits/J.png'),
  [BanditSymbol.Ace]: publicAssetUrl('bandits/a.png'),
};

const SYMBOL_DISPLAY_NAMES: Partial<Record<BanditSymbol, string>> = {
  [BanditSymbol.Wild]: 'Wild',
  [BanditSymbol.Revolver]: 'Bullion',
  [BanditSymbol.Shotgun]: 'Flask',
  [BanditSymbol.Dynamite]: 'Dynamite',
  [BanditSymbol.Boots]: 'Gold Bag',
  [BanditSymbol.Horseshoe]: 'Skull',
  [BanditSymbol.King]: 'King',
  [BanditSymbol.Queen]: 'Queen',
  [BanditSymbol.Jack]: 'Jack',
  [BanditSymbol.Ace]: 'Ace',
};

const PAYTABLE_ORDER: BanditSymbol[] = [
  BanditSymbol.Wild,
  BanditSymbol.Revolver,
  BanditSymbol.Shotgun,
  BanditSymbol.Dynamite,
  BanditSymbol.Boots,
  BanditSymbol.Horseshoe,
  BanditSymbol.King,
  BanditSymbol.Queen,
  BanditSymbol.Jack,
  BanditSymbol.Ace,
];

function PaytableTab() {
  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5" style={{ maxHeight: 'calc(85dvh - 120px)' }}>
      {/* Symbol Payouts */}
      <div>
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400/80">Symbol Payouts</h3>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/40">
              <th className="pb-2 text-left font-medium">Symbol</th>
              <th className="pb-2 text-right font-medium">x3</th>
              <th className="pb-2 text-right font-medium">x4</th>
              <th className="pb-2 text-right font-medium">x5</th>
            </tr>
          </thead>
          <tbody>
            {PAYTABLE_ORDER.map((sym) => {
              const entry = PAYTABLE[sym] as PaytableEntry | undefined;
              const img = SYMBOL_IMAGES[sym];
              const name = SYMBOL_DISPLAY_NAMES[sym] ?? sym;
              if (!entry) return null;
              return (
                <tr key={sym} className="border-t border-white/5">
                  <td className="flex items-center gap-2.5 py-2">
                    {img && (
                      <img
                        src={img}
                        alt={name}
                        className="size-8 rounded object-contain"
                      />
                    )}
                    <span className="text-xs font-medium text-white/80">{name}</span>
                  </td>
                  <td className="py-2 text-right text-xs tabular-nums text-white/70">{entry.three}</td>
                  <td className="py-2 text-right text-xs tabular-nums text-white/70">{entry.four}</td>
                  <td className="py-2 text-right text-xs tabular-nums text-white/70">{entry.five}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] leading-relaxed text-white/30">Payouts shown as multiplier of coin value (bet / 25 lines).</p>
      </div>

      {/* Wild */}
      <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3">
          <img src={publicAssetUrl('bandits/WILD.png')} alt="Wild" className="size-10 rounded object-contain" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">Wild</h4>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">Substitutes for all symbols except Scatter. Appears on all reels.</p>
          </div>
        </div>
      </div>

      {/* Scatter */}
      <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3">
          <img src={publicAssetUrl('bandits/scatter.png')} alt="Scatter" className="size-10 rounded object-contain" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">Scatter</h4>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">3 or more Scatters anywhere trigger Free Spins.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          {[
            { count: 3, spins: 10 },
            { count: 4, spins: 20 },
            { count: 5, spins: 40 },
          ].map((s) => (
            <div key={s.count} className="flex-1 rounded-lg bg-white/5 py-2 text-center">
              <span className="block text-[10px] font-bold text-white/40">x{s.count}</span>
              <span className="block text-sm font-bold tabular-nums text-white/80">{s.spins}</span>
              <span className="block text-[9px] text-white/30">spins</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wild Features */}
      <div>
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400/80">Wild Features</h3>
        <p className="mb-3 text-[11px] leading-relaxed text-white/40">On any spin, a random Wild feature may trigger (12% chance) after reels stop:</p>
        <div className="flex flex-col gap-2">
          {[
            { name: 'Lasso', desc: 'Turns an entire reel Wild.' },
            { name: 'Dynamite Blast', desc: 'Creates a 2x2 block of Wilds.' },
            { name: 'Shotgun Spray', desc: 'Scatters 2-5 random Wilds across the grid.' },
          ].map((f) => (
            <div key={f.name} className="rounded-lg border border-white/5 bg-white/[0.02] px-3.5 py-2.5">
              <span className="text-[11px] font-bold text-white/70">{f.name}</span>
              <span className="ml-1.5 text-[11px] text-white/40">{f.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Free Spin Modes */}
      <div>
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400/80">Free Spin Modes</h3>
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-white/70">Standard</span>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">All wins are paid directly to your balance.</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-white/70">Gamble</span>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">Wins accumulate in a Gamble Pot. A thumbs-up doubles the pot, thumbs-down loses it all.</p>
          </div>
        </div>
      </div>

      {/* Game Rules */}
      <div>
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400/80">Game Rules</h3>
        <ul className="flex flex-col gap-1.5 text-[11px] leading-relaxed text-white/40">
          <li>25 fixed paylines, wins pay left to right.</li>
          <li>Only the highest win per payline is paid.</li>
          <li>Wild substitutes for all symbols except Scatter.</li>
          <li>Scatter wins are independent of paylines.</li>
          <li>Bonus Buy available for 100x bet (10 free spins).</li>
          <li>Malfunction voids all pays and plays.</li>
        </ul>
      </div>
    </div>
  );
}

type Tab = 'settings' | 'paytable';

export function BanditSettings({
  open,
  onClose,
  soundOn,
  onToggleSound,
}: BanditSettingsProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>('settings');
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
        if (closingRef.current) {
          setMounted(false);
          setTab('settings');
        }
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  const drawerPanel = cn(
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1008] shadow-2xl sm:mx-4 sm:rounded-2xl',
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
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex gap-1">
            {(['settings', 'paytable'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors',
                  tab === t
                    ? 'bg-amber-600/20 text-amber-400'
                    : 'text-white/40 hover:bg-white/5 hover:text-white/60',
                )}
              >
                {t === 'settings' ? 'Settings' : 'Paytable'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </header>

        {tab === 'settings' ? (
          <>
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
          </>
        ) : (
          <PaytableTab />
        )}
      </div>
    </div>,
    document.body,
  );
}
