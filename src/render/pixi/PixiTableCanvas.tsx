import { Application, Container, Graphics, type Texture } from 'pixi.js';
import { useEffect, useRef } from 'react';

import type { Suit } from '@/game/domain/card';
import { TABLE_CHIP_DENOMS } from '@/lib/tableChips';
import { GamePhase } from '@/game/state/phases';
import type { HandIndex, TableSnapshot } from '@/game/state/table-state';
import { isBlackjack } from '@/game/rules/scoring';

import {
  areCardFlightsActive,
  clearCardFlights,
  stepCardFlights,
  syncCardFlights,
} from './cardFlights';
import {
  syncTableScoreAnimations,
  tickTableScoreAnimations,
} from './tableScoreAnimation';
import {
  syncChipSelection,
  tickChipAnimations,
  chipAnimationsActive,
} from './chipSelectAnimation';
import {
  initWinParticleLayer,
  emitWinParticles,
  tickWinParticles,
  areWinParticlesActive,
  clearWinParticles,
} from './winParticles';
import { loadBrandLogoTexture, loadChipTextures, loadDealerIconTexture, loadSuitTextures } from './cardTextures';
import { drawFeltBackground, drawGameLayer, type TableDrawInteraction } from './drawTableScene';
import { buildSeatUiSpots } from './playLayout';
import { tablePixelRatio } from './renderQuality';

export interface PixiTableCanvasProps {
  snapshot: TableSnapshot;
  selectedChipCents: number;
  onSelectChip: (cents: number) => void;
  onMainBet: (seat: HandIndex) => void;
  onSideBet: (seat: HandIndex, kind: 'pp' | '21+3') => void;
  className?: string;
  /** Pushes all table content down so Pixi respects the HTML logo overlay (stage Y). */
  contentInsetTopPx?: number;
}

export function PixiTableCanvas({
  snapshot,
  selectedChipCents,
  onSelectChip,
  onMainBet,
  onSideBet,
  className,
  contentInsetTopPx = 0,
}: PixiTableCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const insetRef = useRef(0);
  insetRef.current = Math.max(0, contentInsetTopPx);
  const appRef = useRef<Application | null>(null);
  const gameRef = useRef<Container | null>(null);
  const suitTexRef = useRef<Record<Suit, Texture> | null>(null);
  const brandLogoRef = useRef<Texture | null>(null);
  const dealerIconRef = useRef<Texture | null>(null);
  const chipTexRef = useRef<(Texture | null)[] | null>(null);
  const prevSnapshotRef = useRef<TableSnapshot | null>(null);
  const snapshotRef = useRef(snapshot);

  const interactionRef = useRef<TableDrawInteraction>({
    selectedChipCents,
    onSelectChip,
    onMainBet,
    onSideBet,
  });
  interactionRef.current = { selectedChipCents, onSelectChip, onMainBet, onSideBet };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;
    const gameLayer = new Container();
    const bgGraphics = new Graphics();

    const paintGame = (fw: number, fh: number) => {
      if (fw < 16 || fh < 16) return;
      const inset = insetRef.current;
      const lh = Math.max(16, fh - inset);
      gameLayer.position.y = inset;
      const inter =
        snapshotRef.current.phase === GamePhase.Betting ? interactionRef.current : null;
      drawGameLayer(
        gameLayer,
        snapshotRef.current,
        fw,
        lh,
        inter,
        suitTexRef.current,
        brandLogoRef.current,
        {
          chipTextures: chipTexRef.current,
          dealerIcon: dealerIconRef.current,
        },
      );
    };

    const paint = (fw: number, fh: number) => {
      if (fw < 16 || fh < 16) return;
      drawFeltBackground(bgGraphics, fw, fh);
      paintGame(fw, fh);
    };

    (async () => {
      const app = new Application();
      await app.init({
        width: host.clientWidth || 360,
        height: host.clientHeight || 480,
        backgroundAlpha: 0,
        antialias: true,
        resolution: tablePixelRatio(),
        autoDensity: true,
        powerPreference: 'high-performance',
      });
      if (cancelled) {
        app.destroy(true);
        return;
      }

      appRef.current = app;
      gameRef.current = gameLayer;

      app.stage.eventMode = 'static';
      gameLayer.eventMode = 'static';
      app.stage.addChild(bgGraphics);
      app.stage.addChild(gameLayer);
      initWinParticleLayer(app.stage);

      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      host.appendChild(canvas);

      try {
        suitTexRef.current = await loadSuitTextures();
      } catch (err) {
        console.warn('[Pixi] Could not load suit SVGs; using text pips.', err);
        suitTexRef.current = null;
      }
      try {
        brandLogoRef.current = await loadBrandLogoTexture();
      } catch {
        brandLogoRef.current = null;
      }
      try {
        dealerIconRef.current = await loadDealerIconTexture();
      } catch {
        dealerIconRef.current = null;
      }
      try {
        chipTexRef.current = await loadChipTextures();
      } catch {
        chipTexRef.current = null;
      }

      app.ticker.add(() => {
        const fw = app.renderer.width;
        const fh = app.renderer.height;
        const now = performance.now();
        stepCardFlights(app.ticker.deltaMS);
        const scoreDirty = tickTableScoreAnimations(now);
        const chipDirty = tickChipAnimations(now);
        const particlesDirty = tickWinParticles(app.ticker.deltaMS);
        if (scoreDirty || chipDirty || areCardFlightsActive() || particlesDirty) {
          paintGame(fw, fh);
        }
      });

      ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (!cr) return;
        const fw = Math.floor(cr.width);
        const fh = Math.floor(cr.height);
        clearCardFlights();
        app.renderer.resize(fw, fh);
        paint(fw, fh);
      });
      ro.observe(host);
      paint(host.clientWidth, host.clientHeight);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      appRef.current?.destroy(true);
      appRef.current = null;
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const gameLayer = gameRef.current;
    if (!app || !gameLayer) return;
    const fw = app.renderer.width;
    const fh = app.renderer.height;
    const prev = prevSnapshotRef.current;
    const inset = insetRef.current;
    const lh = Math.max(16, fh - inset);
    gameLayer.position.y = inset;
    syncCardFlights(prev, snapshot, fw, lh);

    // Update the live ref AFTER flights are queued so the ticker never sees
    // a new snapshot without corresponding flights (prevents snap).
    snapshotRef.current = snapshot;

    // Trigger win particles when a new settlement hand is revealed as win/blackjack
    if (
      snapshot.phase === GamePhase.Settlement &&
      snapshot.settlementRevealIndex !== null &&
      snapshot.settlementRevealIndex !== prev?.settlementRevealIndex
    ) {
      const seat = snapshot.seats[snapshot.settlementRevealIndex];
      if (seat?.settlement) {
        const kind = seat.settlement.kind;
        if (kind === 'win' || kind === 'blackjack') {
          const spots = buildSeatUiSpots(snapshot, fw, lh);
          const spot = spots.find((s) => s.index === snapshot.settlementRevealIndex);
          if (spot) {
            emitWinParticles(spot.sx, spot.sy + inset, kind === 'blackjack');
          }
        }
      }
    }
    // Confetti on side bet wins (detected when pp/21+3 results first appear after dealing)
    if (
      prev &&
      snapshot.phase !== GamePhase.Betting &&
      snapshot.phase !== GamePhase.Dealing
    ) {
      for (const seat of snapshot.seats) {
        if (!seat.inRound) continue;
        const prevSeat = prev.seats[seat.index];
        const ppJustWon = seat.ppResult?.won && !prevSeat?.ppResult;
        const t1JustWon = seat.twentyOneResult?.won && !prevSeat?.twentyOneResult;
        if (ppJustWon || t1JustWon) {
          const spots = buildSeatUiSpots(snapshot, fw, lh);
          const spot = spots.find((s) => s.index === seat.index);
          if (spot) emitWinParticles(spot.sx, spot.sy + inset, false);
        }
      }
    }

    // Confetti on blackjack during PlayerTurn (not just settlement)
    if (
      snapshot.phase === GamePhase.PlayerTurn &&
      prev?.phase !== GamePhase.PlayerTurn
    ) {
      for (const seat of snapshot.seats) {
        if (!seat.inRound || seat.hand.cards.length !== 2) continue;
        if (isBlackjack(seat.hand.cards)) {
          const spots = buildSeatUiSpots(snapshot, fw, lh);
          const spot = spots.find((s) => s.index === seat.index);
          if (spot) emitWinParticles(spot.sx, spot.sy + inset, true);
        }
      }
    }

    // Clear particles when returning to betting
    if (snapshot.phase === GamePhase.Betting) {
      clearWinParticles();
    }

    prevSnapshotRef.current = snapshot;
    syncTableScoreAnimations(snapshot);

    const selIdx = TABLE_CHIP_DENOMS.findIndex((d) => d.cents === selectedChipCents);
    syncChipSelection(selIdx, TABLE_CHIP_DENOMS.length);

    const bg = app.stage.children[0];
    if (bg instanceof Graphics) drawFeltBackground(bg, fw, fh);
    const inter = snapshot.phase === GamePhase.Betting ? interactionRef.current : null;
    drawGameLayer(
      gameLayer,
      snapshot,
      fw,
      lh,
      inter,
      suitTexRef.current,
      brandLogoRef.current,
      {
        chipTextures: chipTexRef.current,
        dealerIcon: dealerIconRef.current,
      },
    );
  }, [snapshot.revision, snapshot, selectedChipCents, contentInsetTopPx]);

  return (
    <div
      ref={hostRef}
      className={[className, 'bg-transparent'].filter(Boolean).join(' ')}
      style={{ touchAction: 'none' }}
      aria-label="Blackjack table"
    />
  );
}
