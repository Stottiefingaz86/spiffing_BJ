import { publicAssetUrl } from '@/lib/publicUrl';

let audioCtx: AudioContext | null = null;
let muted = false;
let bgmMuted = false;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function unlockBanditAudio(): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

export function setBanditSfxMuted(m: boolean): void { muted = m; }
export function setBanditBgmMuted(m: boolean): void {
  bgmMuted = m;
  if (bgmEl) bgmEl.muted = m;
}

export type SfxName = 'spin' | 'stop' | 'win' | 'winLine' | 'bigWin' | 'scatter' | 'scatterMaybe' | 'wildFeature' | 'thumbsUp' | 'thumbsDown';

/* ── File-backed SFX (pre-loaded as AudioBuffers) ── */

const SFX_FILES: Partial<Record<SfxName, string>> = {
  spin:         'bandits/sounds/spin.mp3',
  stop:         'bandits/sounds/reel stop.mp3',
  scatter:      'bandits/sounds/scatter.mp3',
  scatterMaybe: 'bandits/sounds/scatter_maybe.mp3',
  winLine:      'bandits/sounds/WIN_LINE.mp3',
};

const sfxBuffers = new Map<SfxName, AudioBuffer>();
let sfxPreloaded = false;

export async function preloadBanditSfx(): Promise<void> {
  if (sfxPreloaded) return;
  sfxPreloaded = true;
  const ctx = getCtx();
  const entries = Object.entries(SFX_FILES) as [SfxName, string][];
  await Promise.all(
    entries.map(async ([name, rel]) => {
      try {
        const res = await fetch(publicAssetUrl(rel));
        const buf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        sfxBuffers.set(name, decoded);
      } catch { /* non-critical */ }
    }),
  );
}

/* ── Synth fallback for SFX without files ── */

const SYNTH_PARAMS: Partial<Record<SfxName, { freq: number; dur: number; type: OscillatorType; gain: number }>> = {
  win:         { freq: 660,  dur: 0.25, type: 'sine',     gain: 0.1 },
  bigWin:      { freq: 880,  dur: 0.5,  type: 'square',   gain: 0.12 },
  wildFeature: { freq: 330,  dur: 0.4,  type: 'sawtooth', gain: 0.1 },
  thumbsUp:    { freq: 700,  dur: 0.3,  type: 'sine',     gain: 0.12 },
  thumbsDown:  { freq: 200,  dur: 0.4,  type: 'triangle', gain: 0.1 },
};

function playSynth(name: SfxName, volume: number): void {
  const p = SYNTH_PARAMS[name];
  if (!p) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = p.type;
  osc.frequency.setValueAtTime(p.freq, ctx.currentTime);
  gain.gain.setValueAtTime(p.gain * volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + p.dur + 0.05);
}

export function playBandit(name: SfxName, volume = 1): void {
  if (muted) return;
  try {
    const buf = sfxBuffers.get(name);
    if (buf) {
      const ctx = getCtx();
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
      return;
    }
    const rel = SFX_FILES[name];
    if (rel) {
      const a = new Audio(publicAssetUrl(rel));
      a.volume = volume;
      a.play().catch(() => {});
      return;
    }
    playSynth(name, volume);
  } catch { /* ignore */ }
}

/* ── Background music (HTMLAudioElement loop) ── */

let bgmEl: HTMLAudioElement | null = null;

export function startBanditBgm(volume = 0.15): void {
  if (bgmMuted) return;
  if (bgmEl) {
    if (bgmEl.paused) bgmEl.play().catch(() => {});
    return;
  }
  try {
    bgmEl = new Audio(publicAssetUrl('bandits/sounds/bg music.mp3'));
    bgmEl.loop = true;
    bgmEl.volume = volume;
    bgmEl.muted = bgmMuted;
    bgmEl.play().catch(() => {});
  } catch { /* ignore */ }
}

export function stopBanditBgm(): void {
  if (bgmEl) {
    bgmEl.pause();
    bgmEl.currentTime = 0;
  }
}
