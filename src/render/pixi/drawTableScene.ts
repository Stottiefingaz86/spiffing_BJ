/**
 * Pixi scene from engine snapshot + betting interactions (no shoe/rules).
 */
import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';

import type { Card, Suit } from '@/game/domain/card';
import { buildPlayingCard } from '@/render/pixi/cardFace';
import { TABLE_CHIP_DENOMS } from '@/lib/tableChips';
import { scoreHand, isBlackjack } from '@/game/rules/scoring';
import {
  animatedDealerScoreLabel,
  animatedSeatScoreLabel,
} from '@/render/pixi/tableScoreAnimation';
import { GamePhase } from '@/game/state/phases';
import type { HandIndex, TableSnapshot } from '@/game/state/table-state';

import { applyCardFlight } from '@/render/pixi/cardFlights';
import type { CardPlacement } from '@/render/pixi/playLayout';
import { buildCardLayoutMap, buildSeatUiSpots, heroSeatForLayout } from '@/render/pixi/playLayout';
import { tablePixelRatio } from '@/render/pixi/renderQuality';
import { chipAnimScale, chipAnimOffsetX, chipAnimOffsetY } from '@/render/pixi/chipSelectAnimation';
import { formatMoney } from '@/lib/formatMoney';

/** Card root containers keyed by id — updated each frame during deal/hit flights without full scene rebuild. */
const cardFlightWraps = new Map<string, Container>();

function clearCardFlightWrapRegistry(): void {
  cardFlightWraps.clear();
}


export function updateRegisteredCardFlightWraps(
  snapshot: TableSnapshot,
  w: number,
  h: number,
  suitTextures: Record<Suit, Texture> | null,
  brandLogo: Texture | null,
): void {
  if (cardFlightWraps.size === 0) return;
  const layout = buildCardLayoutMap(snapshot, w, h);
  for (const [id, wrap] of cardFlightWraps) {
    const pl = layout.get(id);
    if (!pl) continue;
    const motion = applyCardFlight(id, pl);
    wrap.position.set(motion.x, motion.y);
    wrap.alpha = motion.alpha;

    const sizeChanged =
      Math.abs(motion.cw - pl.cw) > 0.5 || Math.abs(motion.ch - pl.ch) > 0.5;
    const isFlipping = motion.flipScaleX < 0.99;
    if (sizeChanged || isFlipping) {
      const card = cardForId(snapshot, id);
      if (card) {
        while (wrap.children.length > 0) {
          wrap.removeChildAt(0).destroy({ children: true });
        }
        const renderCard = motion.flipShowBack ? { ...card, faceUp: false } : card;
        const g = buildPlayingCard(renderCard, motion.cw, motion.ch, suitTextures, brandLogo);
        g.scale.x = motion.flipScaleX;
        wrap.addChild(g);
      }
    }
    wrap.scale.set(motion.scale);
  }
}

function cardForId(snapshot: TableSnapshot, id: string): Card | null {
  for (const c of snapshot.dealer.hand.cards) if (c.id === id) return c;
  for (const s of snapshot.seats) for (const c of s.hand.cards) if (c.id === id) return c;
  return null;
}

/** Betting taps on main BET circles; chip row selects denomination. */
export interface TableDrawInteraction {
  selectedChipCents: number;
  onSelectChip: (cents: number) => void;
  onMainBet: (seat: HandIndex) => void;
  onSideBet: (seat: HandIndex, kind: 'pp' | '21+3') => void;
}

/** Table surface: drawn transparent so the app shell provides the only background (no canvas “panel”). */
/** Betting tiles — subtle glass on felt, not a separate “panel”. */
const SPOT_BG_MAIN = 0x1e1630;
const SPOT_BG_SIDE = 0x8b7ba0;
const ACCENT_GREEN = 0x4ade80;
const TEXT_DIM = 0xd4c4e8;
const TEXT_MUTED = 0xc4b5e8;
const TEXT_PP = 0xf0e8ff;

function formatBetCents(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(1)}K`;
  if (d === Math.floor(d)) return `$${d.toFixed(0)}`;
  return `$${d.toFixed(2)}`;
}

/** Rounded-square UI — larger radius for the solid-box mockup look. */
function uiCornerRadius(bw: number, bh: number): number {
  return Math.min(18, Math.min(bw, bh) * 0.20);
}

function betToChipDenomLayers(cents: number, maxLayers: number): number[] {
  const layers: number[] = [];
  let remaining = cents;
  for (let d = TABLE_CHIP_DENOMS.length - 1; d >= 0; d--) {
    const v = TABLE_CHIP_DENOMS[d]!.cents;
    while (remaining >= v && layers.length < maxLayers) {
      layers.push(d);
      remaining -= v;
    }
  }
  return layers;
}

function drawMiniBetChip(
  cx: number,
  cy: number,
  radius: number,
  denomIndex: number,
  chipTextures: (Texture | null)[] | null,
  opts?: { showDenomLabel?: boolean },
): Container {
  const wrap = new Container();
  wrap.x = cx;
  wrap.y = cy;
  const d = TABLE_CHIP_DENOMS[denomIndex]!;
  const tex = chipTextures?.[denomIndex] ?? null;
  const showDenom = opts?.showDenomLabel !== false;

  if (tex) {
    const sc = (radius * 2.15) / Math.max(tex.width, tex.height);
    const sp = new Sprite(tex);
    sp.anchor.set(0.5, 0.5);
    sp.scale.set(sc);
    wrap.addChild(sp);
  } else {
    const g = new Graphics();
    g.circle(0, 0, radius).fill({ color: d.fill });
    g.circle(0, 0, radius).stroke({ width: 2.5, color: d.ring, alpha: 0.95 });
    wrap.addChild(g);
  }

  if (showDenom) {
    const fontPx = Math.min(11, Math.max(7, radius * 0.52));
    const t = new Text({
      text: d.label,
      resolution: tablePixelRatio(),
      roundPixels: false,
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: fontPx,
        fontWeight: '800',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 1 },
      },
    });
    t.anchor.set(0.5, 0.5);
    wrap.addChild(t);
  }
  return wrap;
}

function addBettingChipStack(
  root: Container,
  cx: number,
  midY: number,
  mainH: number,
  betCents: number,
  chipTextures: (Texture | null)[] | null,
  colW: number,
): void {
  const maxLayers = 6;
  const layers = betToChipDenomLayers(betCents, maxLayers);
  if (layers.length === 0) return;

  const L = layers.length;
  const pillFs = Math.min(13, Math.max(10, colW * 0.11));
  const pillH = pillFs + 14;
  const gap = 10;
  const maxBlockH = Math.max(48, mainH * 0.86);

  let chipR = Math.min(22, Math.max(14, colW * 0.34));
  const blockHeight = (r: number) => {
    const dy = Math.max(3, r * 0.28);
    const stackH = (L - 1) * dy + 2 * r;
    return stackH + gap + pillH;
  };
  while (blockHeight(chipR) > maxBlockH && chipR > 11) {
    chipR -= 0.75;
  }
  const dy = Math.max(3, chipR * 0.28);
  const stackH = (L - 1) * dy + 2 * chipR;
  const blockH = stackH + gap + pillH;
  const blockTop = midY - blockH / 2;
  const stackBaseY = blockTop + stackH - chipR;

  for (let i = 0; i < L; i++) {
    const denomIdx = layers[i]!;
    const j = drawMiniBetChip(0, 0, chipR, denomIdx, chipTextures, {
      showDenomLabel: false,
    });
    j.x = cx + (i % 2 === 0 ? -1 : 1) * 1.25;
    j.y = stackBaseY - i * dy;
    root.addChild(j);
  }

  const totalPill = pillLabel(formatBetCents(betCents), 0x111827, 0xffffff, pillFs);
  totalPill.x = cx;
  totalPill.y = stackBaseY + chipR + gap + pillH / 2;
  root.addChild(totalPill);
}

function addSideBetChipStack(
  root: Container,
  cx: number,
  cy: number,
  boxSz: number,
  betCents: number,
  chipTextures: (Texture | null)[] | null,
): void {
  const layers = betToChipDenomLayers(betCents, 4);
  if (layers.length === 0) return;
  const chipR = Math.min(12, boxSz * 0.22);
  const dy = Math.max(2, chipR * 0.25);
  const L = layers.length;
  const stackH = (L - 1) * dy;
  const baseY = cy + stackH / 2;
  for (let i = 0; i < L; i++) {
    const j = drawMiniBetChip(0, 0, chipR, layers[i]!, chipTextures, { showDenomLabel: false });
    j.x = cx;
    j.y = baseY - i * dy;
    root.addChild(j);
  }
  const lbl = pillLabel(formatBetCents(betCents), 0x111827, 0xffffff, Math.min(9, boxSz * 0.15));
  lbl.x = cx;
  lbl.y = baseY - L * dy - 6;
  root.addChild(lbl);
}

/** Play phase: bet amount pill with gradient stroke on desktop for polish. */
function addBetAmountPill(
  root: Container,
  cx: number,
  cy: number,
  betCents: number,
  fontSize: number,
  isDesktop = false,
): void {
  const wrap = new Container();
  const t = new Text({
    text: formatBetCents(betCents),
    resolution: tablePixelRatio(),
    roundPixels: false,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: isDesktop ? fontSize + 2 : fontSize,
      fontWeight: isDesktop ? '700' : '600',
      fill: 0xffffff,
    },
  });
  const padX = isDesktop ? 14 : 8;
  const padY = isDesktop ? 6 : 4;
  const bw = t.width + padX * 2;
  const bh = t.height + padY * 2;
  const cr = Math.min(bw, bh) / 2;

  const g = new Graphics();
  g.roundRect(-bw / 2, -bh / 2, bw, bh, cr).fill({ color: 0x0f0f12, alpha: 0.92 });
  if (isDesktop) {
    g.roundRect(-bw / 2, -bh / 2, bw, bh, cr).stroke({ color: 0xc084fc, width: 1.5, alpha: 0.45 });
  }
  wrap.addChild(g);
  t.anchor.set(0.5, 0.5);
  wrap.addChild(t);
  wrap.x = cx;
  wrap.y = cy;
  root.addChild(wrap);
}

function addDealerBadge(
  root: Container,
  anchorX: number,
  anchorY: number,
  dealerIcon: Texture | null,
  narrow = false,
): void {
  const cluster = new Container();
  cluster.x = anchorX;
  cluster.y = anchorY;

  const iconSize = narrow ? 16 : 22;
  if (dealerIcon) {
    const sprite = new Sprite(dealerIcon);
    sprite.anchor.set(0.5, 0.5);
    const sc = iconSize / Math.max(dealerIcon.width, dealerIcon.height);
    sprite.scale.set(sc);
    sprite.alpha = 0.85;
    sprite.y = narrow ? -5 : -8;
    cluster.addChild(sprite);
  }

  const lbl = new Text({
    text: 'DEALER',
    resolution: tablePixelRatio(),
    roundPixels: false,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: narrow ? 5 : 6.5,
      fontWeight: '800',
      letterSpacing: narrow ? 0.8 : 1.2,
      fill: 0xffffff,
    },
  });
  lbl.anchor.set(0.5, 0);
  lbl.alpha = 0.45;
  lbl.y = narrow ? 4 : 6;
  cluster.addChild(lbl);

  root.addChild(cluster);
}

export function drawFeltBackground(g: Graphics, _w: number, _h: number): void {
  g.clear();
}

function pillLabel(text: string, bg: number, fg: number, fontSize: number): Container {
  const wrap = new Container();
  const t = new Text({
    text,
    resolution: tablePixelRatio(),
    roundPixels: false,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize,
      fontWeight: '600',
      fill: fg,
    },
  });
  const padX = 8;
  const padY = 4;
  const bw = t.width + padX * 2;
  const bh = t.height + padY * 2;
  const cr = Math.min(bw, bh) / 2;
  const g = new Graphics();
  g.roundRect(-bw / 2, -bh / 2, bw, bh, cr).fill({ color: bg, alpha: 0.92 });
  wrap.addChild(g);
  t.anchor.set(0.5, 0.5);
  wrap.addChild(t);
  return wrap;
}

/** Prominent score pill with colored border — used for mobile hand labels. */
function borderedPill(
  text: string,
  bg: number,
  fg: number,
  borderColor: number,
  fontSize: number,
): Container {
  const wrap = new Container();
  const t = new Text({
    text,
    resolution: tablePixelRatio(),
    roundPixels: false,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize,
      fontWeight: '700',
      fill: fg,
    },
  });
  const padX = 14;
  const padY = 5;
  const bw = Math.max(t.width + padX * 2, 40);
  const bh = t.height + padY * 2;
  const cr = bh / 2;
  const g = new Graphics();
  g.roundRect(-bw / 2, -bh / 2, bw, bh, cr).fill({ color: bg, alpha: 0.92 });
  g.roundRect(-bw / 2, -bh / 2, bw, bh, cr).stroke({ width: 1.5, color: borderColor, alpha: 0.85 });
  wrap.addChild(g);
  t.anchor.set(0.5, 0.5);
  wrap.addChild(t);
  return wrap;
}

function bettingSpotContainer(
  cx: number,
  cy: number,
  bw: number,
  bh: number,
  label: string,
  opts: { accentGreen?: boolean; muted?: boolean; hasBet?: boolean; onPress?: () => void },
): Container {
  const wrap = new Container();
  wrap.x = cx;
  wrap.y = cy;

  const spotR = uiCornerRadius(bw, bh);
  const g = new Graphics();

  if (opts.muted) {
    g.roundRect(-bw / 2, -bh / 2, bw, bh, spotR).stroke({
      width: 1,
      color: 0xffffff,
      alpha: 0.08,
    });
  } else if (opts.hasBet) {
    g.roundRect(-bw / 2, -bh / 2, bw, bh, spotR).stroke({
      width: 1.5,
      color: ACCENT_GREEN,
      alpha: 0.6,
    });
  } else {
    g.roundRect(-bw / 2, -bh / 2, bw, bh, spotR).stroke({
      width: 1.5,
      color: 0xffffff,
      alpha: 0.12,
    });
  }

  wrap.addChild(g);

  if (label.trim().length > 0) {
    const isMain = opts.accentGreen;
    const fillCol = isMain ? ACCENT_GREEN : opts.muted ? TEXT_PP : TEXT_MUTED;
    const t = new Text({
      text: label,
      resolution: tablePixelRatio(),
      roundPixels: false,
      style: {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: isMain ? Math.min(20, bw * 0.24) : Math.min(13, bw * 0.22),
        fontWeight: '800',
        fill: fillCol,
        letterSpacing: isMain ? 1.5 : 0.6,
      },
    });
    t.anchor.set(0.5, 0.5);
    if (opts.muted) t.alpha = 0.65;
    wrap.addChild(t);
  }

  if (opts.onPress) {
    wrap.eventMode = 'static';
    wrap.cursor = 'pointer';
    wrap.hitArea = new Rectangle(-bw / 2, -bh / 2, bw, bh);
    wrap.on('pointertap', opts.onPress);
  }

  return wrap;
}

function chipDenomLabelStyle(_label: string, fontSize: number) {
  return {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize,
    fontWeight: '800' as const,
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 1 } as const,
  };
}

function drawCasinoChip(
  cx: number,
  cy: number,
  baseR: number,
  fill: number,
  ring: number,
  label: string,
  chipTexture: Texture | null | undefined,
  onPress: () => void,
  denomIndex: number,
): Container {
  const wrap = new Container();
  const animScale = chipAnimScale(denomIndex);
  const animOffX = chipAnimOffsetX(denomIndex);
  const animOffY = chipAnimOffsetY(denomIndex);
  wrap.x = cx + animOffX;
  wrap.y = cy + animOffY;

  if (chipTexture) {
    const maxD = baseR * 2.2;
    const texScale = maxD / Math.max(chipTexture.width, chipTexture.height);
    const inner = new Container();
    inner.scale.set(texScale * animScale);
    wrap.addChild(inner);

    const sp = new Sprite(chipTexture);
    sp.anchor.set(0.5, 0.5);
    inner.addChild(sp);

    const denom = Math.min(chipTexture.width, chipTexture.height);
    const fontSize = Math.min(13, Math.max(8, denom * 0.13));
    const t = new Text({
      text: label,
      resolution: tablePixelRatio(),
      roundPixels: false,
      style: chipDenomLabelStyle(label, fontSize),
    });
    t.anchor.set(0.5, 0.5);
    inner.addChild(t);
  } else {
    wrap.scale.set(animScale);
    const g = new Graphics();
    const r = baseR;
    g.circle(0, 0, r).fill({ color: fill });
    g.circle(0, 0, r).stroke({ width: 2.5, color: ring, alpha: 0.9 });
    g.circle(0, 0, r * 0.72).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
    wrap.addChild(g);

    const t = new Text({
      text: label,
      resolution: tablePixelRatio(),
      roundPixels: false,
      style: chipDenomLabelStyle(label, Math.min(13, r * 0.36)),
    });
    t.anchor.set(0.5, 0.5);
    wrap.addChild(t);
  }

  wrap.eventMode = 'static';
  wrap.cursor = 'pointer';
  const hitR = baseR * (chipTexture ? 1.15 : 1) + 10;
  wrap.hitArea = new Rectangle(-hitR, -hitR, hitR * 2, hitR * 2);
  wrap.on('pointertap', onPress);

  return wrap;
}

function drawBettingLayout(
  root: Container,
  snapshot: TableSnapshot,
  w: number,
  h: number,
  interaction: TableDrawInteraction,
  chipTextures: (Texture | null)[] | null,
): void {
  const narrow = w < 640;
  const title = new Text({
    text: 'PLACE YOUR BETS',
    resolution: tablePixelRatio(),
    roundPixels: false,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: Math.min(narrow ? 15 : 14, w * (narrow ? 0.042 : 0.036)),
      fontWeight: '600',
      fill: 0xffffff,
      letterSpacing: 1.8,
    },
  });
  title.alpha = narrow ? 0.92 : 0.85;
  title.anchor.set(0.5, 0);
  title.x = w / 2;
  // `h` is drawable height below HTML logo (PixiTableCanvas contentInsetTopPx)
  title.y = h * (narrow ? 0.028 : 0.048);
  root.addChild(title);
  const padX = w * (narrow ? 0.025 : 0.035);
  const usable = w - padX * 2;
  const colW = usable / 5;
  const boxInset = narrow ? 0.08 : 0.06;
  const sideSz = Math.min(colW * (1 - boxInset * 2) * 0.88, narrow ? 56 : 52, h * (narrow ? 0.095 : 0.088));
  const mainSz = Math.min(colW * (1 - boxInset * 2), narrow ? 118 : 108, h * (narrow ? 0.19 : 0.175));
  const mainH = Math.min(mainSz, colW * (1 - boxInset * 2) * 0.98);
  const mainW = Math.min(colW * (1 - boxInset * 2) * 0.98, mainH * 1.12);
  const stackGap = Math.max(6, h * 0.016);
  // Narrow: pull main BET stack up — large gap under “PLACE YOUR BETS” looked empty on phones
  const baseY = h * (narrow ? 0.30 : 0.415);

  const seatGeom: { cx: number; midY: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = padX + colW * (i + 0.5);
    const topY = baseY - mainH / 2 - stackGap - sideSz / 2;
    const midY = baseY;
    const botY = baseY + mainH / 2 + stackGap + sideSz / 2;
    seatGeom.push({ cx, midY });

    const seat = snapshot.seats[i]!;
    const hasBet = seat.bet > 0;
    const has21 = seat.twentyOneBet > 0;
    const hasPP = seat.ppBet > 0;
    const mainLabel = hasBet ? '' : 'BET';

    root.addChild(
      bettingSpotContainer(cx, topY, sideSz, sideSz, has21 ? '' : '21+3', {
        muted: !has21,
        hasBet: has21,
        onPress: () => interaction.onSideBet(i as HandIndex, '21+3'),
      }),
    );
    root.addChild(
      bettingSpotContainer(cx, midY, mainW, mainH, mainLabel, {
        accentGreen: true,
        hasBet,
        onPress: () => interaction.onMainBet(i as HandIndex),
      }),
    );
    root.addChild(
      bettingSpotContainer(cx, botY, sideSz, sideSz, hasPP ? '' : 'PP', {
        muted: !hasPP,
        hasBet: hasPP,
        onPress: () => interaction.onSideBet(i as HandIndex, 'pp'),
      }),
    );
  }

  // After every column's spots so later columns' felts do not cover earlier totals.
  for (let i = 0; i < 5; i++) {
    const seat = snapshot.seats[i]!;
    const { cx, midY } = seatGeom[i]!;
    if (seat.bet > 0) {
      addBettingChipStack(root, cx, midY, mainH, seat.bet, chipTextures, colW);
    }
    const topY = baseY - mainH / 2 - stackGap - sideSz / 2;
    const botY = baseY + mainH / 2 + stackGap + sideSz / 2;
    if (seat.twentyOneBet > 0) {
      addSideBetChipStack(root, cx, topY, sideSz, seat.twentyOneBet, chipTextures);
    }
    if (seat.ppBet > 0) {
      addSideBetChipStack(root, cx, botY, sideSz, seat.ppBet, chipTextures);
    }
  }

  const chipY = h * (narrow ? 0.72 : 0.785);
  const totalChipW = Math.min(w * (narrow ? 0.97 : 0.94), narrow ? 520 : 500);
  const step = totalChipW / TABLE_CHIP_DENOMS.length;
  const startX = w / 2 - (TABLE_CHIP_DENOMS.length - 1) * step * 0.5;
  const chipR = Math.min(narrow ? 44 : 40, Math.max(narrow ? 30 : 28, step * 0.5));

  TABLE_CHIP_DENOMS.forEach((d, i) => {
    const cx = startX + i * step;
    const tex = chipTextures?.[i] ?? null;
    const chip = drawCasinoChip(
      cx,
      chipY,
      chipR,
      d.fill,
      d.ring,
      d.label,
      tex,
      () => interaction.onSelectChip(d.cents),
      i,
    );
    root.addChild(chip);
  });
}

export interface DrawGameLayerExtras {
  chipTextures: (Texture | null)[] | null;
  dealerIcon: Texture | null;
}

function appendCardWithFlight(
  root: Container,
  card: Card,
  placement: CardPlacement,
  suitTextures: Record<Suit, Texture> | null,
  brandLogo: Texture | null,
): void {
  const motion = applyCardFlight(card.id, placement);
  const wrap = new Container();
  wrap.x = motion.x;
  wrap.y = motion.y;
  wrap.alpha = motion.alpha;

  const renderCard = motion.flipShowBack ? { ...card, faceUp: false } : card;
  const g = buildPlayingCard(renderCard, motion.cw, motion.ch, suitTextures, brandLogo);
  g.scale.x = motion.flipScaleX;

  wrap.scale.set(motion.scale);
  wrap.addChild(g);
  root.addChild(wrap);
  cardFlightWraps.set(card.id, wrap);
}

function dealerHandBounds(
  layout: Map<string, CardPlacement>,
  cards: Card[],
): { cx: number; top: number; bottom: number; left: number; right: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cards) {
    const pl = layout.get(c.id);
    if (!pl) continue;
    minX = Math.min(minX, pl.x - pl.cw / 2);
    maxX = Math.max(maxX, pl.x + pl.cw / 2);
    minY = Math.min(minY, pl.y - pl.ch / 2);
    maxY = Math.max(maxY, pl.y + pl.ch / 2);
  }
  if (minX === Infinity) return null;
  return {
    cx: (minX + maxX) / 2,
    top: minY,
    bottom: maxY,
    left: minX,
    right: maxX,
  };
}

export function drawGameLayer(
  root: Container,
  snapshot: TableSnapshot,
  w: number,
  h: number,
  interaction: TableDrawInteraction | null,
  suitTextures: Record<Suit, Texture> | null,
  brandLogo: Texture | null,
  extras?: DrawGameLayerExtras | null,
): void {
  clearCardFlightWrapRegistry();
  while (root.children.length > 0) {
    const ch = root.removeChildAt(0);
    ch.destroy({ children: true });
  }

  const chipTex = extras?.chipTextures ?? null;

  if (snapshot.phase === GamePhase.Betting && interaction) {
    drawBettingLayout(root, snapshot, w, h, interaction, chipTex);
    return;
  }

  const layout = buildCardLayoutMap(snapshot, w, h);
  const spots = buildSeatUiSpots(snapshot, w, h);
  const narrow = w < 640;
  const baseCw = narrow ? Math.min(56, w * 0.17) : Math.min(50, w * 0.11);
  const baseCh = baseCw * 1.4;
  const centerX = w / 2;
  const heroSeat = heroSeatForLayout(snapshot);

  for (let i = 0; i < 5; i++) {
    const seat = snapshot.seats[i]!;
    const spot = spots[i]!;
    const sx = spot.sx;
    const sy = spot.sy;
    const cards = seat.hand.cards;

    if (cards.length === 0) {
      /* empty seat — no box outline */
    }
  }

  const dealerCards = snapshot.dealer.hand.cards;
  const dealerBounds = dealerHandBounds(layout, dealerCards);
  const dealerIcon = extras?.dealerIcon ?? null;
  if (dealerBounds) {
    const badgeX = narrow
      ? dealerBounds.left - 20
      : dealerBounds.left - 26;
    addDealerBadge(
      root,
      badgeX,
      (dealerBounds.top + dealerBounds.bottom) / 2,
      dealerIcon,
      narrow,
    );
  }

  for (const card of dealerCards) {
    const pl = layout.get(card.id);
    if (pl) appendCardWithFlight(root, card, pl, suitTextures, brandLogo);
  }

  for (let i = 0; i < 5; i++) {
    const seat = snapshot.seats[i]!;
    for (const card of seat.hand.cards) {
      const pl = layout.get(card.id);
      if (pl) appendCardWithFlight(root, card, pl, suitTextures, brandLogo);
    }
  }

  if (dealerCards.length > 0 && dealerBounds) {
    const vis = scoreHand(dealerCards);
    const holeOpen = dealerCards.every((c) => c.faceUp);
    const resolved =
      snapshot.phase === GamePhase.Settlement ||
      snapshot.phase === GamePhase.RoundComplete;

    const scoreText = animatedDealerScoreLabel(snapshot);
    const scoreFill = vis.bust ? 0x7f1d1d : 0x1e1b2e;
    const dealerBorderCol = vis.bust ? 0xef4444 : 0xa855f7;
    const dScoreFs = narrow ? 10 : 12;
    const pill = borderedPill(scoreText, scoreFill, 0xffffff, dealerBorderCol, dScoreFs);
    pill.x = dealerBounds.right + (narrow ? 8 : 12);
    pill.y = dealerBounds.top;
    root.addChild(pill);

    if (resolved && holeOpen) {
      const line = vis.bust ? 'DEALER BUSTS' : `DEALER ${vis.total}`;
      const callFs = narrow ? Math.min(13, w * 0.035) : Math.min(18, w * 0.04);
      const call = new Text({
        text: line,
        resolution: tablePixelRatio(),
        roundPixels: true,
        style: {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: callFs,
          fontWeight: '800',
          fill: vis.bust ? 0xfecaca : 0xffffff,
          letterSpacing: narrow ? 1.2 : 1.8,
        },
      });
      call.anchor.set(0.5, 1);
      call.x = dealerBounds.cx;
      call.y = dealerBounds.top - (narrow ? 5 : 8);
      root.addChild(call);
    }
  }

  for (let i = 0; i < 5; i++) {
    const seat = snapshot.seats[i]!;
    const spot = spots[i]!;
    const sx = spot.sx;
    const sy = spot.sy;
    const cards = seat.hand.cards;
    if (cards.length === 0) continue;

    const refPl = layout.get(cards[0]!.id);
    const refCh = refPl?.ch ?? baseCh;
    const isHeroLayout = heroSeat !== null && i === heroSeat;
    const shrunk = heroSeat !== null && !isHeroLayout;

    let cardMinX = Infinity;
    let cardMaxX = -Infinity;
    let cardMinY = Infinity;
    let cardMaxY = -Infinity;
    for (const c of cards) {
      const pl = layout.get(c.id);
      if (!pl) continue;
      // pl.x/y are card center (buildPlayingCard draws centered at origin)
      cardMinX = Math.min(cardMinX, pl.x - pl.cw / 2);
      cardMaxX = Math.max(cardMaxX, pl.x + pl.cw / 2);
      cardMinY = Math.min(cardMinY, pl.y - pl.ch / 2);
      cardMaxY = Math.max(cardMaxY, pl.y + pl.ch / 2);
    }
    const cardCx = cardMinX < Infinity ? (cardMinX + cardMaxX) / 2 : sx;
    const cardTop = cardMinX < Infinity ? cardMinY : sy - refCh / 2;
    const cardBottom = cardMaxY > -Infinity ? cardMaxY : sy + refCh / 2;

    const total = scoreHand(cards);
    const scoreLabel = animatedSeatScoreLabel(snapshot, i);

    // Always show the numeric total.
    if (narrow) {
      const scoreFs = isHeroLayout ? 14 : 9;
      const borderCol = total.bust ? 0xef4444 : 0xd946ef;
      const scorePill = borderedPill(
        scoreLabel,
        total.bust ? 0x7f1d1d : 0x1e1b2e,
        0xffffff,
        borderCol,
        scoreFs,
      );
      scorePill.x = cardCx;
      scorePill.y = cardTop - 12;
      root.addChild(scorePill);
    } else {
      const scoreFs = isHeroLayout ? 14 : (shrunk ? 10 : 12);
      const borderCol = total.bust ? 0xef4444 : 0xa855f7;
      const scorePill = borderedPill(
        scoreLabel,
        total.bust ? 0x7f1d1d : 0x1e1b2e,
        0xffffff,
        borderCol,
        scoreFs,
      );
      scorePill.x = cardMaxX < Infinity ? cardMaxX + 10 : sx + 40;
      scorePill.y = cardTop + 4;
      root.addChild(scorePill);
    }

    if (seat.bet > 0 && snapshot.phase !== GamePhase.Betting) {
      const betFs = narrow ? (isHeroLayout ? 12 : 8) : (shrunk ? 10 : 12);
      const betY = cardBottom + (narrow ? 8 : 8);
      addBetAmountPill(root, cardCx, betY, seat.bet, betFs, !narrow);
    }

    const badgeRightX = cardMaxX < Infinity ? cardMaxX + 8 : sx + 40;

    const cardMidY = (cardTop + cardBottom) / 2;

    // On mobile rail hands, stack badges below the bet pill to avoid overlap.
    // On mobile hero or desktop, badges go centred on cards or beside them.
    const narrowRail = narrow && !isHeroLayout;
    const statusBadgeY = narrowRail
      ? cardBottom + (seat.bet > 0 ? 22 : 8)
      : (narrow ? cardMidY : cardTop + 18);

    if (total.bust) {
      const bustFs = narrow ? (isHeroLayout ? 12 : 8) : (shrunk ? 8 : 9);
      const bust = narrow
        ? borderedPill('BUST', 0x7f1d1d, 0xfecaca, 0xef4444, bustFs)
        : pillLabel('BUST', 0x7f1d1d, 0xfecaca, bustFs);
      bust.x = narrow ? cardCx : badgeRightX;
      bust.y = statusBadgeY;
      root.addChild(bust);
    } else if (isBlackjack(cards) && cards.length === 2) {
      const bjFs = narrow ? (isHeroLayout ? 12 : 8) : (shrunk ? 8 : 9);
      const bj = narrow
        ? borderedPill('BLACKJACK', 0x14532d, 0xbbf7d0, 0x22c55e, bjFs)
        : pillLabel('BLACKJACK', 0x14532d, 0xbbf7d0, bjFs);
      bj.x = narrow ? cardCx : badgeRightX;
      bj.y = statusBadgeY;
      root.addChild(bj);
    } else if (
      seat.status === 'stood' &&
      (snapshot.phase === GamePhase.PlayerTurn ||
        (snapshot.phase === GamePhase.HandTransition &&
          snapshot.handTransitionFrom === seat.index)) &&
      !isBlackjack(cards)
    ) {
      const stFs = narrow ? (isHeroLayout ? 12 : 8) : (shrunk ? 8 : 9);
      const st = narrow
        ? borderedPill('STAND', 0x831843, 0xffffff, 0xdb2777, stFs)
        : pillLabel('STAND', 0xdb2777, 0xffffff, stFs);
      st.x = narrow ? cardCx : badgeRightX;
      st.y = statusBadgeY;
      root.addChild(st);
    }

    const showSettlement =
      seat.settlement &&
      (snapshot.phase === GamePhase.RoundComplete ||
        snapshot.phase === GamePhase.Settlement);
    if (showSettlement && seat.settlement) {
      const isWin = seat.settlement.kind === 'win' || seat.settlement.kind === 'blackjack';
      const isLose = seat.settlement.kind === 'lose' || seat.settlement.kind === 'bust';
      const col = isWin ? 0x14532d : isLose ? 0x7f1d1d : 0x374151;
      const txtCol = isWin ? 0xbbf7d0 : isLose ? 0xfecaca : 0xffffff;

      const kindLabel = seat.settlement.kind === 'blackjack' ? 'BLACKJACK' : seat.settlement.kind.toUpperCase();
      const payoutCents = seat.settlement.payout;
      const payStr = payoutCents > 0
        ? `+${formatMoney(payoutCents)}`
        : payoutCents < 0
          ? `-${formatMoney(Math.abs(payoutCents))}`
          : formatMoney(0);
      const label = `${kindLabel}  ${payStr}`;

      const bannerFs = narrow ? (isHeroLayout ? 12 : 8) : (isHeroLayout ? 12 : (shrunk ? 8 : 9));
      const borderCol = isWin ? 0x22c55e : isLose ? 0xef4444 : 0x6b7280;
      const banner = narrow
        ? borderedPill(label, col, txtCol, borderCol, bannerFs)
        : pillLabel(label, col, txtCol, bannerFs);
      const settlementY = narrowRail
        ? cardBottom + (seat.bet > 0 ? 22 : 8)
        : (narrow ? cardMidY : cardBottom + 6);
      banner.x = narrow ? cardCx : cardCx;
      banner.y = settlementY;
      root.addChild(banner);

      // Side-bet win badges — shown only during settlement/round complete
      const sbFs = narrow ? (isHeroLayout ? 10 : 7) : (shrunk ? 8 : 9);
      let sbY = settlementY + (narrow ? 16 : 18);
      if (seat.ppResult?.won) {
        const p = borderedPill(`PP ${seat.ppResult.name}`, 0x14532d, 0xbbf7d0, 0x22c55e, sbFs);
        p.x = narrow ? cardCx : cardCx;
        p.y = sbY;
        root.addChild(p);
        sbY += narrow ? 16 : 18;
      }
      if (seat.twentyOneResult?.won) {
        const p = borderedPill(`21+3 ${seat.twentyOneResult.name}`, 0x14532d, 0xbbf7d0, 0x22c55e, sbFs);
        p.x = narrow ? cardCx : cardCx;
        p.y = sbY;
        root.addChild(p);
      }
    }
  }

  // Round summary is shown via the React balance area — no canvas overlay needed.

  const phaseText = phaseCopy(snapshot.phase);
  if (phaseText) {
    const phaseBanner = new Text({
      text: phaseText,
      resolution: tablePixelRatio(),
      roundPixels: false,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fontWeight: '600',
        fill: TEXT_DIM,
        letterSpacing: 1.2,
      },
    });
    phaseBanner.anchor.set(0.5, 0);
    phaseBanner.x = centerX;
    // Clear HTML logo + subtitle (gameLayer is already offset by contentInsetTopPx; y=8 still sat in that band)
    phaseBanner.y = Math.max(40, Math.round(h * (narrow ? 0.072 : 0.056)));
    root.addChild(phaseBanner);
  }
}

function phaseCopy(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.Betting:
      return '';
    case GamePhase.Dealing:
      return 'DEALING…';
    case GamePhase.InsuranceOffer:
      return 'INSURANCE?';
    case GamePhase.PlayerTurn:
      return '';
    case GamePhase.HandTransition:
      return '';
    case GamePhase.DealerTurn:
      return 'DEALER PLAYS';
    case GamePhase.Settlement:
      return '';
    case GamePhase.RoundComplete:
      return 'ROUND COMPLETE';
    default:
      return '';
  }
}
