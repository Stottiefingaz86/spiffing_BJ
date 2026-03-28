import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ParticleBackground } from '@/components/ParticleBackground';

interface GamePreloaderProps {
  children: ReactNode;
  assets?: string[];
  onPlay?: () => void;
}

export function GamePreloader({ children, assets = [], onPlay: onPlayProp }: GamePreloaderProps) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const loadedRef = useRef(0);
  const totalRef = useRef(Math.max(assets.length, 1));
  const startTime = useRef(Date.now());

  useEffect(() => {
    startTime.current = Date.now();

    if (assets.length === 0) {
      let p = 0;
      const iv = setInterval(() => {
        p += Math.random() * 12 + 4;
        if (p >= 100) {
          p = 100;
          clearInterval(iv);
          setProgress(100);
          const elapsed = Date.now() - startTime.current;
          setTimeout(() => setReady(true), Math.max(0, 1500 - elapsed));
          return;
        }
        setProgress(Math.round(p));
      }, 200);
      return () => clearInterval(iv);
    }

    totalRef.current = assets.length;
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      const pct = Math.round((loadedRef.current / totalRef.current) * 100);
      setProgress(pct);
      if (loadedRef.current >= totalRef.current) {
        const elapsed = Date.now() - startTime.current;
        setTimeout(() => { if (!cancelled) setReady(true); }, Math.max(0, 1500 - elapsed));
      }
    };

    for (const url of assets) {
      if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        fetch(url).then((r) => r.blob()).catch(() => {}).finally(() => { loadedRef.current++; check(); });
      } else {
        const img = new Image();
        img.onload = img.onerror = () => { loadedRef.current++; check(); };
        img.src = url;
      }
    }

    const fallback = setTimeout(() => { if (!cancelled) { setProgress(100); setReady(true); } }, 8000);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, []);

  const onPlay = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      ctx.resume();
    } catch {}

    onPlayProp?.();

    setFadeOut(true);
    setTimeout(() => setDismissed(true), 600);
  }, [onPlayProp]);

  if (dismissed) return <>{children}</>;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, visibility: 'hidden', pointerEvents: 'none' }}>
        {children}
      </div>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e0620',
          transition: 'opacity 0.6s ease',
          opacity: fadeOut ? 0 : 1,
          overflow: 'hidden',
        }}
      >
        <ParticleBackground />

        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '3rem 3.5rem 2.5rem',
          background: 'linear-gradient(180deg, rgba(14,6,32,0.92) 0%, rgba(20,10,45,0.96) 100%)',
          borderRadius: '1.5rem',
          border: '1px solid rgba(168,85,247,0.12)',
          boxShadow: '0 0 80px rgba(168,85,247,0.1), 0 30px 60px rgba(0,0,0,0.5)',
          minWidth: '320px',
          maxWidth: '380px',
        }}>
          {/* Logo + tagline grouped together */}
          <img
            src="/logo-spiffing.svg"
            alt="Spiffing Studios"
            style={{ height: '140px', width: 'auto' }}
          />
          <p style={{
            margin: '0 0 1rem',
            fontSize: '0.75rem',
            fontWeight: 400,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#fff',
            fontFamily: "'Staatliches', system-ui, sans-serif",
          }}>
            Exceedingly Entertaining
          </p>

          {/* Progress */}
          <div style={{ width: '100%', textAlign: 'center' }}>
            <p style={{
              margin: '0 0 0.75rem',
              fontSize: '4rem',
              fontWeight: 400,
              color: '#fff',
              fontFamily: "'Staatliches', system-ui, sans-serif",
              lineHeight: 1,
              letterSpacing: '0.04em',
            }}>
              {progress}%
            </p>
            <div style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                borderRadius: '4px',
                transition: 'width 0.4s ease',
                boxShadow: progress > 0 ? '0 0 20px rgba(34,197,94,0.5)' : 'none',
              }} />
            </div>
          </div>

          {/* Play button */}
          <button
            type="button"
            onClick={onPlay}
            disabled={!ready}
            style={{
              width: '100%',
              marginTop: '1.25rem',
              padding: '1rem',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '1.1rem',
              fontWeight: 400,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: ready ? 'pointer' : 'default',
              color: '#fff',
              background: ready
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'rgba(255,255,255,0.06)',
              opacity: ready ? 1 : 0.4,
              transition: 'all 0.4s ease',
              boxShadow: ready ? '0 6px 30px rgba(34,197,94,0.4)' : 'none',
              fontFamily: "'Staatliches', system-ui, sans-serif",
            }}
          >
            {ready ? 'Play' : 'Loading...'}
          </button>
        </div>
      </div>
    </>
  );
}
