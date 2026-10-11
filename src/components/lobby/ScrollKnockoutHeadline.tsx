'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';

const LINE_1 = 'exceedingly good games';
const LINE_2 = 'that suits you sir';
const IMAGE_SRC = '/tash-pattern.jpg';
const FONT_SIZE = 'clamp(112px, 18vw, 300px)';

/** Same pacing as Scuup landing */
const TICKER_1_BASE = -160;
const TICKER_2_BASE = -280;
const TICKER_RANGE = 628;

function textFillStyle(
  imageSrc: string,
  tickerX: number,
  bgX: number,
  bgY: number,
  imagePositionY: string,
): CSSProperties {
  const pos = `${-tickerX + bgX}px calc(${imagePositionY} + ${bgY}px)`;
  return {
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    /* Match site purple if fill doesn't cover a glyph edge */
    backgroundColor: '#0e0620',
    /*
      Candy wash underneath + tash pattern on top.
      Screen drops the pattern’s black so letters stay solid and the
      pink/orange mustaches show through the type.
    */
    backgroundImage: `
      url(${imageSrc}),
      linear-gradient(
        180deg,
        #ffc14a 0%,
        #ff7a28 32%,
        #ff4d3a 62%,
        #e83e8c 100%
      )
    `,
    backgroundRepeat: 'repeat, no-repeat',
    backgroundSize: 'min(72vw, 860px) auto, 120vw auto',
    /* Counter ticker so image stays fixed while text slides */
    backgroundPosition: `${pos}, ${pos}`,
    backgroundBlendMode: 'screen, normal',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
  };
}

function HeadlineRow({
  text,
  textRef,
  imageSrc,
  imagePositionY,
  tickerX,
  bgX,
  bgY,
  rowClassName,
}: {
  text: string;
  textRef: RefObject<HTMLParagraphElement | null>;
  imageSrc: string;
  imagePositionY: string;
  tickerX: number;
  bgX: number;
  bgY: number;
  rowClassName?: string;
}) {
  return (
    <div
      className={cn('relative w-full overflow-x-clip', rowClassName)}
      style={{ fontSize: FONT_SIZE }}
    >
      <div
        aria-hidden
        className="parallax-knockout__fade parallax-knockout__fade--left"
      />
      <div
        aria-hidden
        className="parallax-knockout__fade parallax-knockout__fade--right"
      />

      <div
        className="relative will-change-transform"
        style={{ transform: `translate3d(${tickerX}px, 0, 0)` }}
      >
        <p
          ref={textRef}
          className="w-max max-w-none whitespace-nowrap font-['Staatliches',system-ui,sans-serif] font-normal leading-[0.98] tracking-[-0.02em] uppercase"
          style={textFillStyle(imageSrc, tickerX, bgX, bgY, imagePositionY)}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

export function ScrollKnockoutHeadline() {
  const sectionRef = useRef<HTMLElement>(null);
  const line1Ref = useRef<HTMLParagraphElement>(null);
  const line2Ref = useRef<HTMLParagraphElement>(null);
  const [shift, setShift] = useState(0.5);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh;
      const end = -rect.height;
      const raw = (start - rect.top) / (start - end);
      setShift(Math.max(0, Math.min(1, raw)));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const delta = shift - 0.5;

  const ticker1X = reduceMotion
    ? TICKER_1_BASE
    : TICKER_1_BASE + delta * -TICKER_RANGE;
  const ticker2X = reduceMotion
    ? TICKER_2_BASE
    : TICKER_2_BASE + delta * TICKER_RANGE;

  const bgX = reduceMotion ? 0 : delta * -98;
  const bgY1 = reduceMotion ? 0 : delta * -98;
  const bgY2 = reduceMotion ? 0 : delta * -98;

  const fullText = `${LINE_1} ${LINE_2}`;

  return (
    <section
      ref={sectionRef}
      aria-label={fullText}
      className="parallax-knockout relative left-1/2 z-20 w-screen max-w-none -translate-x-1/2 overflow-x-clip border-0 py-8 sm:py-12"
    >
      <HeadlineRow
        text={LINE_1}
        textRef={line1Ref}
        imageSrc={IMAGE_SRC}
        imagePositionY="35%"
        tickerX={ticker1X}
        bgX={bgX}
        bgY={bgY1}
        rowClassName="pt-[0.06em] pb-[0.03em]"
      />
      <HeadlineRow
        text={LINE_2}
        textRef={line2Ref}
        imageSrc={IMAGE_SRC}
        imagePositionY="68%"
        tickerX={ticker2X}
        bgX={bgX}
        bgY={bgY2}
        rowClassName="-mt-[0.06em] pb-[0.06em]"
      />
      <p className="sr-only">{fullText}</p>
    </section>
  );
}
