/**
 * Hot Fiesta sound-effect manager.
 * Reuses Froot Jarz sounds for now — swap paths when custom assets arrive.
 */

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

const SFX_FILES = {
  spin: `${BASE}frootshoot/first spin.wav`,
  rowClick: `${BASE}frootshoot/row_clcik.wav`,
  jar: `${BASE}frootshoot/jar.wav`,
  explode: `${BASE}frootshoot/explode.wav`,
  win: `${BASE}sounds/Win.wav`,
  win2: `${BASE}sounds/win2.wav`,
  chipStack: `${BASE}sounds/PokerChipStack_BW.48724.wav`,
} as const;

export type HFSfxName = keyof typeof SFX_FILES;

let ctx: AudioContext | null = null;
const buffers = new Map<HFSfxName, AudioBuffer>();
let loaded = false;
let loading = false;
let muted = false;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
  }
  return ctx;
}

export function unlockHFAudio(): void {
  const ac = getContext();
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
}

export async function preloadHFSfx(): Promise<void> {
  unlockHFAudio();
  if (loaded || loading) return;
  loading = true;
  const ac = getContext();

  await Promise.all(
    (Object.entries(SFX_FILES) as [HFSfxName, string][]).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ac.decodeAudioData(arrayBuf);
        buffers.set(name, audioBuf);
      } catch {
        // Non-critical
      }
    }),
  );

  loaded = true;
  loading = false;
}

export function setHFSfxMuted(value: boolean): void {
  muted = value;
}

export function playHF(name: HFSfxName, volume = 0.5): void {
  if (muted) return;
  const buf = buffers.get(name);
  if (!buf) return;

  const ac = getContext();
  if (ac.state === 'suspended') ac.resume();

  const source = ac.createBufferSource();
  source.buffer = buf;

  const gain = ac.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ac.destination);
  source.start(0);
}

export function playHFPitched(name: HFSfxName, rate = 1, volume = 0.5): void {
  if (muted) return;
  const buf = buffers.get(name);
  if (!buf) return;

  const ac = getContext();
  if (ac.state === 'suspended') ac.resume();

  const source = ac.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = rate;

  const gain = ac.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ac.destination);
  source.start(0);
}

// ── Background music ──

const BGM_URL = `${BASE}sounds/cozy-jazz-piano-2025-01-15-22-25-52-utc/Cozy Jazz Piano.mp3`;
let bgmBuffer: AudioBuffer | null = null;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGain: GainNode | null = null;
let bgmPlaying = false;
let bgmMuted = false;

let bgmLoadingPromise: Promise<void> | null = null;

function loadBgm(): Promise<void> {
  if (bgmBuffer) return Promise.resolve();
  if (bgmLoadingPromise) return bgmLoadingPromise;
  bgmLoadingPromise = (async () => {
    const ac = getContext();
    try {
      const res = await fetch(BGM_URL);
      const arrayBuf = await res.arrayBuffer();
      bgmBuffer = await ac.decodeAudioData(arrayBuf);
    } catch {
      // Non-critical
    }
  })();
  return bgmLoadingPromise;
}

export function preloadHFBgm(): void {
  loadBgm();
}

export async function startHFBgm(volume = 0.04): Promise<void> {
  if (bgmPlaying) return;

  const ac = getContext();
  if (ac.state === 'suspended') {
    try { await ac.resume(); } catch { /* ignore */ }
  }

  await loadBgm();
  if (!bgmBuffer || bgmPlaying) return;

  bgmSource = ac.createBufferSource();
  bgmSource.buffer = bgmBuffer;
  bgmSource.loop = true;

  bgmGain = ac.createGain();
  bgmGain.gain.value = bgmMuted ? 0 : volume;

  bgmSource.connect(bgmGain);
  bgmGain.connect(ac.destination);
  bgmSource.start(0);
  bgmPlaying = true;
}

export function stopHFBgm(): void {
  if (bgmSource) {
    try { bgmSource.stop(); } catch { /* already stopped */ }
    bgmSource = null;
  }
  bgmPlaying = false;
}

export function setHFBgmMuted(value: boolean): void {
  bgmMuted = value;
  if (bgmGain) {
    bgmGain.gain.value = value ? 0 : 0.04;
  }
}
