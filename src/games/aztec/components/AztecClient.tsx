import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Home, Music, RefreshCw, Settings, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import {
  slotGlassPill,
  slotSpinDesktopClasses,
  slotSpinMobileClasses,
} from '@/components/game/slotChrome';

import { AztecSession, GamePhase } from '../engine/session';
import { AZTEC_FRAME_SPRITE_BOTTOM_OUTSET_PX } from '../render/aztecLayout';
import { AztecCanvas, type AztecFrameRect } from '../render/AztecCanvas';
import { AztecSettingsModal } from './AztecSettingsModal';
import {
  preloadTFSfx,
  playTF,
  setTFSfxMuted,
  startTFBgm,
  stopTFBgm,
  setTFBgmMuted,
  unlockTFAudio,
  preloadTFBgm,
} from '../audio/aztecSfx';

/** Darker pills + blur so Win/Stake labels read over stone and the bottom fade. */
const aztecFooterPill =
  'rounded-2xl border border-white/20 bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md';

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const AZTEC_BOTTOM_DECAL_URL = `${ASSET_BASE}aztec/bottomimage.png`;

/**
 * When true, bottom decal is pinned to the **viewport** bottom (ignores frame).
 * When false, decal top aligns to the **painted** frame bottom: layout `frameY + frameH` plus the same
 * bottom outset px the Pixi frame sprite uses (`AZTEC_FRAME_SPRITE_BOTTOM_OUTSET_PX`).
 */
const AZTEC_BOTTOM_DECAL_PIN_VIEWPORT = false;

export default function AztecClient() {
  return <AztecGame />;
}

function AztecGame() {
  const sessionRef = useRef<AztecSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new AztecSession();
  }
  const session = sessionRef.current;

  const [snap, setSnap] = useState(() => session.getSnapshot());
  const [sfxOn, setSfxOn] = useState(true);
  const [bgmOn, setBgmOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [displayedWin, setDisplayedWin] = useState(0);
  const targetWinRef = useRef(0);
  const lastSpinWinRef = useRef(0);
  const rafRef = useRef(0);
  /** Mirrored from Pixi gameLayer each tick — HTML overlays can follow the same shake if needed. */
  const cameraShakeRef = useRef({ x: 0, y: 0 });
  const [frameLayout, setFrameLayout] = useState<AztecFrameRect | null>(null);

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
    setTFSfxMuted(!sfxOn);
  }, [sfxOn]);

  useEffect(() => {
    setTFBgmMuted(!bgmOn);
  }, [bgmOn]);

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

  const pinAztecBottomDecalToViewport = AZTEC_BOTTOM_DECAL_PIN_VIEWPORT;

  return (
    <div
      className={cn(
        'relative h-dvh max-h-dvh overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive ? 'bg-[#181008]' : 'bg-[#081018]',
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
            'absolute inset-0 transition-opacity duration-700',
            isFreeSpinActive ? 'opacity-95' : 'opacity-100',
          )}
        >
          <div className="absolute inset-0 bg-[#0b1828]" aria-hidden />
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            aria-hidden
            style={{
              backgroundImage: `url(${ASSET_BASE}aztec/bg.jpg)`,
            }}
          />
          {/* Darken lower third of the jungle BG only (not the stone decal). */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(52vh,620px)]"
            aria-hidden
            style={{
              background: isFreeSpinActive
                ? 'linear-gradient(to top, rgba(12,6,4,0.92) 0%, rgba(28,16,10,0.55) 32%, rgba(40,24,16,0.2) 58%, transparent 100%)'
                : 'linear-gradient(to top, rgba(2,8,18,0.9) 0%, rgba(4,14,26,0.52) 34%, rgba(8,22,36,0.18) 62%, transparent 100%)',
            }}
          />
        </div>
        {/* Strong blue over the top of bg.jpg — extra band + full-height wash (hidden in free falls). */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-[min(32vh,380px)] transition-opacity duration-700',
            isFreeSpinActive ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden
          style={{
            background:
              'linear-gradient(to bottom, rgba(2, 132, 199, 0.55) 0%, rgba(14, 165, 233, 0.38) 22%, rgba(56, 189, 248, 0.18) 55%, transparent 100%)',
          }}
        />
        <div
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-700',
            isFreeSpinActive ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden
          style={{
            background:
              'linear-gradient(to bottom, rgba(56, 189, 248, 0.42) 0%, rgba(14, 165, 233, 0.26) 14%, rgba(37, 99, 235, 0.14) 34%, rgba(15, 23, 42, 0.05) 58%, transparent 86%)',
          }}
        />
        <div
          className={cn(
            'pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-700',
            isFreeSpinActive ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 125% 95% at 50% 0%, rgba(186, 230, 253, 0.35) 0%, rgba(125, 211, 252, 0.12) 32%, transparent 64%), linear-gradient(to bottom, transparent 0%, transparent 42%, rgba(30, 58, 138, 0.08) 100%)',
          }}
        />
        <div
          className={cn(
            'absolute inset-0 mix-blend-soft-light',
            isFreeSpinActive
              ? 'bg-gradient-to-b from-transparent via-amber-950/14 to-stone-950/18'
              : 'bg-gradient-to-b from-transparent via-cyan-950/12 to-slate-950/18',
          )}
        />
        {/* Per-area grade only — no second `bg.jpg` here or `cover` won’t match the layer above (visible seam). */}
        <div
          className={cn(
            'absolute inset-0 mix-blend-overlay',
            isFreeSpinActive
              ? 'bg-gradient-to-b from-transparent via-amber-950/8 to-stone-900/14'
              : 'bg-gradient-to-b from-transparent via-teal-900/5 to-[#050a10]/18',
          )}
        />
        {/* Bottom ramp — keep soft; heavy dark here read as a “letterbox” bar under the UI */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(32vh,420px)]"
          style={{
            background: isFreeSpinActive
              ? 'linear-gradient(to bottom, transparent 0%, rgba(32,18,10,0.18) 50%, rgba(18,10,6,0.38) 85%, rgba(12,8,5,0.48) 100%)'
              : 'linear-gradient(to bottom, transparent 0%, rgba(4,20,28,0.14) 48%, rgba(2,14,22,0.32) 88%, rgba(2,10,16,0.42) 100%)',
          }}
        />
        {/* Screen-edge vignette — eased bottom so it doesn’t stack into a solid bar with the ramp */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background: isFreeSpinActive
              ? 'radial-gradient(ellipse 118% 108% at 50% 46%, transparent 0%, transparent 40%, rgba(28,14,8,0.16) 76%, rgba(14,8,5,0.48) 100%)'
              : 'radial-gradient(ellipse 118% 108% at 50% 44%, transparent 0%, transparent 38%, rgba(4,18,32,0.2) 72%, rgba(2,10,18,0.5) 100%)',
          }}
        />
      </div>

      {/* Full-viewport board — header is overlaid (not flex `shrink-0`) so the canvas isn’t shortened by a top bar. */}
      <div className="absolute inset-0 z-10 min-h-0" onClick={(e) => e.stopPropagation()}>
        <AztecCanvas
          snapshot={snap}
          onDropComplete={onDropComplete}
          onCascadeStepComplete={onCascadeStepComplete}
          cameraShakeRef={cameraShakeRef}
          onFrameLayout={setFrameLayout}
          className="relative z-10 h-full w-full min-h-0"
        />
        {/* Decorative ground — default: top edge = painted frame bottom (layout + sprite bottom outset). */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 z-[25] flex justify-center',
            pinAztecBottomDecalToViewport && 'items-end',
          )}
          style={
            pinAztecBottomDecalToViewport
              ? {
                  bottom: 0,
                  paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
                }
              : frameLayout
                ? {
                    top:
                      frameLayout.y +
                      frameLayout.h +
                      AZTEC_FRAME_SPRITE_BOTTOM_OUTSET_PX,
                  }
                : {
                    bottom: 0,
                    paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
                  }
          }
        >
          <img
            src={AZTEC_BOTTOM_DECAL_URL}
            alt=""
            className={cn(
              'h-auto w-full max-w-full select-none object-contain',
              pinAztecBottomDecalToViewport
                ? 'max-h-[min(42vh,320px)] object-bottom'
                : 'object-top',
            )}
            draggable={false}
            decoding="async"
          />
        </div>
        {/* Vignette over the whole playfield (frame + reels) so stone doesn’t “float” above the grade; keep soft. */}
        <div
          className="pointer-events-none absolute inset-0 z-[15]"
          aria-hidden
          style={{
            background: isFreeSpinActive
              ? 'radial-gradient(ellipse 102% 90% at 50% 44%, transparent 0%, transparent 42%, rgba(48,28,16,0.12) 62%, rgba(22,12,8,0.34) 100%)'
              : 'radial-gradient(ellipse 102% 90% at 50% 44%, transparent 0%, transparent 42%, rgba(6,40,48,0.08) 58%, rgba(0,12,20,0.28) 100%)',
          }}
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

      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-2 px-3 pt-[max(0.5rem,calc(env(safe-area-inset-top)+0.15rem))] pb-1 lg:px-8 lg:pt-6 lg:pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href="/"
          className={cn(
            slotGlassPill,
            'pointer-events-auto flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]',
          )}
          aria-label="Back to lobby"
        >
          <Home className="size-4" strokeWidth={1.8} />
        </a>
        <button
          type="button"
          className={cn(
            slotGlassPill,
            'pointer-events-auto flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]',
          )}
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className={cn(
            slotGlassPill,
            'pointer-events-auto flex size-9 items-center justify-center text-white/60 hover:text-white active:scale-[0.94]',
          )}
          aria-label={sfxOn ? 'Mute sound effects' : 'Unmute sound effects'}
          onClick={() => setSfxOn((v) => !v)}
        >
          {sfxOn ? (
            <Volume2 className="size-4" strokeWidth={1.8} />
          ) : (
            <VolumeX className="size-4" strokeWidth={1.8} />
          )}
        </button>
        <button
          type="button"
          className={cn(
            slotGlassPill,
            'pointer-events-auto flex size-9 items-center justify-center active:scale-[0.94]',
            bgmOn ? 'text-white/60 hover:text-white' : 'text-white/35 hover:text-white/50',
          )}
          aria-label={bgmOn ? 'Mute music' : 'Unmute music'}
          onClick={() => setBgmOn((v) => !v)}
        >
          <Music className="size-4" strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1" />
        <div
          className={cn(
            slotGlassPill,
            'pointer-events-auto ml-auto flex h-9 min-w-0 items-center gap-2 overflow-visible px-3 lg:h-10 lg:px-3.5',
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

      {/* Bottom UI legibility: tall fade so it washes over the lower stone frame, not only under the HUD */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-[24] h-[min(52vh,620px)] max-h-[85vh]',
          isFreeSpinActive ? 'opacity-[0.92]' : 'opacity-100',
        )}
        aria-hidden
        style={{
          background: isFreeSpinActive
            ? 'linear-gradient(to bottom, transparent 0%, rgba(30,14,8,0.06) 18%, rgba(30,14,8,0.14) 38%, rgba(18,10,6,0.32) 68%, rgba(12,8,5,0.5) 100%)'
            : 'linear-gradient(to bottom, transparent 0%, rgba(0,16,28,0.05) 16%, rgba(0,16,28,0.1) 32%, rgba(0,10,20,0.22) 58%, rgba(0,6,14,0.38) 100%)',
        }}
      />

      {!isFreeSpinActive && (
        <div className="pointer-events-none absolute bottom-[5.25rem] left-0 right-0 z-[35] flex justify-center lg:hidden">
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
        className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[32] bg-transparent px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-0 shadow-none lg:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-sm items-center justify-center gap-1.5">
          <div className={cn(aztecFooterPill, 'flex flex-1 flex-col items-center px-2 py-1.5')}>
            <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/85">Win</span>
            <span
              className={cn(
                'text-xs font-bold tabular-nums transition-colors duration-300',
                showWin > 0 ? 'text-emerald-300' : 'text-white/70',
              )}
            >
              {showWin > 0 ? formatMoney(showWin) : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => !isSpinning && setStakeOpen(true)}
            disabled={isSpinning}
            className={cn(aztecFooterPill, 'flex flex-1 items-center px-2 py-1.5 disabled:opacity-40')}
          >
            <div className="flex flex-1 flex-col items-center">
              <span className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/85">Stake</span>
              <span className="text-xs font-bold tabular-nums text-white">{formatMoney(snap.bet)}</span>
            </div>
            <div className="flex size-5 items-center justify-center rounded bg-white/15">
              <ChevronDown className="size-3 text-white/80" />
            </div>
          </button>
        </div>
      </footer>

      <footer
        className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[32] hidden bg-transparent px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0 shadow-none lg:block"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-xl items-end justify-center gap-3">
          <div className={cn(aztecFooterPill, 'flex min-w-[5.5rem] flex-col items-center px-3 py-2')}>
            <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/85">Win</span>
            <span
              className={cn(
                'text-sm font-bold tabular-nums transition-colors duration-300',
                showWin > 0 ? 'text-emerald-300' : 'text-white/70',
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
            className={cn(aztecFooterPill, 'flex min-w-[5.5rem] items-center gap-1 px-3 py-2 disabled:opacity-40')}
          >
            <div className="flex flex-1 flex-col items-center">
              <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/85">Stake</span>
              <span className="text-sm font-bold tabular-nums text-white">{formatMoney(snap.bet)}</span>
            </div>
            <ChevronDown className="size-3.5 text-white/80" />
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

      <AztecSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sfxOn={sfxOn}
        bgmOn={bgmOn}
        onToggleSfx={() => setSfxOn((v) => !v)}
        onToggleBgm={() => setBgmOn((v) => !v)}
      />
    </div>
  );
}
