import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Home, Hand, Menu, RefreshCw, RotateCcw, Settings, Volume2, VolumeX, X, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GamePreloader } from '@/components/GamePreloader';
import { addMoney } from '@/game/domain/money';
import { GameSession } from '@/game/engine/session';
import { isBlackjack, scoreHand } from '@/game/rules/scoring';
import { GamePhase } from '@/game/state/phases';
import type { HandIndex } from '@/game/state/table-state';
import { AnimatedBalance, type RoundResult } from '@/components/game/AnimatedBalance';
import { formatMoney } from '@/lib/formatMoney';
import { PixiTableCanvas } from '@/render/pixi/PixiTableCanvas';
import { SettingsModal, type RoundHistoryEntry } from '@/components/game/SettingsModal';
import {
  playSfx,
  playSfxPitched,
  preloadBgm,
  preloadSfx,
  setBgmMuted,
  setSfxMuted,
  startBgm,
  stopBgm,
  unlockAudio,
} from '@/audio/sfx';
import { setAnimationSpeed } from '@/render/pixi/cardFlights';

const headerGlassPill =
  'rounded-[14px] bg-white/[0.10] sm:bg-white/[0.06] sm:backdrop-blur-xl border border-white/[0.07] shadow-[0_0_20px_rgba(168,85,247,0.06)]';

const BJ_ASSET_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';
/** `public/cards/multihand logo.png` */
const BJ_MULTIHAND_LOGO_SRC = `${BJ_ASSET_BASE}cards/multihand%20logo.png`;

/** Vertical band reserved in Pixi so dealer/cards/betting sit below the HTML logo overlay. */
/** Mobile uses a smaller HTML logo stack after trim — keep inset tight so felt isn’t pushed down too far */
const PIXI_TOP_INSET = { belowLg: 100, lgUp: 96 } as const;

function usePixiTopInsetPx(): number {
  const [px, setPx] = useState(PIXI_TOP_INSET.belowLg);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setPx(mq.matches ? PIXI_TOP_INSET.lgUp : PIXI_TOP_INSET.belowLg);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return px;
}

function DealActionButton({
  children,
  className,
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-auto min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] text-[11px] font-bold tracking-[0.06em] shadow-none lg:aspect-[2/3] lg:gap-2 lg:text-xs',
        className,
      )}
    >
      {children}
    </Button>
  );
}

function PlayActionButton({
  children,
  className,
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-auto min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border-2 bg-white/[0.08] sm:bg-white/[0.06] sm:backdrop-blur-md text-[11px] font-bold tracking-[0.06em] shadow-none hover:bg-white/[0.12] active:scale-[0.97] disabled:opacity-40 lg:aspect-[2/3] lg:rounded-[14px] lg:gap-2 lg:text-xs',
        className,
      )}
    >
      {children}
    </Button>
  );
}

function handleBJPreloaderPlay() {
  unlockAudio();
  preloadBgm();
  preloadSfx();
  startBgm();
}

export default function GameClient() {
  return (
    <GamePreloader onPlay={handleBJPreloaderPlay} assets={[BJ_MULTIHAND_LOGO_SRC]}>
      <BlackjackGame />
    </GamePreloader>
  );
}

function BlackjackGame() {
  const sessionRef = useRef<GameSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new GameSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [selectedChipCents, setSelectedChipCents] = useState(500);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [fastAnimations, setFastAnimations] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setAnimationSpeed(fastAnimations);
  }, [fastAnimations]);

  const spd = useCallback((ms: number) => (fastAnimations ? ms / 2 : ms), [fastAnimations]);
  const [handHistory, setHandHistory] = useState<RoundHistoryEntry[]>([]);
  const roundCounterRef = useRef(0);

  useEffect(() => {
    setSfxMuted(!soundOn);
    setBgmMuted(!soundOn || !musicOn);
  }, [soundOn, musicOn]);

  useEffect(() => {
    const handler = () => {
      unlockAudio();
      preloadBgm();
      preloadSfx();
      startBgm();
    };
    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [headerMenuOpen]);

  useEffect(() => {
    const handler = () => {
      unlockAudio();
      preloadBgm();
      preloadSfx();
      startBgm();
    };
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  useEffect(() => () => stopBgm(), []);

  /** Advance the shoe one card at a time while the engine is in the dealing phase. */
  useEffect(() => {
    if (snap.phase !== GamePhase.Dealing) return;
    playSfx('cardDeal', 0.4);
    const id = window.setTimeout(() => {
      session.dispatch({ type: 'DEAL_NEXT_CARD' });
      refresh();
    }, spd(180));
    return () => window.clearTimeout(id);
  }, [snap.phase, snap.revision, session, refresh, spd]);

  /** Brief pause after a hand ends so the rail / next hero transition reads clearly. */
  useEffect(() => {
    if (snap.phase !== GamePhase.HandTransition) return;
    const id = window.setTimeout(() => {
      session.dispatch({ type: 'COMPLETE_HAND_TRANSITION' });
      refresh();
    }, spd(720));
    return () => window.clearTimeout(id);
  }, [snap.phase, snap.revision, session, refresh, spd]);

  const prevDealerAllUpRef = useRef(false);
  const prevDealerCardCountRef = useRef(0);

  /** Reveal dealer hole, pause, then each hit / settle step with readable cadence. */
  useEffect(() => {
    if (snap.phase !== GamePhase.DealerTurn) {
      prevDealerAllUpRef.current = false;
      prevDealerCardCountRef.current = 0;
      return;
    }
    const allUp = snap.dealer.hand.cards.every((c) => c.faceUp);
    const wasAllUp = prevDealerAllUpRef.current;
    const prevCount = prevDealerCardCountRef.current;
    prevDealerAllUpRef.current = allUp;
    prevDealerCardCountRef.current = snap.dealer.hand.cards.length;

    const justRevealedHole = allUp && !wasAllUp;
    const drewNewCard = snap.dealer.hand.cards.length > prevCount && prevCount > 0;

    if (justRevealedHole) {
      playSfx('cardFlip', 0.5);
    } else if (drewNewCard) {
      playSfx('cardDeal', 0.4);
    }

    const id = window.setTimeout(() => {
      session.dispatch({ type: 'DEALER_PLAY_STEP' });
      refresh();
    }, spd(justRevealedHole ? 1200 : 900));
    return () => window.clearTimeout(id);
  }, [snap.phase, snap.revision, session, refresh, spd]);

  const prevSettlementIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (snap.phase !== GamePhase.Settlement) {
      prevSettlementIdxRef.current = null;
      return;
    }

    if (
      snap.settlementRevealIndex !== null &&
      snap.settlementRevealIndex !== prevSettlementIdxRef.current
    ) {
      const seat = snap.seats[snap.settlementRevealIndex];
      if (seat?.settlement) {
        const k = seat.settlement.kind;
        if (k === 'win' || k === 'blackjack') {
          playSfx('win', 0.5);
        }
      }
    }
    prevSettlementIdxRef.current = snap.settlementRevealIndex;

    const isFirst = snap.settlementRevealIndex === null;
    const id = window.setTimeout(() => {
      session.dispatch({ type: 'SETTLE_NEXT_HAND' });
      refresh();
    }, spd(isFirst ? 350 : 550));
    return () => window.clearTimeout(id);
  }, [snap.phase, snap.revision, session, refresh, spd]);

  const prevSideBetResultsRef = useRef(false);
  useEffect(() => {
    const hasSideBetResults = snap.seats.some((s) => s.ppResult || s.twentyOneResult);
    if (hasSideBetResults && !prevSideBetResultsRef.current) {
      const anyWin = snap.seats.some(
        (s) => s.ppResult?.won || s.twentyOneResult?.won,
      );
      if (anyWin) playSfx('win', 0.5);
    }
    prevSideBetResultsRef.current = hasSideBetResults;
  }, [snap.revision, snap.seats]);

  const prevPhaseForHistoryRef = useRef(snap.phase);
  useEffect(() => {
    const prev = prevPhaseForHistoryRef.current;
    prevPhaseForHistoryRef.current = snap.phase;
    if (snap.phase !== GamePhase.RoundComplete || prev === GamePhase.RoundComplete) return;

    roundCounterRef.current += 1;
    const dealerCards = snap.dealer.hand.cards.map((c) => ({ rank: c.rank, suit: c.suit }));
    const dealerTotal = scoreHand(snap.dealer.hand.cards).total;
    const hands = snap.seats
      .filter((s) => s.inRound && s.hand.cards.length > 0)
      .map((s) => {
        const sc = scoreHand(s.hand.cards);
        return {
          cards: s.hand.cards.map((c) => ({ rank: c.rank, suit: c.suit })),
          total: sc.bust ? sc.total : sc.total,
          bet: s.bet,
          outcome: s.settlement?.kind ?? 'unknown',
          payout: s.settlement?.payout ?? 0,
          ppBet: s.ppBet,
          ppResult: s.ppResult?.name,
          ppPayout: s.ppResult?.won ? s.ppResult.payout : 0,
          t1Bet: s.twentyOneBet,
          t1Result: s.twentyOneResult?.name,
          t1Payout: s.twentyOneResult?.won ? s.twentyOneResult.payout : 0,
        };
      });
    const netResult = snap.balance - snap.balanceBeforeDeal;
    const entry: RoundHistoryEntry = {
      id: roundCounterRef.current,
      timestamp: Date.now(),
      dealerCards,
      dealerTotal,
      hands,
      netResult,
    };
    setHandHistory((prev) => [...prev.slice(-49), entry]);
  }, [snap.phase, snap.revision, snap.seats, snap.dealer, snap.balance, snap.balanceBeforeDeal]);

  const onMainBet = useCallback(
    (seat: HandIndex) => {
      session.dispatch({ type: 'PLACE_BET', seat, chipValue: selectedChipCents });
      playSfx('chipStack', 0.5);
      refresh();
    },
    [session, selectedChipCents, refresh],
  );

  const onSideBet = useCallback(
    (seat: HandIndex, kind: 'pp' | '21+3') => {
      session.dispatch({ type: 'PLACE_SIDE_BET', seat, kind, chipValue: selectedChipCents });
      playSfx('chipStack', 0.5);
      refresh();
    },
    [session, selectedChipCents, refresh],
  );

  const onSelectChip = useCallback((cents: number) => {
    setSelectedChipCents(cents);
    playSfx('buttonClick', 0.4);
  }, []);

  const betting = snap.phase === GamePhase.Betting;
  const insuranceOffering = snap.phase === GamePhase.InsuranceOffer;
  const playing = snap.phase === GamePhase.PlayerTurn;
  const roundDone = snap.phase === GamePhase.RoundComplete;

  const roundResult: RoundResult | null = (() => {
    if (snap.phase !== GamePhase.RoundComplete) return null;
    const delta = snap.balance - snap.balanceBeforeDeal;
    const label = delta > 0 ? 'YOU WON' : delta < 0 ? 'YOU LOST' : 'PUSH';
    return { label, payout: delta };
  })();

  const canDouble = (() => {
    if (!playing || snap.activeSeatIndex === null) return false;
    if (!session.operator.enabledActions.double) return false;
    const s = snap.seats[snap.activeSeatIndex];
    if (s.status !== 'active' || s.hand.cards.length !== 2) return false;
    if (isBlackjack(s.hand.cards)) return false;

    const { total } = scoreHand(s.hand.cards);
    const rule = session.operator.rules.doubleOn;
    if (rule === '9_10_11' && total !== 9 && total !== 10 && total !== 11) return false;
    if (rule === '10_11' && total !== 10 && total !== 11) return false;

    if (snap.balance < s.bet) return false;
    if (addMoney(s.bet, s.bet) > session.operator.tableLimits.maxBet) return false;
    return true;
  })();

  const totalBet = snap.seats.reduce((sum, s) => sum + s.bet + s.ppBet + s.twentyOneBet, 0);

  const pixiTopInsetPx = usePixiTopInsetPx();

  return (
    <div
      className="game-bg box-border flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden text-white"
    >
      <header className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-500 motion-safe:fill-mode-both flex shrink-0 items-center gap-2.5 px-3 pb-1.5 pt-[max(1rem,calc(env(safe-area-inset-top)+0.25rem))] sm:gap-3 lg:px-12 lg:pb-3 lg:pt-8">
        <a
          href="/"
          className={cn(
            headerGlassPill,
            'flex size-10 shrink-0 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.94]',
          )}
          aria-label="Back to lobby"
        >
          <Home className="size-[17px]" strokeWidth={1.8} />
        </a>

        <div
          id="header-nav-tools"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            className={cn(headerGlassPill, 'flex size-10 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.94]')}
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-[17px]" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={cn(headerGlassPill, 'flex size-10 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.94]')}
            aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
            onClick={() => setSoundOn((v) => !v)}
          >
            {soundOn ? (
              <Volume2 className="size-[17px]" strokeWidth={1.8} />
            ) : (
              <VolumeX className="size-[17px]" strokeWidth={1.8} />
            )}
          </button>
        </div>

        <div
          className={cn(
            headerGlassPill,
            'ml-auto flex h-10 min-w-0 items-center gap-2.5 overflow-visible px-3.5 hover:bg-white/10 sm:gap-3 sm:px-4',
          )}
        >
          <span className="shrink-0 text-[8px] font-semibold uppercase leading-none tracking-[0.18em] text-white/45 sm:text-[9px]">
            {session.operator.copy.balanceLabel}
          </span>
          <AnimatedBalance
            cents={snap.balance}
            className="text-base font-bold leading-none text-white sm:text-lg lg:text-xl"
            roundResult={roundResult}
          />
        </div>
      </header>

      <div className="relative isolate mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-2 px-3 pb-2 lg:gap-3 lg:px-12 lg:pb-4">
        <div className="relative z-0 hidden w-[118px] shrink-0 lg:block" aria-hidden="true" />
        <PixiTableCanvas
          snapshot={snap}
          selectedChipCents={selectedChipCents}
          onSelectChip={onSelectChip}
          onMainBet={onMainBet}
          onSideBet={onSideBet}
          contentInsetTopPx={pixiTopInsetPx}
          className="relative z-0 min-h-0 min-w-0 flex-1 overflow-hidden"
        />

        <aside className="relative z-10 hidden min-h-0 w-[118px] shrink-0 flex-col justify-center gap-2.5 lg:flex">
          {betting ? (
            <>
              <DealActionButton
                onClick={() => {
                  preloadBgm();
                  preloadSfx();
                  session.dispatch({ type: 'DEAL' });
                  refresh();
                }}
                className="border-0 bg-[#22c55e] text-white hover:bg-[#2dd468]"
              >
                <Zap className="size-[22px] fill-white/95 text-white" strokeWidth={2.5} />
                {session.operator.copy.deal}
                {totalBet > 0 && (
                  <span className="-mt-0.5 text-[11px] font-bold text-white/80">{formatMoney(totalBet)}</span>
                )}
              </DealActionButton>
              <DealActionButton
                onClick={() => {
                  session.dispatch({ type: 'UNDO_LAST_BET' });
                  playSfxPitched('chipStack', 0.65, 0.5);
                  refresh();
                }}
                className="border border-white/35 bg-transparent text-white hover:bg-white/[0.06]"
              >
                <RotateCcw className="size-[22px]" strokeWidth={2} />
                {session.operator.copy.undo}
              </DealActionButton>
              <DealActionButton
                onClick={() => {
                  session.dispatch({ type: 'CLEAR_ALL_BETS' });
                  playSfxPitched('chipStack', 0.65, 0.5);
                  refresh();
                }}
                className="border border-white/35 bg-transparent text-white hover:bg-white/[0.06]"
              >
                <X className="size-[22px]" strokeWidth={2} />
                {session.operator.copy.clear}
              </DealActionButton>
            </>
          ) : insuranceOffering ? (
            <>
              <PlayActionButton
                onClick={() => {
                  session.dispatch({ type: 'TAKE_INSURANCE' });
                  refresh();
                }}
                className="border-amber-400/90 text-amber-200 hover:bg-amber-500/10"
              >
                <span className="text-base font-black leading-none">✓</span>
                INSURE
              </PlayActionButton>
              <PlayActionButton
                onClick={() => {
                  session.dispatch({ type: 'DECLINE_INSURANCE' });
                  refresh();
                }}
                className="border-white/50 text-white/80 hover:bg-white/[0.06]"
              >
                <X className="size-[22px]" strokeWidth={2} />
                NO INSURANCE
              </PlayActionButton>
            </>
          ) : playing ? (
            <>
              <PlayActionButton
                onClick={() => {
                  session.dispatch({ type: 'HIT' });
                  playSfx('cardFlip', 0.5);
                  refresh();
                }}
                className="border-emerald-400/90 text-emerald-300 hover:bg-emerald-500/10"
              >
                <Zap className="size-[22px] text-emerald-400" strokeWidth={2.5} fill="currentColor" />
                {session.operator.copy.hit}
              </PlayActionButton>
              <PlayActionButton
                onClick={() => {
                  session.dispatch({ type: 'STAND' });
                  playSfx('stand', 0.5);
                  refresh();
                }}
                className="border-pink-400/90 text-pink-100 hover:bg-pink-500/12"
              >
                <Hand className="size-[22px] text-pink-400" strokeWidth={2.2} />
                {session.operator.copy.stand}
              </PlayActionButton>
              {canDouble ? (
                <PlayActionButton
                  onClick={() => {
                    session.dispatch({ type: 'DOUBLE' });
                    playSfx('chipStack', 0.5);
                    refresh();
                  }}
                  className="border-white/75 text-white hover:bg-white/10"
                >
                  <span className="text-lg font-black leading-none tracking-tight">×2</span>
                  {session.operator.copy.double}
                </PlayActionButton>
              ) : null}
            </>
          ) : roundDone ? (
            <>
              <DealActionButton
                disabled={!snap.seats.some((s) => s.inRound && s.bet > 0)}
                onClick={() => {
                  session.dispatch({ type: 'REBET_LAST' });
                  playSfx('chipStack', 0.5);
                  refresh();
                }}
                className="border-0 bg-emerald-500 text-white hover:bg-emerald-400"
              >
                <RotateCcw className="size-[22px]" strokeWidth={2} />
                {session.operator.copy.rebet}
              </DealActionButton>
              <DealActionButton
                disabled={!snap.seats.some((s) => s.inRound && s.bet > 0)}
                onClick={() => {
                  session.dispatch({ type: 'REBET_DOUBLE' });
                  playSfx('chipStack', 0.5);
                  refresh();
                }}
                className="border-0 bg-amber-500 text-white hover:bg-amber-400"
              >
                <span className="text-lg font-black leading-none tracking-tight">×2</span>
                REBET x2
              </DealActionButton>
              <DealActionButton
                onClick={() => {
                  session.dispatch({ type: 'ACK_ROUND_COMPLETE' });
                  refresh();
                }}
                className="border border-white/35 bg-transparent text-white hover:bg-white/[0.06]"
              >
                <Zap className="size-[22px]" strokeWidth={2} />
                New round
              </DealActionButton>
            </>
          ) : null}
        </aside>

        {/*
          Last in tree + z-30: full felt (Pixi) paints underneath; logo/subtitle are purely decorative.
          pointer-events-none keeps chips and betting spots usable under the art.
        */}
        <div className="pointer-events-none absolute left-1/2 top-1 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col items-center gap-1 px-2 sm:top-1.5 lg:top-2">
          <h1 className="m-0 flex justify-center">
            <img
              src={BJ_MULTIHAND_LOGO_SRC}
              alt="Multi-Hand Blackjack"
              className="h-[4rem] w-auto max-w-[min(92vw,640px)] object-contain object-center drop-shadow-[0_4px_28px_rgba(0,0,0,0.72)] sm:h-[4.75rem] lg:h-[5.75rem]"
              decoding="async"
            />
          </h1>
          <p className="m-0 max-w-[min(92vw,520px)] text-center text-[8px] font-medium uppercase leading-tight tracking-[0.12em] text-white/65 lg:text-[11px] lg:tracking-[0.14em]">
            {session.operator.copy.gameSubtitle}
          </p>
        </div>
      </div>

      {/* ---- Mobile action bar (single row, always visible during relevant phases) ---- */}
      {insuranceOffering ? (
        <section className="mx-auto flex w-full max-w-md shrink-0 gap-2 px-3 pb-2 pt-0.5 lg:hidden">
          <PlayActionButton
            onClick={() => {
              session.dispatch({ type: 'TAKE_INSURANCE' });
              refresh();
            }}
            className="min-h-[3rem] flex-1 flex-row gap-2 rounded-xl border-amber-400/90 text-[11px] text-amber-200"
          >
            <span className="text-sm font-black leading-none">✓</span>
            INSURE
          </PlayActionButton>
          <PlayActionButton
            onClick={() => {
              session.dispatch({ type: 'DECLINE_INSURANCE' });
              refresh();
            }}
            className="min-h-[3rem] flex-1 flex-row gap-2 rounded-xl border-white/50 text-[11px] text-white/80"
          >
            <X className="size-4" strokeWidth={2} />
            NO
          </PlayActionButton>
        </section>
      ) : null}

      {(playing || snap.phase === GamePhase.HandTransition || snap.phase === GamePhase.Dealing) ? (
        <section className="mx-auto flex w-full max-w-md shrink-0 justify-center gap-2.5 px-4 pb-3 pt-1 lg:hidden">
          <button
            type="button"
            disabled={!playing}
            onClick={() => { session.dispatch({ type: 'STAND' }); playSfx('stand', 0.5); refresh(); }}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-pink-400/70 bg-pink-500/20 active:scale-[0.97] disabled:opacity-40"
          >
            <Hand className="size-7 text-pink-400" strokeWidth={2.2} />
            <span className="text-xs font-extrabold tracking-wider text-white">{session.operator.copy.stand}</span>
          </button>
          <button
            type="button"
            disabled={!playing}
            onClick={() => { session.dispatch({ type: 'HIT' }); playSfx('cardFlip', 0.5); refresh(); }}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/25 active:scale-[0.97] disabled:opacity-40"
          >
            <Zap className="size-7 text-emerald-400" strokeWidth={2.5} fill="currentColor" />
            <span className="text-xs font-extrabold tracking-wider text-white">{session.operator.copy.hit}</span>
          </button>
          {canDouble ? (
            <button
              type="button"
              onClick={() => { session.dispatch({ type: 'DOUBLE' }); playSfx('chipStack', 0.5); refresh(); }}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-white/25 bg-white/[0.08] active:scale-[0.97]"
            >
              <span className="text-xl font-black leading-none text-white">×2</span>
              <span className="text-xs font-extrabold tracking-wider text-white">{session.operator.copy.double}</span>
            </button>
          ) : null}
        </section>
      ) : null}

      {betting ? (
        <section className="mx-auto flex w-full max-w-md shrink-0 justify-center gap-2.5 px-4 pb-3 pt-1 lg:hidden">
          <button
            type="button"
            onClick={() => { session.dispatch({ type: 'UNDO_LAST_BET' }); playSfxPitched('chipStack', 0.65, 0.5); refresh(); }}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-white/20 bg-white/[0.08] active:scale-[0.97]"
          >
            <RotateCcw className="size-7 text-white/70" strokeWidth={2} />
            <span className="text-xs font-extrabold tracking-wider text-white">{session.operator.copy.undo}</span>
          </button>
          <button
            type="button"
            onClick={() => { preloadBgm(); preloadSfx(); session.dispatch({ type: 'DEAL' }); refresh(); }}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/25 active:scale-[0.97]"
          >
            <Zap className="size-7 text-emerald-400" strokeWidth={2.5} fill="currentColor" />
            <span className="text-xs font-extrabold tracking-wider text-white">{session.operator.copy.deal}</span>
            {totalBet > 0 && (
              <span className="text-[10px] font-bold text-emerald-300/80">{formatMoney(totalBet)}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { session.dispatch({ type: 'CLEAR_ALL_BETS' }); playSfxPitched('chipStack', 0.65, 0.5); refresh(); }}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-white/20 bg-white/[0.08] active:scale-[0.97]"
          >
            <X className="size-7 text-white/70" strokeWidth={2} />
            <span className="text-xs font-extrabold tracking-wider text-white">{session.operator.copy.clear}</span>
          </button>
        </section>
      ) : null}

      {snap.phase === GamePhase.RoundComplete && (
        <section className="mx-auto flex w-full max-w-md shrink-0 justify-center gap-2.5 px-4 pb-3 lg:hidden">
          <button
            type="button"
            className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-emerald-400/50 bg-emerald-500/20 active:scale-[0.97] disabled:opacity-40"
            disabled={!snap.seats.some((s) => s.inRound && s.bet > 0)}
            onClick={() => { session.dispatch({ type: 'REBET_LAST' }); playSfx('chipStack', 0.5); refresh(); }}
          >
            <RefreshCw className="size-6 text-emerald-400" strokeWidth={2.5} />
            <span className="text-[10px] font-extrabold tracking-wider text-white">{session.operator.copy.rebet}</span>
          </button>
          <button
            type="button"
            className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-amber-400/50 bg-amber-500/20 active:scale-[0.97] disabled:opacity-40"
            disabled={!snap.seats.some((s) => s.inRound && s.bet > 0)}
            onClick={() => { session.dispatch({ type: 'REBET_DOUBLE' }); playSfx('chipStack', 0.5); refresh(); }}
          >
            <span className="text-lg font-black leading-none text-amber-400">×2</span>
            <span className="text-[10px] font-extrabold tracking-wider text-white">REBET x2</span>
          </button>
          <button
            type="button"
            className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-white/20 bg-white/[0.08] active:scale-[0.97]"
            onClick={() => { session.dispatch({ type: 'ACK_ROUND_COMPLETE' }); refresh(); }}
          >
            <RefreshCw className="size-6 text-pink-400" strokeWidth={2.5} />
            <span className="text-[10px] font-extrabold tracking-wider text-white">NEW ROUND</span>
          </button>
        </section>
      )}

      {snap.lastError ? (
        <p className="mx-3 mb-1 shrink-0 rounded-sm border border-red-400/35 bg-red-950/40 px-3 py-2 text-center text-xs text-red-100 lg:mx-4 lg:mb-2 lg:py-3 lg:text-sm">
          {snap.lastError}
        </p>
      ) : null}

      <footer className="mt-auto shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 text-center text-[10px] font-medium tracking-wide text-white/45 lg:pb-4 lg:pt-2 lg:text-[11px]">
        MIN: {formatMoney(session.operator.tableLimits.minBet)} / MAX:{' '}
        {formatMoney(session.operator.tableLimits.maxBet)}
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
        musicOn={musicOn}
        onToggleMusic={() => setMusicOn((v) => !v)}
        fastAnimations={fastAnimations}
        onToggleFastAnimations={() => setFastAnimations((v) => !v)}
        rules={session.operator.rules}
        history={handHistory}
      />
    </div>
  );
}
