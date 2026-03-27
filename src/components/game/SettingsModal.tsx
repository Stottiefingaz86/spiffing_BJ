import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import type { RuleSet } from '@/game/rules/config';
import type { Card, Rank, Suit } from '@/game/domain/card';

type Page = 'main' | 'rules' | 'history';

// ---- Hand history record ----

export interface HandHistoryHand {
  cards: { rank: Rank; suit: Suit }[];
  total: number;
  bet: number;
  outcome: string;
  payout: number;
  ppBet: number;
  ppResult?: string;
  ppPayout: number;
  t1Bet: number;
  t1Result?: string;
  t1Payout: number;
}

export interface RoundHistoryEntry {
  id: number;
  timestamp: number;
  dealerCards: { rank: Rank; suit: Suit }[];
  dealerTotal: number;
  hands: HandHistoryHand[];
  netResult: number;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
  fastAnimations: boolean;
  onToggleFastAnimations: () => void;
  rules: RuleSet;
  history: RoundHistoryEntry[];
}

// ---- Shared components ----

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
        on ? 'bg-purple-500' : 'bg-white/15',
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

function SubpageHeader({ title, onBack, onClose }: { title: string; onBack: () => void; onClose: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
      <button
        type="button"
        onClick={onBack}
        className="flex size-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white active:scale-95"
      >
        <ArrowLeft className="size-5" strokeWidth={2} />
      </button>
      <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
      >
        <X className="size-5" strokeWidth={2} />
      </button>
    </header>
  );
}

const suitSymbol: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const suitColor: Record<Suit, string> = { hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-white/80', spades: 'text-white/80' };

function MiniCard({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <span className={cn('inline-flex items-center gap-px text-xs font-bold', suitColor[suit])}>
      {rank}{suitSymbol[suit]}
    </span>
  );
}

function formatDoubleRule(rule: string): string {
  if (rule === '9_10_11') return '9, 10, or 11';
  if (rule === '10_11') return '10 or 11';
  return 'Any total';
}

// ---- Rules page ----

function RulesPage({ rules, onBack, onClose }: { rules: RuleSet; onBack: () => void; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <SubpageHeader title="Game Rules" onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-white/75">
        <h3 className="mb-3 text-base font-bold text-purple-400">How to Play</h3>
        <p className="mb-4">
          Beat the dealer by getting a hand value closer to 21 without going over.
          Number cards count at face value, face cards (J, Q, K) count as 10,
          and Aces count as 1 or 11.
        </p>
        <p className="mb-5">
          You can play up to 5 hands simultaneously. Place your bets, then Hit
          to take another card, Stand to keep your hand, or Double to double your
          bet and receive exactly one more card.
        </p>

        <h3 className="mb-2 text-base font-bold text-purple-400">Table Rules</h3>
        <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
          <ul className="space-y-2 text-[13px]">
            <li className="flex justify-between">
              <span className="text-white/50">Blackjack pays</span>
              <span className="font-semibold text-white/90">{rules.blackjackPayout}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Dealer</span>
              <span className="font-semibold text-white/90">{rules.dealerHoleRule === 'hit_soft_17' ? 'Hits soft 17' : 'Stands on soft 17'}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Double on</span>
              <span className="font-semibold text-white/90">{formatDoubleRule(rules.doubleOn)}</span>
            </li>
            {rules.insuranceEnabled && (
              <li className="flex justify-between">
                <span className="text-white/50">Insurance</span>
                <span className="font-semibold text-white/90">Offered on dealer Ace</span>
              </li>
            )}
            <li className="flex justify-between">
              <span className="text-white/50">Decks</span>
              <span className="font-semibold text-white/90">6</span>
            </li>
          </ul>
        </div>

        <h3 className="mb-2 text-base font-bold text-purple-400">RNG &amp; Fairness</h3>
        <p className="mb-5">
          Cards are dealt from a 6-deck shoe using a cryptographic random number
          generator. The shoe is reshuffled when penetration reaches the reserve
          threshold, ensuring provably fair outcomes every round.
        </p>

        <h3 className="mb-2 text-base font-bold text-purple-400">Perfect Pairs</h3>
        <p className="mb-2">
          An optional side bet on whether your first two cards form a pair.
        </p>
        <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
          <ul className="space-y-2 text-[13px]">
            <li className="flex justify-between">
              <span className="text-white/50">Perfect Pair <span className="text-white/30">(same rank &amp; suit)</span></span>
              <span className="font-bold text-emerald-400">25 : 1</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Coloured Pair <span className="text-white/30">(same colour)</span></span>
              <span className="font-bold text-emerald-400">12 : 1</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Mixed Pair <span className="text-white/30">(different colour)</span></span>
              <span className="font-bold text-emerald-400">6 : 1</span>
            </li>
          </ul>
        </div>

        <h3 className="mb-2 text-base font-bold text-purple-400">21+3</h3>
        <p className="mb-2">
          An optional side bet using your first two cards and the dealer&rsquo;s
          upcard to form a three-card poker hand.
        </p>
        <div className="mb-5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
          <ul className="space-y-2 text-[13px]">
            <li className="flex justify-between">
              <span className="text-white/50">Suited Trips</span>
              <span className="font-bold text-emerald-400">100 : 1</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Straight Flush</span>
              <span className="font-bold text-emerald-400">40 : 1</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Three of a Kind</span>
              <span className="font-bold text-emerald-400">30 : 1</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Straight</span>
              <span className="font-bold text-emerald-400">10 : 1</span>
            </li>
            <li className="flex justify-between">
              <span className="text-white/50">Flush</span>
              <span className="font-bold text-emerald-400">5 : 1</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---- Hand history page ----

function outcomeColor(outcome: string): string {
  switch (outcome.toLowerCase()) {
    case 'win': case 'blackjack': return 'text-emerald-400';
    case 'lose': case 'bust': return 'text-rose-400';
    default: return 'text-white/60';
  }
}

function HandHistoryPage({
  history,
  onBack,
  onClose,
}: {
  history: RoundHistoryEntry[];
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <SubpageHeader title="Hand History" onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-white/40">
            No hands played yet
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {[...history].reverse().map((round) => {
              const time = new Date(round.timestamp);
              const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={round.id} className="px-5 py-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
                      Round #{round.id} &middot; {timeStr}
                    </span>
                    <span className={cn(
                      'text-xs font-bold tabular-nums',
                      round.netResult > 0 ? 'text-emerald-400' : round.netResult < 0 ? 'text-rose-400' : 'text-white/50',
                    )}>
                      {round.netResult > 0 ? '+' : round.netResult < 0 ? '−' : ''}
                      {formatMoney(Math.abs(round.netResult))}
                    </span>
                  </div>

                  <div className="mb-2 flex items-center gap-2 text-[11px] text-white/50">
                    <span className="font-semibold text-white/40">DEALER</span>
                    <span className="flex gap-1.5">
                      {round.dealerCards.map((c, ci) => (
                        <MiniCard key={ci} rank={c.rank} suit={c.suit} />
                      ))}
                    </span>
                    <span className="ml-auto font-bold text-white/60">{round.dealerTotal}</span>
                  </div>

                  <div className="space-y-1.5">
                    {round.hands.map((h, hi) => (
                      <div key={hi} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px]">
                        <span className="flex shrink-0 gap-1.5">
                          {h.cards.map((c, ci) => (
                            <MiniCard key={ci} rank={c.rank} suit={c.suit} />
                          ))}
                        </span>
                        <span className="font-bold text-white/60">{h.total}</span>
                        <span className={cn('ml-auto font-bold uppercase', outcomeColor(h.outcome))}>
                          {h.outcome}
                        </span>
                        <span className="w-14 text-right font-bold tabular-nums text-white/70">
                          {formatMoney(h.bet)}
                        </span>
                        {(h.ppResult || h.t1Result) && (
                          <div className="flex flex-col text-[9px]">
                            {h.ppResult && (
                              <span className={h.ppPayout > 0 ? 'text-emerald-400' : 'text-white/30'}>PP {h.ppResult}</span>
                            )}
                            {h.t1Result && (
                              <span className={h.t1Payout > 0 ? 'text-emerald-400' : 'text-white/30'}>21+3 {h.t1Result}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main modal ----

export function SettingsModal({
  open,
  onClose,
  soundOn,
  onToggleSound,
  musicOn,
  onToggleMusic,
  fastAnimations,
  onToggleFastAnimations,
  rules,
  history,
}: SettingsModalProps) {
  const [page, setPage] = useState<Page>('main');
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
        if (closingRef.current) {
          setMounted(false);
          setPage('main');
        }
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  const handleClose = () => {
    onClose();
  };

  const isSubpage = page === 'rules' || page === 'history';
  const drawerPanel = cn(
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#1a1525] shadow-2xl sm:mx-4 sm:rounded-2xl',
    'transition-transform duration-300 ease-out',
    isSubpage ? 'h-[85dvh]' : 'max-h-[85dvh]',
    visible ? 'translate-y-0 sm:translate-y-0' : 'translate-y-full sm:translate-y-8',
  );

  const overlay = cn(
    'fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center',
    'transition-opacity duration-300',
    visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
  );

  let content: React.ReactNode;

  if (page === 'rules') {
    content = (
      <div className={overlay} onClick={handleClose}>
        <div className={drawerPanel} onClick={(e) => e.stopPropagation()}>
          <RulesPage rules={rules} onBack={() => setPage('main')} onClose={handleClose} />
        </div>
      </div>
    );
  } else if (page === 'history') {
    content = (
      <div className={overlay} onClick={handleClose}>
        <div className={drawerPanel} onClick={(e) => e.stopPropagation()}>
          <HandHistoryPage history={history} onBack={() => setPage('main')} onClose={handleClose} />
        </div>
      </div>
    );
  } else {
    content = (
      <div className={overlay} onClick={handleClose}>
        <div className={drawerPanel} onClick={(e) => e.stopPropagation()}>
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Settings</h2>
            <button
              type="button"
              onClick={handleClose}
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
            <div className="flex items-center justify-between">
              <Toggle on={musicOn} onToggle={onToggleMusic} />
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">Music</span>
            </div>
            <div className="flex items-center justify-between">
              <Toggle on={fastAnimations} onToggle={onToggleFastAnimations} />
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">Fast Animations</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 px-6 pb-6">
            <button
              type="button"
              onClick={() => setPage('rules')}
              className="rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
            >
              Game Rules
            </button>
            <button
              type="button"
              onClick={() => setPage('history')}
              className="rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
            >
              Hand History
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
            >
              Back to Casino
            </button>
          </div>
        </div>
      </div>
    );
  }

  return createPortal(content, document.body);
}
