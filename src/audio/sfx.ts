/**
 * Lightweight sound-effect manager.
 * Preloads WAV files on first user interaction and plays them via the Web Audio API.
 */

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

const SFX_FILES = {
  cardDeal: `${BASE}sounds/CardDeal.wav`,
  cardFlip: `${BASE}sounds/CardFlip.wav`,
  stand: `${BASE}sounds/stand.wav`,
  chipStack: `${BASE}sounds/PokerChipStack_BW.48724.wav`,
  win: `${BASE}sounds/Win.wav`,
  buttonClick: `${BASE}sounds/button_click.mp3`,
} as const;

export type SfxName = keyof typeof SFX_FILES;

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let loaded = false;
let loading = false;
let muted = false;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
  }
  return ctx;
}

/**
 * Must be called inside a user-gesture handler (tap/click) so Safari
 * allows the AudioContext to start. Safe to call repeatedly.
 */
export function unlockAudio(): void {
  const ac = getContext();
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
}

export async function preloadSfx(): Promise<void> {
  unlockAudio();
  if (loaded || loading) return;
  loading = true;
  const ac = getContext();

  await Promise.all(
    (Object.entries(SFX_FILES) as [SfxName, string][]).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ac.decodeAudioData(arrayBuf);
        buffers.set(name, audioBuf);
      } catch {
        // Non-critical — game works without sound
      }
    }),
  );

  loaded = true;
  loading = false;
}

export function setSfxMuted(value: boolean): void {
  muted = value;
}

export function playSfx(name: SfxName, volume = 0.5): void {
  if (muted) return;
  const buf = buffers.get(name);
  if (!buf) return;

  const ac = getContext();
  if (ac.state === 'suspended') {
    ac.resume();
  }

  const source = ac.createBufferSource();
  source.buffer = buf;

  const gain = ac.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ac.destination);
  source.start(0);
}

/** Play a sound effect with a pitch shift (< 1 = lower, > 1 = higher). */
export function playSfxPitched(name: SfxName, rate = 0.7, volume = 0.5): void {
  if (muted) return;
  const buf = buffers.get(name);
  if (!buf) return;

  const ac = getContext();
  if (ac.state === 'suspended') {
    ac.resume();
  }

  const source = ac.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = rate;

  const gain = ac.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ac.destination);
  source.start(0);
}

// ── Background music (`public/cards/bgmusic.mp3`) ──
// Same AudioContext as SFX → browser sums both at the destination; keep BGM gain low.

const BGM_URL = `${BASE}cards/bgmusic.mp3`;

/** Bed level vs SFX (~0.4 deal/flip); tweak if the MP3 is loud/quiet in the mix */
const DEFAULT_BGM_VOLUME = 0.085;

let bgmBuffer: AudioBuffer | null = null;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGain: GainNode | null = null;
let bgmPlaying = false;
let bgmMuted = false;
let bgmTargetVolume = DEFAULT_BGM_VOLUME;

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

export function preloadBgm(): void {
  void loadBgm();
}

async function startBgmAsync(volume = DEFAULT_BGM_VOLUME): Promise<void> {
  bgmTargetVolume = volume;

  const ac = getContext();
  if (ac.state === 'suspended') {
    try {
      await ac.resume();
    } catch {
      /* ignore */
    }
  }

  await loadBgm();
  if (!bgmBuffer) return;

  if (bgmPlaying && bgmGain) {
    bgmGain.gain.value = bgmMuted ? 0 : volume;
    return;
  }

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

export function startBgm(volume = DEFAULT_BGM_VOLUME): void {
  void startBgmAsync(volume);
}

export function stopBgm(): void {
  if (bgmSource) {
    try {
      bgmSource.stop();
    } catch {
      /* already stopped */
    }
    bgmSource = null;
  }
  bgmGain = null;
  bgmPlaying = false;
}

export function setBgmMuted(value: boolean): void {
  bgmMuted = value;
  if (bgmGain) {
    bgmGain.gain.value = value ? 0 : bgmTargetVolume;
  }
}
