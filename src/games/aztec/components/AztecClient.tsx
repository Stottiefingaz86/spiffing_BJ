import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/formatMoney';
import { publicAssetUrl } from '@/lib/publicUrl';
import { GamePreloader } from '@/components/GamePreloader';
import { SlotGameShell } from '@/components/slot-ui/SlotGameShell';
import { useSlotGameBridge } from '@/hooks/slot/useSlotGameBridge';

import { AztecSession, GamePhase } from '../engine/session';
import { AZTEC_FRAME_SPRITE_BOTTOM_OUTSET_PX } from '../render/aztecLayout';
import { AztecCanvas, type AztecFrameRect } from '../render/AztecCanvas';
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

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const AZTEC_BOTTOM_DECAL_URL = `${ASSET_BASE}aztec/bottomimage.png`;

/**
 * When true, bottom decal is pinned to the **viewport** bottom (ignores frame).
 * When false, decal top aligns to the **painted** frame bottom: layout `frameY + frameH` plus the same
 * bottom outset px the Pixi frame sprite uses (`AZTEC_FRAME_SPRITE_BOTTOM_OUTSET_PX`).
 */
const AZTEC_BOTTOM_DECAL_PIN_VIEWPORT = false;

const PRELOAD_ASSETS = [
  'aztec/bg.jpg',
  'aztec/logo.png',
  'aztec/frame.png',
  'aztec/mask.png',
  'aztec/bottomimage.png',
  'aztec/wild.png',
  'aztec/symbol1.png',
  'aztec/symbol2.png',
  'aztec/symbol3.png',
  'aztec/symbol4.png',
  'aztec/symbol5.png',
  'aztec/symbol6.png',
  'aztec/symbol7.png',
  'aztec/spin.mp3',
  'aztec/reel_end.mp3',
  'aztec/win.mp3',
  'aztec/bgm.mp3',
].map((p) => publicAssetUrl(p));

function handleAztecPreloaderPlay() {
  unlockTFAudio();
  void preloadTFSfx();
  void startTFBgm();
}

export default function AztecClient() {
  return (
    <GamePreloader assets={PRELOAD_ASSETS} onPlay={handleAztecPreloaderPlay}>
      <AztecGame />
    </GamePreloader>
  );
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

  const isBusy = snap.phase !== GamePhase.Idle && snap.phase !== GamePhase.FreeSpinOutro;
  const canSpin = snap.phase === GamePhase.Idle && snap.balance >= snap.bet;
  const showWin = Math.round(displayedWin);

  const bridge = useSlotGameBridge({
    balanceCents: snap.balance,
    betCents: snap.bet,
    betOptionsCents: session.betOptions,
    isBusy,
    canSpin,
    showBuyBonus: false,
    gameTitle: 'Aztec',
    soundEnabled: sfxOn,
    musicEnabled: bgmOn,
    onSpin,
    onSetBetCents: (cents) => {
      session.setBet(cents);
      refresh();
    },
    onToggleSound: () => setSfxOn((v) => !v),
    onToggleMusic: () => setBgmOn((v) => !v),
  });

  const pinAztecBottomDecalToViewport = AZTEC_BOTTOM_DECAL_PIN_VIEWPORT;

  return (
    <SlotGameShell
      {...bridge.overlayProps}
      className={cn(
        'relative h-dvh max-h-dvh overflow-hidden text-white transition-colors duration-700',
        isFreeSpinActive ? 'bg-[#181008]' : 'bg-[#081018]',
      )}
    >
      <div
        className="relative h-full w-full"
        onClick={() => {
          if (isFreeSpinOutro) {
            session.dismissFreeSpins();
            refresh();
          }
        }}
      >
      <div className="slot-bg">
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
      <div className="slot-stage" onClick={(e) => e.stopPropagation()}>
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
          <div className="slot-win-chip">
            <div className="rounded-full bg-amber-600/90 px-4 py-1 shadow-lg shadow-amber-700/30">
              <span className="text-xs font-black tabular-nums text-white">
                FREE FALLS {snap.freeSpinsRemaining}/{snap.freeSpinsTotal}
              </span>
            </div>
          </div>
        )}

        {showWin > 0 && !isFreeSpinOutro && (
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
