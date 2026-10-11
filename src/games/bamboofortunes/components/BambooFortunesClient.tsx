import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import { publicAssetUrl } from '@/lib/publicUrl';
import { GamePreloader } from '@/components/GamePreloader';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';

import { BambooFortunesSession, GamePhase, BUY_BONUS_COST } from '../engine/session';
import type { Cluster } from '../engine/grid';
import { BambooFortunesCanvas } from '../render/BambooFortunesCanvas';
import { preloadBFSfx, playBF, setBFSfxMuted, setBFBgmMuted, startBFBgm, stopBFBgm, unlockBFAudio, preloadBFBgm } from '../audio/bamboofortunesSfx';
import { countScatters } from '../engine/grid';
import { getSymbolMultiplier, type SymbolMultiplier } from '../engine/symbolMultipliers';
import { getPayoutMultiplier, SCATTER, type BambooSymbol } from '../engine/symbols';

const BF_ASSET_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';
const BF_LOGO_SRC = `${BF_ASSET_BASE}bamboofortunes/logo.png`;
const BF_BG_SRC = `${BF_ASSET_BASE}bamboofortunes/bg.png`;

const PRELOAD_ASSETS = [
  'bamboofortunes/bg.png',
  'bamboofortunes/logo.png',
  'bamboofortunes/frame.png',
  'bamboofortunes/panda.png',
  'bamboofortunes/dragon.png',
  'bamboofortunes/gong.png',
  'bamboofortunes/bonsai.png',
  'bamboofortunes/wild.png',
  'bamboofortunes/scatter.png',
  'bamboofortunes/heart_symbol.png',
  'bamboofortunes/spade_symbol.png',
  'bamboofortunes/club_symbol.png',
  'bamboofortunes/sounds/spin.mp3',
  'bamboofortunes/sounds/bgmusic.mp3',
  'bamboofortunes/sounds/win.mp3',
].map((p) => publicAssetUrl(p));

function handleBFPreloaderPlay() {
  unlockBFAudio();
  preloadBFSfx();
  void startBFBgm(0.04);
}

export default function BambooFortunesClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handleBFPreloaderPlay}>
      <BambooFortunesGame />
    </GamePreloader>
  );
}

function BambooFortunesGame() {
  const sessionRef = useRef<BambooFortunesSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new BambooFortunesSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);

  const [displayedWin, setDisplayedWin] = useState(0);
  const [scatterCount, setScatterCount] = useState(0);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef<number>(0);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    preloadBFBgm();
    const handler = () => {
      unlockBFAudio();
      preloadBFSfx();
      startBFBgm(0.04);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('touchstart', handler);
      stopBFBgm();
    };
  }, []);

  useEffect(() => {
    setBFSfxMuted(!soundOn);
    setBFBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    const s = session.getSnapshot();
    // Allow spinning from ShowWin (skip win display)
    if (s.phase === GamePhase.ShowWin) {
      session.dismissWin();
    }
    if (s.phase !== GamePhase.Idle && s.phase !== GamePhase.ShowWin) return;
    if (s.balance < (s.inFreeSpins ? 0 : s.bet)) return;

    unlockBFAudio();
    preloadBFSfx();
    startBFBgm(0.04);
    setDisplayedWin(0);
    targetWinRef.current = 0;
    lastSpinWinRef.current = 0;
    session.spin();
    refresh();
  }, [session, refresh]);

  const onReelsComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.Spinning) {
      session.reelsComplete();
    } else if (s.phase === GamePhase.FreeSpinSpinning) {
      session.freeSpinReelsComplete();
    }
    const updated = session.getSnapshot();
    setScatterCount(countScatters(updated.grid));
    refresh();
  }, [session, refresh]);

  const onScatterUpdate = useCallback((count: number) => {
    setScatterCount(count);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (snap.phase === GamePhase.FreeSpinOutro) {
          session.dismissFreeSpins();
          refresh();
        } else {
          onSpin();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSpin, snap.phase, session, refresh]);

  // Auto-dismiss ShowWin after delay
  useEffect(() => {
    if (snap.phase !== GamePhase.ShowWin) return;
    const delay =
      snap.freeSpinsTotal > 0 && !snap.pendingFreeSpins ? 1200 : 1500;
    const timer = window.setTimeout(() => {
      const s = session.getSnapshot();
      if (s.phase !== GamePhase.ShowWin) return;
      // `inFreeSpins` is false during ShowWin; use pending + bonus state so free-spin wins call dismissFreeSpinWin.
      if (s.pendingFreeSpins) {
        session.dismissWin();
      } else if (s.freeSpinsTotal > 0) {
        session.dismissFreeSpinWin();
      } else {
        session.dismissWin();
      }
      refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [snap.phase, snap.revision, session, refresh, snap.freeSpinsTotal, snap.pendingFreeSpins]);

  // Auto-start free spins
  useEffect(() => {
    if (snap.phase !== GamePhase.FreeSpinIntro) return;
    const timer = window.setTimeout(() => {
      session.startFreeSpin();
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  // Update scatter count when idle (shows the scatter count from current grid)
  useEffect(() => {
    if (snap.phase === GamePhase.Idle || snap.phase === GamePhase.ShowWin) {
      setScatterCount(countScatters(snap.grid));
    }
  }, [snap.phase, snap.revision]);

  // Safety timeout
  useEffect(() => {
    if (snap.phase === GamePhase.Idle) return;
    const timer = window.setTimeout(() => {
      session.forceIdle();
      refresh();
    }, 20000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  const isFreeSpinActive = snap.inFreeSpins;
  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;
  const isShowWin = snap.phase === GamePhase.ShowWin;

  if (snap.phase === GamePhase.Idle && snap.spinWin === 0) {
    lastSpinWinRef.current = 0;
  }

  let targetWin: number;
  if (isFreeSpinActive) {
    targetWin = snap.freeSpinsTotalWin;
  } else if (isShowWin) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else if (snap.phase === GamePhase.Idle && snap.spinWin > 0) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else {
    targetWin = lastSpinWinRef.current;
  }

  targetWinRef.current = targetWin;

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

  const isBusy =
    snap.phase !== GamePhase.Idle &&
    snap.phase !== GamePhase.ShowWin &&
    snap.phase !== GamePhase.FreeSpinOutro;
  const canSpin = (snap.phase === GamePhase.Idle && snap.balance >= snap.bet) || snap.phase === GamePhase.ShowWin;

  const footerWinCents = targetWin > 0 ? Math.round(displayedWin) : 0;
  const showWin = footerWinCents;

  const bridge = useSlotGameBridge({
    balanceCents: snap.balance,
    betCents: snap.bet,
    betOptionsCents: session.betOptions,
    isBusy,
    canSpin,
    showBuyBonus: true,
    buyBonusCostCents: BUY_BONUS_COST,
    canBuyBonus: snap.phase === GamePhase.Idle && snap.balance >= BUY_BONUS_COST && !snap.inFreeSpins,
    onBuyBonus: () => {
      session.buyBonus();
      refresh();
    },
    gameTitle: 'Bamboo Fortunes',
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
  const winOverlayLine =
    isShowWin && snap.spinWin > 0
      ? formatPrimaryWinLine(snap.spinWin, snap.winClusters, snap.symbolMultipliers)
      : null;

  return (
    <SlotGameShell
      {...bridge.overlayProps}
      className={cn(
        'relative flex min-h-0 h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive
          ? 'bg-[#1a0d06]'
          : 'bg-[#0a1a0e]',
      )}
    >
      <div
        className="relative flex h-full min-h-0 w-full flex-col"
        onClick={() => {
          if (isFreeSpinOutro) {
            session.dismissFreeSpins();
            refresh();
          }
        }}
      >
      {/* Background: sharp base + masked blur — strong soft blur above ~mid, then less and less blur toward bottom */}
      <div className="slot-bg overflow-hidden">
        <img
          src={BF_BG_SRC}
          alt=""
          className="absolute inset-0 h-full min-h-full w-full min-w-full object-cover object-center brightness-[0.9] contrast-[1.05] saturate-[1.12] scale-[1.08] max-lg:scale-110"
        />
        <img
          src={BF_BG_SRC}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full min-h-full w-full min-w-full object-cover object-center brightness-[0.9] contrast-[1.05] saturate-[1.12] scale-[1.08] blur-lg max-lg:scale-110"
          style={{
            maskImage:
              'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.88) 12%, rgba(0,0,0,0.58) 32%, rgba(0,0,0,0.38) 50%, rgba(0,0,0,0.2) 64%, rgba(0,0,0,0.08) 76%, transparent 88%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.88) 12%, rgba(0,0,0,0.58) 32%, rgba(0,0,0,0.38) 50%, rgba(0,0,0,0.2) 64%, rgba(0,0,0,0.08) 76%, transparent 88%)',
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
          }}
        />
        <FireflyCanvas />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_65%_at_50%_38%,transparent_0%,rgba(0,0,0,0.2)_45%,rgba(0,0,0,0.55)_100%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[38%]"
          style={{
            background:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 42%, rgba(0,0,0,0.82) 78%, rgba(0,0,0,0.92) 100%)',
          }}
        />
      </div>


      {/* Game canvas */}
      <div
        className="slot-stage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute left-1/2 z-10 w-full max-w-[min(96vw,820px)] -translate-x-1/2 -top-[26px] max-lg:top-6 lg:-top-[48px]">
          <h1 className="relative m-0 flex justify-center px-2">
            <img
              src={BF_LOGO_SRC}
              alt="Bamboo Fortunes"
              className="h-[6.1rem] w-auto max-w-full object-contain object-center [filter:drop-shadow(0_4px_18px_rgba(0,0,0,0.88))] sm:h-[6.45rem] lg:h-[6.35rem] lg:-translate-x-[min(1.85vw,34px)] xl:h-32"
              decoding="async"
            />
          </h1>
        </div>

        <div className="h-full min-h-0 w-full [filter:drop-shadow(0_28px_56px_rgba(0,0,0,0.7))]">
          <BambooFortunesCanvas
            snapshot={snap}
            onReelsComplete={onReelsComplete}
            onScatterUpdate={onScatterUpdate}
            className="h-full w-full"
          />
        </div>

        {isShowWin && snap.spinWin > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
            <div className="max-w-[min(100%,22rem)] rounded-2xl border border-white/10 bg-black/78 px-8 py-7 text-center backdrop-blur-xl sm:max-w-lg sm:px-12 sm:py-9">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-400/90 sm:text-[11px]">
                Total win
              </p>
              <p className="mt-2 text-5xl font-bold tabular-nums text-amber-200 sm:mt-3 sm:text-6xl">
                {formatMoney(Math.max(0, Math.round(displayedWin)))}
              </p>
              {winOverlayLine && (
                <p className="mt-4 max-w-[min(100%,22rem)] text-center text-xs font-medium leading-relaxed text-white/85 sm:text-sm">
                  {winOverlayLine}
                </p>
              )}
            </div>
          </div>
        )}

        {isFreeSpinIntro && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
            <div className="animate-bounce rounded-2xl bg-black/70 px-10 py-6 backdrop-blur-sm">
              <p className="text-center text-3xl font-black tracking-tight text-emerald-400 sm:text-4xl">
                FREE SPINS
              </p>
              <p className="mt-1 text-center text-5xl font-black text-white sm:text-6xl">
                &times;{snap.freeSpinsTotal}
              </p>
            </div>
          </div>
        )}

        {isFreeSpinOutro && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            onClick={() => { session.dismissFreeSpins(); refresh(); }}
          >
            <div className="rounded-2xl bg-black/75 px-10 py-8 backdrop-blur-sm">
              <p className="text-center text-2xl font-black tracking-tight text-emerald-400 sm:text-3xl">
                FREE SPINS COMPLETE
              </p>
              <p className="mt-2 text-center text-4xl font-bold tabular-nums text-emerald-400 sm:text-5xl">
                {formatMoney(snap.freeSpinsTotalWin)}
              </p>
              <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
            </div>
          </div>
        )}

        {isFreeSpinActive && !isFreeSpinIntro && !isFreeSpinOutro && (
          <div className="slot-win-chip flex flex-col items-center gap-1">
            <div className="rounded-full bg-emerald-500/90 px-4 py-1 shadow-lg shadow-emerald-500/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE SPINS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
            {snap.freeSpinsTotalWin > 0 && (
              <div className="rounded-full bg-black/55 px-3 py-0.5 text-[10px] font-semibold tabular-nums text-amber-300 backdrop-blur-sm sm:text-xs">
                Session win {formatMoney(snap.freeSpinsTotalWin)}
              </div>
            )}
          </div>
        )}

        {showWin > 0 && !isShowWin && (
          <div className="slot-win-chip">
            <div className="rounded-full bg-black/55 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-sm font-bold tabular-nums text-emerald-400">{formatMoney(showWin)}</span>
            </div>
          </div>
        )}
      </div>
      </div>
    </SlotGameShell>
  );
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  speed: number;
  hue: number;
}

function clusterWeight(cluster: Cluster, symbolMultipliers: SymbolMultiplier[]): number {
  const base = getPayoutMultiplier(cluster.symbol, cluster.cells.length);
  if (base <= 0) return 0;
  const sym =
    cluster.symbol === SCATTER
      ? 1
      : getSymbolMultiplier(symbolMultipliers, cluster.symbol as BambooSymbol);
  return base * sym;
}

function formatPrimaryWinLine(
  spinWin: number,
  clusters: Cluster[],
  symbolMultipliers: SymbolMultiplier[],
): string | null {
  if (spinWin <= 0 || clusters.length === 0) return null;
  const weights = clusters.map((c) => clusterWeight(c, symbolMultipliers));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  let bestI = 0;
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] > weights[bestI]) bestI = i;
  }
  const c = clusters[bestI]!;
  const share = Math.round((spinWin * weights[bestI]) / sum);
  return `${symbolWinLabel(c.symbol)} · ${c.cells.length} symbols · ${formatMoney(share)}`;
}

function symbolWinLabel(symbol: Cluster['symbol']): string {
  const em: Record<string, string> = {
    heart: '♥',
    spade: '♠',
    club: '♣',
    panda: '🐼',
    dragon: '🐉',
    gong: '🔔',
    wild: '✦',
    bonsai: '🌳',
    scatter: '★',
  };
  const s = symbol as string;
  const emoji = em[s] ?? '●';
  const title = s === 'scatter' ? 'Scatter' : s.charAt(0).toUpperCase() + s.slice(1);
  return `${emoji} ${title}`;
}

const FireflyCanvas = memo(function FireflyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const flies: Firefly[] = [];
    let raf = 0;

    function resize() {
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * Math.min(window.devicePixelRatio, 2);
      canvas!.height = h * Math.min(window.devicePixelRatio, 2);
      ctx!.setTransform(Math.min(window.devicePixelRatio, 2), 0, 0, Math.min(window.devicePixelRatio, 2), 0, 0);
    }

    function init() {
      resize();
      flies.length = 0;
      const count = Math.max(20, Math.floor((w * h) / 18000));
      for (let i = 0; i < count; i++) {
        flies.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.2,
          radius: 1.5 + Math.random() * 2.5,
          baseAlpha: 0.22 + Math.random() * 0.38,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.8,
          hue: 80 + Math.random() * 60,
        });
      }
    }

    let lastTime = 0;
    function tick(time: number) {
      const dt = Math.min(time - lastTime, 50) / 16;
      lastTime = time;

      ctx!.clearRect(0, 0, w, h);

      for (const f of flies) {
        f.phase += 0.008 * f.speed * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;

        f.vx += (Math.random() - 0.5) * 0.02 * dt;
        f.vy += (Math.random() - 0.5) * 0.015 * dt;
        f.vx *= 0.995;
        f.vy *= 0.995;

        if (f.x < -20) f.x = w + 20;
        if (f.x > w + 20) f.x = -20;
        if (f.y < -20) f.y = h + 20;
        if (f.y > h + 20) f.y = -20;

        const pulse = (Math.sin(f.phase) * 0.5 + 0.5);
        const alpha = f.baseAlpha * pulse;
        if (alpha < 0.01) continue;

        const r = f.radius * (0.8 + pulse * 0.4);

        const grad = ctx!.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 4);
        grad.addColorStop(0, `hsla(${f.hue}, 80%, 75%, ${alpha})`);
        grad.addColorStop(0.3, `hsla(${f.hue}, 70%, 60%, ${alpha * 0.5})`);
        grad.addColorStop(1, `hsla(${f.hue}, 60%, 50%, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(f.x, f.y, r * 4, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = `hsla(${f.hue}, 90%, 85%, ${alpha * 1.2})`;
        ctx!.beginPath();
        ctx!.arc(f.x, f.y, r * 0.6, 0, Math.PI * 2);
        ctx!.fill();
      }

      raf = requestAnimationFrame(tick);
    }

    init();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', init);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', init);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ mixBlendMode: 'screen' }}
    />
  );
});
