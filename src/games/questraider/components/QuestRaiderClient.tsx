import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Home, RefreshCw, Settings, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import {
  slotGlassPill,
  slotSpinDesktopClasses,
  slotSpinMobileClasses,
} from '@/components/game/slotChrome';

import { QuestRaiderSession, GamePhase } from '../engine/session';
import { QuestRaiderCanvas, type QuestRaiderFrameRect } from '../render/QuestRaiderCanvas';
import { QR_FRAME_EMERALD, QR_LOGO_ON_FRAME } from '../render/questRaiderLayout';
import { QuestRaiderSettingsModal } from './QuestRaiderSettingsModal';
import {
  preloadTFSfx,
  playTF,
  setTFSfxMuted,
  startTFBgm,
  stopTFBgm,
  setTFBgmMuted,
  unlockTFAudio,
  preloadTFBgm,
} from '../audio/questRaiderSfx';

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export default function QuestRaiderClient() {
  return <QuestRaiderGame />;
}

function QuestRaiderGame() {
  const sessionRef = useRef<QuestRaiderSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new QuestRaiderSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [soundOn, setSoundOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [frameRect, setFrameRect] = useState<QuestRaiderFrameRect | null>(null);
  const [displayedWin, setDisplayedWin] = useState(0);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef(0);
  /** Mirrored from Pixi gameLayer each tick — emerald HTML overlay follows the same shake. */
  const cameraShakeRef = useRef({ x: 0, y: 0 });
  const emeraldGlowRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(() => {
    setSnap(session.getSnapshot());
  }, [session]);

  useEffect(() => {
    preloadTFBgm();
    const startAudio = () => {
      unlockTFAudio();
      void preloadTFSfx();
      void startTFBgm();
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('touchstart', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('touchstart', startAudio);
      window.removeEventListener('keydown', startAudio);
      stopTFBgm();
    };
  }, []);

  useEffect(() => {
    setTFSfxMuted(!soundOn);
    setTFBgmMuted(!soundOn);
  }, [soundOn]);

  const onSpin = useCallback(() => {
    if (snap.phase !== GamePhase.Idle || snap.balance < snap.bet) return;
    unlockTFAudio();
    preloadTFSfx();
    void startTFBgm();
    playTF('spin', 0.22);
    setDisplayedWin(0);
    targetWinRef.current = 0;
    lastSpinWinRef.current = 0;
    session.spin();
    refresh();
  }, [session, refresh, snap.phase, snap.balance, snap.bet]);

  const onDropComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.FreeSpinDropping) {
      session.freeSpinDropComplete();
    } else {
      session.dropComplete();
    }
    refresh();
  }, [session, refresh]);

  const onCascadeStepComplete = useCallback(() => {
    const s = session.getSnapshot();
    if (s.phase === GamePhase.FreeSpinCascading) {
      session.freeSpinNextCascade();
    } else {
      session.nextCascade();
    }
    refresh();
  }, [session, refresh]);

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

  useEffect(() => {
    if (snap.phase !== GamePhase.ShowWin) return;
    const timer = window.setTimeout(() => {
      session.dismissWin();
      refresh();
    }, 900);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  useEffect(() => {
    if (snap.phase !== GamePhase.FreeSpinIntro) return;
    const timer = window.setTimeout(() => {
      session.startFreeSpin();
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  useEffect(() => {
    if (snap.phase === GamePhase.Idle) return;
    const timer = window.setTimeout(() => {
      session.forceIdle();
      refresh();
    }, 18000);
    return () => clearTimeout(timer);
  }, [snap.phase, session, refresh]);

  const isFreeSpinActive = snap.inFreeSpins;
  const isFreeSpinIntro = snap.phase === GamePhase.FreeSpinIntro;
  const isFreeSpinOutro = snap.phase === GamePhase.FreeSpinOutro;
  const isCascading = snap.phase === GamePhase.Cascading || snap.phase === GamePhase.FreeSpinCascading;
  const isShowWin = snap.phase === GamePhase.ShowWin;

  const currentCascadeWin =
    isCascading && snap.currentCascadeIndex >= 0
      ? snap.cascadeSteps.slice(0, snap.currentCascadeIndex + 1).reduce((s, st) => s + st.payoutCents, 0)
      : 0;

  let targetWin: number;
  if (isFreeSpinActive) {
    targetWin = snap.freeSpinsTotalWin - snap.spinWin + currentCascadeWin;
    if (targetWin < 0) targetWin = 0;
    if (!isCascading) targetWin = snap.freeSpinsTotalWin;
  } else if (isCascading) {
    targetWin = currentCascadeWin;
    if (currentCascadeWin > 0) lastSpinWinRef.current = currentCascadeWin;
  } else if (isShowWin) {
    targetWin = snap.spinWin;
    lastSpinWinRef.current = snap.spinWin;
  } else {
    targetWin = lastSpinWinRef.current;
  }

  useEffect(() => {
    targetWinRef.current = targetWin;
  }, [targetWin]);

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

  const isSpinning = snap.phase !== GamePhase.Idle && snap.phase !== GamePhase.FreeSpinOutro;
  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);

  /** Lit during trap-door / fall-in only; fades out for cascades, win banner, free-spin intro, etc. */
  const emeraldGlowLit =
    snap.phase === GamePhase.Dropping || snap.phase === GamePhase.FreeSpinDropping;
  const [emeraldGlowOpacity, setEmeraldGlowOpacity] = useState(0);

  useEffect(() => {
    if (!emeraldGlowLit) {
      setEmeraldGlowOpacity(0);
      return;
    }
    setEmeraldGlowOpacity(0);
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setEmeraldGlowOpacity(1));
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, [emeraldGlowLit]);

  useLayoutEffect(() => {
    if (!frameRect || !isSpinning) return;
    const el = emeraldGlowRef.current;
    if (!el) return;
    const w = frameRect.w * QR_FRAME_EMERALD.glowDiameterFrac;
    el.style.width = `${w}px`;
    el.style.height = `${w}px`;
    el.style.borderRadius = '50%';
    el.style.background =
      'radial-gradient(circle closest-side, rgba(220,255,230,0.78) 0%, rgba(110,231,183,0.52) 38%, rgba(52,211,153,0.22) 62%, rgba(16,185,129,0.08) 82%, transparent 100%)';
    el.style.boxShadow =
      '0 0 12px 5px rgba(167,243,208,0.55), 0 0 26px 12px rgba(52,211,153,0.38), 0 0 44px 18px rgba(16,185,129,0.2)';

    let id = 0;
    const tick = () => {
      const node = emeraldGlowRef.current;
      if (node) {
        const { x, y } = cameraShakeRef.current;
        node.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [frameRect, isSpinning]);

  return (
    <div
      className={cn(
        'relative flex h-dvh max-h-dvh flex-col overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive ? 'bg-[#181008]' : 'bg-[#121016]',
      )}
      onClick={() => {
        if (isFreeSpinOutro) {
          session.dismissFreeSpins();
          refresh();
        }
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className={cn(
            'absolute inset-0 bg-[#0f0e12] transition-opacity duration-700',
            isFreeSpinActive ? 'opacity-95' : 'opacity-100',
          )}
          style={{
            backgroundImage: `url(${ASSET_BASE}quest_raiders/bg.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div
          className={cn(
            'absolute inset-0 mix-blend-soft-light',
            isFreeSpinActive
              ? 'bg-gradient-to-b from-transparent via-amber-950/14 to-stone-950/18'
              : 'bg-gradient-to-b from-transparent via-emerald-950/10 to-violet-950/14',
          )}
        />
        {/* Per-area grade only — no second `bg.png` here or `cover` won’t match the layer above (visible seam). */}
        <div
          className={cn(
            'absolute inset-0 mix-blend-overlay',
            isFreeSpinActive
              ? 'bg-gradient-to-b from-transparent via-amber-950/8 to-stone-900/14'
              : 'bg-gradient-to-b from-transparent via-teal-950/6 to-[#12101a]/16',
          )}
        />
        {/* Bottom ramp — behind board only; lighter so frame + vignette overlay can breathe */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(42vh,520px)]"
          style={{
            background: isFreeSpinActive
              ? 'linear-gradient(to bottom, transparent 0%, rgba(32,18,10,0.28) 44%, rgba(18,10,6,0.58) 80%, rgba(10,6,4,0.72) 100%)'
              : 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 46%, rgba(0,0,0,0.52) 82%, rgba(0,0,0,0.68) 100%)',
          }}
        />
      </div>

      <header
        className="relative z-20 flex shrink-0 items-center gap-2 px-3 pt-[max(0.5rem,calc(env(safe-area-inset-top)+0.15rem))] pb-1 lg:px-8 lg:pt-6 lg:pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href="/"
          className={cn(slotGlassPill, 'flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]')}
          aria-label="Back to lobby"
        >
          <Home className="size-4" strokeWidth={1.8} />
        </a>
        <button
          type="button"
          className={cn(slotGlassPill, 'flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]')}
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className={cn(slotGlassPill, 'flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]')}
          aria-label={soundOn ? 'Mute' : 'Unmute'}
          onClick={() => setSoundOn((v) => !v)}
        >
          {soundOn ? (
            <Volume2 className="size-4" strokeWidth={1.8} />
          ) : (
            <VolumeX className="size-4" strokeWidth={1.8} />
          )}
        </button>
        <div className="flex-1" />
        <div
          className={cn(
            slotGlassPill,
            'ml-auto flex h-9 min-w-0 items-center gap-2 overflow-visible px-3 lg:h-10 lg:px-3.5',
          )}
        >
          <span className="shrink-0 text-[7px] font-semibold uppercase leading-none tracking-[0.15em] text-white/40 lg:text-[8px]">
            Balance
          </span>
          <span className="text-sm font-bold leading-none tabular-nums text-white lg:text-base">
            {formatMoney(snap.balance)}
          </span>
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <QuestRaiderCanvas
          snapshot={snap}
          onDropComplete={onDropComplete}
          onCascadeStepComplete={onCascadeStepComplete}
          onFrameLayout={setFrameRect}
          cameraShakeRef={cameraShakeRef}
          className="relative z-10 h-full w-full min-h-0"
        />
        {/* Vignette over the whole playfield (frame + reels) so stone doesn’t “float” above the grade; keep soft. */}
        <div
          className="pointer-events-none absolute inset-0 z-[15]"
          aria-hidden
          style={{
            background: isFreeSpinActive
              ? 'radial-gradient(ellipse 102% 90% at 50% 44%, transparent 0%, transparent 42%, rgba(48,28,16,0.12) 62%, rgba(22,12,8,0.34) 100%)'
              : 'radial-gradient(ellipse 102% 90% at 50% 44%, transparent 0%, transparent 42%, rgba(0,0,0,0.1) 64%, rgba(0,0,0,0.3) 100%)',
          }}
        />
        {frameRect && isSpinning && (
          <div
            className="pointer-events-none absolute z-[25] transition-opacity duration-500 ease-[cubic-bezier(0.25,0.85,0.3,1)] motion-reduce:duration-100 motion-reduce:ease-linear"
            aria-hidden
            style={{
              left: `${frameRect.x + frameRect.w * QR_FRAME_EMERALD.centerXFrac}px`,
              top: `${frameRect.y + frameRect.h * QR_FRAME_EMERALD.centerYFrac}px`,
              opacity: emeraldGlowOpacity,
            }}
          >
            <div ref={emeraldGlowRef} className="qr-emerald-spin-glow pointer-events-none absolute left-0 top-0" />
          </div>
        )}
        <img
          src={`${ASSET_BASE}quest_raiders/logo.png`}
          alt="Quest Raider"
          className="pointer-events-none absolute z-40 w-auto object-contain [filter:drop-shadow(0_5px_20px_rgba(0,0,0,0.82))]"
          style={
            frameRect
              ? (() => {
                  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
                  const logoH = isMobile
                    ? Math.max(72, frameRect.w * 0.22)
                    : Math.max(64, frameRect.w * 0.18);
                  const overlap = isMobile ? 0.42 : 0.32;
                  const top = Math.max(0, frameRect.y + frameRect.h * QR_LOGO_ON_FRAME.topFrac - logoH * overlap);
                  return {
                    left: '50%',
                    top: `${top}px`,
                    height: `${logoH}px`,
                    transform: 'translateX(-50%)',
                    maxWidth: `min(100%, ${frameRect.w * QR_LOGO_ON_FRAME.widthFrac}px)`,
                    opacity: 1,
                  };
                })()
              : {
                  left: '50%',
                  top: 'max(0.5rem, env(safe-area-inset-top))',
                  height: '4rem',
                  transform: 'translateX(-50%)',
                  maxWidth: 'min(100%, 36rem)',
                  opacity: 0.35,
                }
          }
          decoding="async"
          draggable={false}
        />

        {isFreeSpinIntro && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
            <div className="animate-bounce rounded-2xl bg-black/70 px-10 py-6 backdrop-blur-sm">
              <p className="text-center text-3xl font-black tracking-tight text-amber-400 sm:text-4xl">FREE FALLS</p>
              <p className="mt-1 text-center text-5xl font-black text-white sm:text-6xl">&times;{snap.freeSpinsTotal}</p>
            </div>
          </div>
        )}

        {isFreeSpinOutro && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            onClick={() => {
              session.dismissFreeSpins();
              refresh();
            }}
          >
            <div className="rounded-2xl bg-black/75 px-10 py-8 backdrop-blur-sm">
              <p className="text-center text-2xl font-black tracking-tight text-amber-400 sm:text-3xl">
                FREE FALLS COMPLETE
              </p>
              <p className="mt-2 text-center text-4xl font-black text-emerald-400 sm:text-5xl">
                {formatMoney(snap.freeSpinsTotalWin)}
              </p>
              <p className="mt-4 text-center text-sm text-white/50">Tap anywhere to continue</p>
            </div>
          </div>
        )}

        {isFreeSpinActive && !isFreeSpinIntro && !isFreeSpinOutro && (
          <div className="absolute bottom-2 left-1/2 z-[30] -translate-x-1/2">
            <div className="rounded-full bg-amber-600/90 px-4 py-1 shadow-lg shadow-amber-700/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE FALLS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      {!isFreeSpinActive && (
        <div className="pointer-events-none absolute bottom-[5.25rem] left-0 right-0 z-30 flex justify-center lg:hidden">
          <button
            type="button"
            onClick={onSpin}
            disabled={!canSpin}
            className={cn(slotSpinMobileClasses(canSpin, 'emerald'), 'pointer-events-auto')}
          >
            {isSpinning ? (
              <svg className="size-9 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <RefreshCw className="size-11" strokeWidth={2.5} />
            )}
          </button>
        </div>
      )}

      <footer
        className="relative z-20 shrink-0 bg-transparent px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-0 shadow-none lg:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-sm items-center justify-center gap-1.5">
          <div className={cn(slotGlassPill, 'flex flex-1 flex-col items-center px-2 py-1')}>
            <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/35">Win</span>
            <span
              className={cn(
                'text-xs font-bold tabular-nums transition-colors duration-300',
                showWin > 0 ? 'text-emerald-400' : 'text-white/40',
              )}
            >
              {showWin > 0 ? formatMoney(showWin) : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => !isSpinning && setStakeOpen(true)}
            disabled={isSpinning}
            className={cn(slotGlassPill, 'flex flex-1 items-center px-2 py-1 disabled:opacity-40')}
          >
            <div className="flex flex-1 flex-col items-center">
              <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/35">Stake</span>
              <span className="text-xs font-bold tabular-nums text-white">{formatMoney(snap.bet)}</span>
            </div>
            <div className="flex size-5 items-center justify-center rounded bg-white/10">
              <ChevronDown className="size-3 text-white/50" />
            </div>
          </button>
        </div>
      </footer>

      <footer
        className="relative z-20 hidden shrink-0 bg-transparent px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0 shadow-none lg:block"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-xl items-end justify-center gap-3">
          <div className={cn(slotGlassPill, 'flex min-w-[5.5rem] flex-col items-center px-3 py-2')}>
            <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/35">Win</span>
            <span
              className={cn(
                'text-sm font-bold tabular-nums transition-colors duration-300',
                showWin > 0 ? 'text-emerald-400' : 'text-white/40',
              )}
            >
              {showWin > 0 ? formatMoney(showWin) : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={onSpin}
            disabled={!canSpin || isFreeSpinActive}
            className={slotSpinDesktopClasses(canSpin && !isFreeSpinActive, 'emerald')}
          >
            {isSpinning ? (
              <svg className="size-8 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <RefreshCw className="size-9" strokeWidth={2.5} />
            )}
          </button>
          <button
            type="button"
            onClick={() => !isSpinning && setStakeOpen(true)}
            disabled={isSpinning}
            className={cn(slotGlassPill, 'flex min-w-[5.5rem] items-center gap-1 px-3 py-2 disabled:opacity-40')}
          >
            <div className="flex flex-1 flex-col items-center">
              <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/35">Stake</span>
              <span className="text-sm font-bold tabular-nums text-white">{formatMoney(snap.bet)}</span>
            </div>
            <ChevronDown className="size-3.5 text-white/45" />
          </button>
        </div>
      </footer>

      {stakeOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => setStakeOpen(false)}
        >
          <div
            className="max-h-[70dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-white/10 bg-[#1a1518] p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-white/50">Select stake</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {session.betOptions.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  className={cn(
                    'rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors',
                    snap.bet === cents ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15',
                  )}
                  onClick={() => {
                    session.setBet(cents);
                    refresh();
                    setStakeOpen(false);
                  }}
                >
                  {formatMoney(cents)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <QuestRaiderSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
      />
    </div>
  );
}
