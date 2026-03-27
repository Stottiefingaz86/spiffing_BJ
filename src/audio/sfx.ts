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

// Background music disabled for now
export function startBgm(): void {}
export function setBgmMuted(_value: boolean): void {}
