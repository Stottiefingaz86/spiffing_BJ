import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { publicAssetUrl } from '@/lib/publicUrl';
import { formatMoney } from '@/lib/formatMoney';
import { GamePreloader } from '@/components/GamePreloader';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';

import {
  StarburstSession,
  GamePhase,
  ElevateOption,
  ELEVATE_COST_MULTIPLIER,
  ELEVATE_DESCRIPTIONS,
  ELEVATE_LABELS,
} from '../engine/session';
import { FEATURE_COLORS, FEATURE_LABELS, FeatureType } from '../engine/features';
import { StarburstCanvas } from '../render/StarburstCanvas';
import {
  preloadSBSfx,
  playSB,
  setSBSfxMuted,
  setSBBgmMuted,
  startSBBgm,
  stopSBBgm,
  unlockSBAudio,
  preloadSBBgm,
} from '../audio/starburstSfx';

const PRELOAD_ASSETS = ['starburst/bg.png', 'starburst/logo.png'].map((p) =>
  publicAssetUrl(p),
);

function handleSBPreloaderPlay() {
  unlockSBAudio();
  preloadSBSfx();
  void startSBBgm(0.04);
}

export default function StarburstClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handleSBPreloaderPlay}>
      <StarburstGame />
    </GamePreloader>
  );
}

function StarburstGame() {
  const sessionRef = useRef<StarburstSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new StarburstSession();
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);
  const [elevateOpen, setElevateOpen] = useState(false);
  const [displayedWin, setDisplayedWin] = useState(0);
  const targetWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => setSnap(session.getSnapshot()), [session]);

  useEffect(() => {
    preloadSBBgm();
    const handler = () => {
      unlockSBAudio();
      preloadSBSfx();
      startSBBgm(0.04);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
      stopSBBgm();
    };
  }, []);

  useEffect(() => {
    setSBSfxMuted(!soundOn);
    setSBBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle) return;
    if (snap.balance < snap.bet) return;
    unlockSBAudio();
    preloadSBSfx();
    startSBBgm(0.04);
    playSB('spin', 0.22);
    setDisplayedWin(0);
    targetWinRef.current = 0;
    session.spin();
    refresh();
  }, [session, refresh, snap.phase, snap.balance, snap.bet]);

  const onDropComplete = useCallback(() => {
    session.dropComplete();
    refresh();
  }, [session, refresh]);

  const onCascadeStepComplete = useCallback(() => {
    session.nextCascade();
    refresh();
  }, [session, refresh]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        onSpin();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSpin]);

  useEffect(() => {
    if (snap.phase !== GamePhase.ShowWin) return;
    const t = window.setTimeout(() => { session.dismissWin(); refresh(); }, 1200);
    return () => clearTimeout(t);
  }, [snap.phase, session, refresh]);

  useEffect(() => {
    if (snap.phase === GamePhase.Idle) return;
    const t = window.setTimeout(() => { session.forceIdle(); refresh(); }, 60000);
    return () => clearTimeout(t);
  }, [snap.phase, session, refresh]);

  const isCascading = snap.phase === GamePhase.Cascading;
  const isFeatureActive = snap.phase === GamePhase.FeatureActivating || snap.phase === GamePhase.Expanding;
  const isShowWin = snap.phase === GamePhase.ShowWin;
  const isSpinning = snap.phase !== GamePhase.Idle;

  // Running win target:
  const runningWin = (() => {
    if (snap.phase === GamePhase.Idle) return 0;
    if (isShowWin) return snap.spinWin;
    if (snap.currentCascadeIndex < 0) return 0;
    // Sum of all win payouts up to and including the current action.
    let total = 0;
    for (let i = 0; i <= snap.currentCascadeIndex && i < snap.cascadeSteps.length; i++) {
      const a = snap.cascadeSteps[i];
      if (a.kind === 'win') total += a.payout;
    }
    return total;
  })();

  useEffect(() => { targetWinRef.current = runningWin; }, [runningWin]);

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

  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);
  const bgExpanded = snap.gridExpanded;
  const isBusy = isSpinning;
  const galaxyCost = snap.bet * ELEVATE_COST_MULTIPLIER[ElevateOption.GalaxyStar];

  const bridge = useSlotGameBridge({
    balanceCents: snap.balance,
    betCents: snap.bet,
    betOptionsCents: session.betOptions,
    isBusy,
    canSpin,
    showBuyBonus: true,
    buyBonusCostCents: galaxyCost,
    canBuyBonus: snap.phase === GamePhase.Idle && snap.balance >= galaxyCost,
    onBuyBonus: () => setElevateOpen(true),
    gameTitle: 'Starburst',
    soundEnabled: soundOn,
    musicEnabled: soundOn,
    onSpin,
    onSetBetCents: (cents) => {
      session.setBet(cents);
      refresh();
    },
    onToggleSound: () => setSoundOn((v) => !v),
    onToggleMusic: () => setSoundOn((v) => !v),
  });

  // Current action label (for floating status above the grid)
  const currentAction = snap.cascadeSteps[snap.currentCascadeIndex];
  const currentFeatureLabel = isFeatureActive && currentAction?.kind === 'feature' && !currentAction.silent
    ? FEATURE_LABELS[currentAction.feature]
    : isFeatureActive && currentAction?.kind === 'scatterAdd'
      ? 'COLLECT MULTIPLIERS'
      : null;

  return (
    <SlotGameShell
      {...bridge.overlayProps}
      className={cn(
        'relative flex h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        bgExpanded ? 'bg-[#180735]' : 'bg-[#050418]',
      )}
    >
      <div className="relative flex h-full min-h-0 w-full flex-col">
      {/* Background */}
      <div className="slot-bg overflow-hidden bg-[#030214]">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 20% 30%, rgba(123, 76, 255, 0.28), transparent 60%),' +
              'radial-gradient(ellipse 55% 45% at 80% 70%, rgba(255, 78, 199, 0.22), transparent 60%),' +
              'radial-gradient(ellipse 70% 45% at 50% 10%, rgba(51, 204, 255, 0.18), transparent 65%),' +
              'linear-gradient(180deg, #050316 0%, #0a0730 50%, #030214 100%)',
          }}
        />
        <img
          src={publicAssetUrl('starburst/bg.png')}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-screen"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[28%]"
          style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.9) 100%)' }}
        />
      </div>


      {/* Game canvas */}
      <div className="slot-stage">
        <div className="pointer-events-none absolute left-0 right-0 z-10 flex justify-center -top-[60px] max-lg:top-[30px]">
          <img
            src={publicAssetUrl('starburst/logo.png')}
            alt="Starburst Galaxy"
            className="h-32 lg:h-36 w-auto"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Meters overlay (left rail) */}
        <MetersOverlay snap={snap} />

        <StarburstCanvas
          snapshot={snap}
          onDropComplete={onDropComplete}
          onCascadeStepComplete={onCascadeStepComplete}
          className="h-full w-full"
        />

        {currentFeatureLabel && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center">
            <div className="rounded-full border border-fuchsia-400/50 bg-black/70 px-5 py-1.5 shadow-lg shadow-fuchsia-500/20 backdrop-blur-sm">
              <span className="text-sm font-black uppercase tracking-[0.2em] text-fuchsia-200 sm:text-base">
                {currentFeatureLabel}
              </span>
            </div>
          </div>
        )}

        {snap.gridExpanded && (
          <div className="pointer-events-none absolute top-24 left-1/2 z-10 -translate-x-1/2">
            <div className="rounded-full bg-fuchsia-500/80 px-4 py-1 shadow-lg shadow-fuchsia-500/40">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white">7×7 Galaxy Star</span>
            </div>
          </div>
        )}
      </div>

        {showWin > 0 && (
          <div className="slot-win-chip">
            <div className="rounded-full bg-black/55 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-sm font-bold tabular-nums text-emerald-400">{formatMoney(showWin)}</span>
            </div>
          </div>
        )}

      <ElevateDrawer
        open={elevateOpen}
        onClose={() => setElevateOpen(false)}
        baseBet={snap.baseBet}
        current={snap.elevate}
        onSelect={(opt) => { session.setElevate(opt); refresh(); }}
      />

      </div>
    </SlotGameShell>
  );
}
function MetersOverlay({ snap }: { snap: ReturnType<StarburstSession['getSnapshot']> }) {
  return (
    <div className="pointer-events-none absolute left-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:left-3 lg:left-5">
      {/* Feature generator (5 dots) + feature-award count (5 dots) */}
      <div className="rounded-xl border border-white/10 bg-black/50 px-2.5 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.15em] text-white/70">
          <Sparkles className="size-2.5 text-cyan-300" />
          Feature Gen
        </div>
        <div className="mt-1.5 flex items-center gap-1" title="Consecutive wins — 5 awards a feature">
          {Array.from({ length: 5 }).map((_, i) => {
            const filled = i < snap.featureGenCount;
            return (
              <span
                key={i}
                className={cn(
                  'size-2.5 rounded-full border',
                  filled
                    ? 'border-cyan-300 bg-cyan-300 shadow-[0_0_6px_rgba(127,216,255,0.8)]'
                    : 'border-white/20 bg-white/5',
                )}
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1" title="Features awarded — 5th becomes a Galaxy Star">
          {Array.from({ length: 5 }).map((_, i) => {
            const filled = i < snap.featureAwardCount;
            const isFifth = i === 4;
            return (
              <span
                key={i}
                className={cn(
                  'size-2 rounded-full border',
                  filled
                    ? isFifth
                      ? 'border-fuchsia-300 bg-fuchsia-300 shadow-[0_0_6px_rgba(240,120,230,0.9)]'
                      : 'border-violet-300 bg-violet-400 shadow-[0_0_4px_rgba(167,139,250,0.7)]'
                    : isFifth
                      ? 'border-fuchsia-400/40 bg-white/5'
                      : 'border-white/15 bg-white/5',
                )}
              />
            );
          })}
        </div>
      </div>

      {/* Galaxy meter — only visible once activated by the first 3×3 Wild */}
      {snap.galaxyMeterActive && (
        <div className="rounded-xl border border-fuchsia-400/30 bg-black/55 px-2.5 py-2 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.15em] text-white/70">
            <span>Galaxy Metre</span>
            <span className="tabular-nums text-fuchsia-300">{snap.galaxyMeter}/50</span>
          </div>
          <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-pink-400 to-rose-300 transition-all duration-500"
              style={{ width: `${Math.min(100, (snap.galaxyMeter / 50) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Multiplier collect meter */}
      {snap.multiplierCollect > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-black/60 px-2.5 py-2 backdrop-blur-sm">
          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-amber-300/90">Multiplier</div>
          <div className="mt-0.5 text-xl font-black leading-none text-amber-300 tabular-nums">
            ×{snap.multiplierCollect}
          </div>
        </div>
      )}

      {/* Pending Mega / Galaxy Star callouts */}
      {snap.pendingMegaStar && (
        <div className="rounded-xl border border-cyan-400/50 bg-black/70 px-2.5 py-1.5 backdrop-blur-sm">
          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-cyan-200">Mega Star</div>
        </div>
      )}
      {snap.pendingGalaxyStars > 0 && (
        <div className="rounded-xl border border-fuchsia-400/50 bg-black/70 px-2.5 py-1.5 backdrop-blur-sm">
          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-fuchsia-200">Galaxy Star</div>
        </div>
      )}

      {/* Pending features queue */}
      {snap.pendingFeatures.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/50 px-2.5 py-2 backdrop-blur-sm">
          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-white/70">Queue</div>
          <div className="mt-1 flex flex-col gap-0.5">
            {snap.pendingFeatures.slice(0, 5).map((f: FeatureType, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: `#${FEATURE_COLORS[f].toString(16).padStart(6, '0')}` }}
              >
                <span className="size-1.5 rounded-full"
                      style={{ backgroundColor: `#${FEATURE_COLORS[f].toString(16).padStart(6, '0')}` }} />
                {FEATURE_LABELS[f]}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ElevateDrawer({
  open, onClose, baseBet, current, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  baseBet: number;
  current: ElevateOption;
  onSelect: (opt: ElevateOption) => void;
}) {
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
      const timer = setTimeout(() => { if (closingRef.current) setMounted(false); }, 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  const overlay = cn(
    'fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center',
    'transition-opacity duration-300',
    visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
  );

  const panel = cn(
    'relative mx-0 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0824] shadow-2xl sm:mx-4 sm:rounded-2xl',
    'transition-transform duration-300 ease-out',
    visible ? 'translate-y-0' : 'translate-y-full sm:translate-y-8',
  );

  const options: ElevateOption[] = [
    ElevateOption.None,
    ElevateOption.BonusBoost,
    ElevateOption.MegaStar,
    ElevateOption.BoostedMegaStar,
    ElevateOption.GalaxyStar,
    ElevateOption.GalaxyStarBonanza,
  ];

  return createPortal(
    <div className={overlay} onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Elevate Feature</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </header>
        <div className="flex flex-col gap-2 px-5 py-5">
          {options.map((opt) => {
            const mult = ELEVATE_COST_MULTIPLIER[opt];
            const cost = baseBet * mult;
            const isActive = current === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => { onSelect(opt); onClose(); }}
                className={cn(
                  'flex items-center justify-between rounded-xl border-2 px-3.5 py-3 text-left transition-all active:scale-[0.99]',
                  isActive
                    ? 'border-fuchsia-300 bg-fuchsia-400/15'
                    : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10',
                )}
              >
                <div>
                  <div className={cn('text-sm font-bold leading-tight', isActive ? 'text-fuchsia-200' : 'text-white')}>
                    {ELEVATE_LABELS[opt]}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-white/60">
                    {ELEVATE_DESCRIPTIONS[opt]}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/40">Cost</div>
                  <div className="text-sm font-bold tabular-nums text-white">{formatMoney(cost)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

