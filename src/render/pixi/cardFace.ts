/**
 * Playing-card renderer matching the Spiffing Studios visual style:
 * bold rank top-left, large suit SVG centred in the bottom half, clean white face.
 */
import { Container, FillGradient, Graphics, Sprite, Text, Texture } from 'pixi.js';

import type { Card, Suit } from '@/game/domain/card';

import { tablePixelRatio } from './renderQuality';

const CARD_FACE = 0xffffff;

const LABEL_RES = (): number => tablePixelRatio();

function suitColor(suit: Suit): number {
  return suit === 'hearts' || suit === 'diamonds' ? 0xe6315f : 0x231f20;
}

function rankDisplay(rank: Card['rank']): string {
  return rank;
}

/**
 * Build one playing card as a Container centred on (0, 0).
 * @param cw card width in px
 * @param ch card height in px
 */
export function buildPlayingCard(
  card: Card,
  cw: number,
  ch: number,
  suitTextures: Record<Suit, Texture> | null,
  brandLogo: Texture | null,
): Container {
  const root = new Container();
  const r = Math.min(10, cw * 0.11);

  const shadow = new Graphics();
  shadow
    .roundRect(-cw / 2 + 0.5, -ch / 2 + 2, cw, ch, r)
    .fill({ color: 0x000000, alpha: 0.18 });
  root.addChild(shadow);

  if (!card.faceUp) {
    drawCardBack(root, cw, ch, r, brandLogo);
    return root;
  }

  const body = new Graphics();
  body.roundRect(-cw / 2, -ch / 2, cw, ch, r).fill({ color: CARD_FACE });
  body.roundRect(-cw / 2, -ch / 2, cw, ch, r).stroke({
    width: 0.7,
    color: 0xd1d5db,
    alpha: 0.6,
  });
  root.addChild(body);

  const col = suitColor(card.suit);
  const padX = Math.max(2.5, cw * 0.10);
  const padY = Math.max(2, ch * 0.06);

  if (cw < 24) {
    drawTinyFace(root, card, col, cw, ch, padX, padY);
  } else if (cw < 42) {
    drawSmallFace(root, card, col, cw, ch, padX, padY, suitTextures);
  } else {
    drawFullFace(root, card, col, cw, ch, padX, padY, suitTextures);
  }

  return root;
}

/** Very tiny — just rank, no room for suit. */
function drawTinyFace(
  root: Container,
  card: Card,
  col: number,
  cw: number,
  ch: number,
  padX: number,
  padY: number,
): void {
  const fs = Math.max(7, cw * 0.48);
  const t = new Text({
    text: rankDisplay(card.rank),
    resolution: LABEL_RES(),
    roundPixels: true,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: fs,
      fontWeight: '900',
      fill: col,
    },
  });
  t.anchor.set(0, 0);
  t.x = -cw / 2 + padX;
  t.y = -ch / 2 + padY;
  root.addChild(t);
}

/** Small cards — rank top-left + compact suit in bottom half. */
function drawSmallFace(
  root: Container,
  card: Card,
  col: number,
  cw: number,
  ch: number,
  padX: number,
  padY: number,
  suitTextures: Record<Suit, Texture> | null,
): void {
  const rankFs = Math.max(9, cw * 0.38);
  const tRank = new Text({
    text: rankDisplay(card.rank),
    resolution: LABEL_RES(),
    roundPixels: true,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: rankFs,
      fontWeight: '900',
      fill: col,
      letterSpacing: card.rank === '10' ? -0.6 : 0,
    },
  });
  tRank.anchor.set(0, 0);
  tRank.x = -cw / 2 + padX;
  tRank.y = -ch / 2 + padY;
  root.addChild(tRank);

  const suitSize = Math.max(14, cw * 0.45);
  const suitY = ch * 0.22;
  addSuitSprite(root, card.suit, col, 0, suitY, suitSize, suitTextures);
}

/** Full-size cards — large rank top-left, large suit in the bottom half. */
function drawFullFace(
  root: Container,
  card: Card,
  col: number,
  cw: number,
  ch: number,
  padX: number,
  padY: number,
  suitTextures: Record<Suit, Texture> | null,
): void {
  const rankFs = Math.max(14, cw * 0.30);
  const tRank = new Text({
    text: rankDisplay(card.rank),
    resolution: LABEL_RES(),
    roundPixels: true,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: rankFs,
      fontWeight: '800',
      fill: col,
      letterSpacing: card.rank === '10' ? -0.8 : 0,
    },
  });
  tRank.anchor.set(0, 0);
  tRank.x = -cw / 2 + padX;
  tRank.y = -ch / 2 + padY;
  root.addChild(tRank);

  const suitSize = Math.max(28, cw * 0.55);
  const suitY = ch * 0.18;
  addSuitSprite(root, card.suit, col, 0, suitY, suitSize, suitTextures);
}

function addSuitSprite(
  parent: Container,
  suit: Suit,
  col: number,
  x: number,
  y: number,
  size: number,
  suitTextures: Record<Suit, Texture> | null,
): void {
  if (suitTextures?.[suit]) {
    const sp = new Sprite(suitTextures[suit]);
    sp.anchor.set(0.5, 0.5);
    const sc = size / Math.max(sp.texture.width, sp.texture.height);
    sp.scale.set(sc);
    sp.x = x;
    sp.y = y;
    parent.addChild(sp);
  } else {
    const unicode: Record<Suit, string> = {
      hearts: '\u2665',
      diamonds: '\u2666',
      clubs: '\u2663',
      spades: '\u2660',
    };
    const t = new Text({
      text: unicode[suit],
      resolution: LABEL_RES(),
      roundPixels: true,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: size,
        fill: col,
      },
    });
    t.anchor.set(0.5, 0.5);
    t.x = x;
    t.y = y;
    parent.addChild(t);
  }
}

function drawCardBack(
  root: Container,
  cw: number,
  ch: number,
  r: number,
  brandLogo: Texture | null,
): void {
  const border = new Graphics();
  border.roundRect(-cw / 2, -ch / 2, cw, ch, r).fill({ color: CARD_FACE });
  root.addChild(border);

  const pad = Math.max(2, cw * 0.055);
  const innerW = cw - pad * 2;
  const innerH = ch - pad * 2;
  const innerR = Math.max(2, r - 2);

  const grad = new FillGradient({
    type: 'linear',
    colorStops: [
      { offset: 0, color: 0xf5a06a },
      { offset: 1, color: 0xe87a5a },
    ],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  });

  const inner = new Graphics();
  inner.roundRect(-innerW / 2, -innerH / 2, innerW, innerH, innerR).fill(grad);
  root.addChild(inner);

  if (brandLogo) {
    const maxW = cw * 0.62;
    const maxH = ch * 0.42;
    const sc = Math.min(maxW / brandLogo.width, maxH / brandLogo.height);

    const sp = new Sprite(brandLogo);
    sp.anchor.set(0.5, 0.5);
    sp.scale.set(sc);
    sp.tint = 0xffffff;
    root.addChild(sp);
  }
}
