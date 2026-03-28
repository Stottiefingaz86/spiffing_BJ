/**
 * Bamboo Fortunes sound-effect manager.
 * Reuses Hot Fiesta sounds until custom assets are provided.
 */

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

const SFX_FILES = {
  spin: `${BASE}bamboofortunes/sounds/spin.mp3`,
  reelStop: `${BASE}bamboofortunes/sounds/reel_stop.mp3`,
  reelEnd: `${BASE}bamboofortunes/sounds/reel_end.mp3`,
  scatter: `${BASE}bamboofortunes/sounds/reel_stop.mp3`,
  scatterMaybe: `${BASE}bamboofortunes/sounds/scatter_maybe.mp3`,
  win: `${BASE}bamboofortunes/sounds/win.mp3`,
  rowClick: `${BASE}bamboofortunes/sounds/reel_stop.mp3`,
  explode: `${BASE}bamboofortunes/sounds/win.mp3`,
} as const;

export type BFSfxName = keyof typeof SFX_FILES;

/** Skip leading silence / MP3 encoder padding in the decoded buffer (seconds). */
const SFX_TRIM_START: Partial<Record<BFSfxName, number>> = {
  rowClick: 0,
  reelStop: 0,
  reelEnd: 0,
};

let ctx: AudioContext | null = null;
const buffers = new Map<BFSfxName, AudioBuffer>();
let loaded = false;
let loading = false;
let muted = false;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
  }
  return ctx;
}

export function unlockBFAudio(): void {
  const ac = getContext();
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
}

export async function preloadBFSfx(): Promise<void> {
  unlockBFAudio();
  if (loaded || loading) return;
  loading = true;
  const ac = getContext();

  await Promise.all(
    (Object.entries(SFX_FILES) as [BFSfxName, string][]).map(async ([name, url]) => {
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

export function setBFSfxMuted(value: boolean): void {
  muted = value;
}

const activeSources = new Map<BFSfxName, { source: AudioBufferSourceNode; gain: GainNode }>();

export function stopBF(name: BFSfxName): void {
  const active = activeSources.get(name);
  if (active) {
    try {
      const ac = getContext();
      active.gain.gain.setValueAtTime(active.gain.gain.value, ac.currentTime);
      active.gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.02);
      active.source.stop(ac.currentTime + 0.03);
    } catch { /* already stopped */ }
    activeSources.delete(name);
  }
}

export function playBF(name: BFSfxName, volume = 0.5, maxDuration?: number, exclusive = false): void {
  if (muted) return;
  const buf = buffers.get(name);
  if (!buf) return;

  if (exclusive) stopBF(name);

  const ac = getContext();
  if (ac.state === 'suspended') ac.resume();

  const trimRaw = SFX_TRIM_START[name] ?? 0;
  const trim = Math.min(Math.max(0, trimRaw), Math.max(0, buf.duration - 0.001));
  const playable = buf.duration - trim;
  if (playable <= 0) return;

  const source = ac.createBufferSource();
  source.buffer = buf;

  const gain = ac.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ac.destination);

  const now = ac.currentTime;

  activeSources.set(name, { source, gain });
  source.onended = () => {
    const cur = activeSources.get(name);
    if (cur?.source === source) activeSources.delete(name);
  };

  if (maxDuration && maxDuration > 0) {
    const playLen = Math.min(maxDuration, playable);
    source.start(now, trim, playLen);
    const fadeDur = Math.min(0.05, playLen * 0.3);
    const fadeStart = now + playLen - fadeDur;
    gain.gain.setValueAtTime(volume, Math.max(now, fadeStart));
    gain.gain.linearRampToValueAtTime(0, now + playLen);
    source.stop(now + playLen + 0.01);
  } else {
    source.start(now, trim);
  }
}

export function playBFPitched(name: BFSfxName, rate = 1, volume = 0.5, maxDuration?: number): void {
  if (muted) return;
  const buf = buffers.get(name);
  if (!buf) return;

  const ac = getContext();
  if (ac.state === 'suspended') ac.resume();

  const trimRaw = SFX_TRIM_START[name] ?? 0;
  const trim = Math.min(Math.max(0, trimRaw), Math.max(0, buf.duration - 0.001));
  const playable = buf.duration - trim;
  if (playable <= 0) return;

  const source = ac.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = rate;

  const gain = ac.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ac.destination);

  const now = ac.currentTime;

  if (maxDuration && maxDuration > 0) {
    const playLen = Math.min(maxDuration, playable);
    source.start(now, trim, playLen);
    const fadeDur = Math.min(0.05, playLen * 0.3);
    const fadeStart = now + playLen - fadeDur;
    gain.gain.setValueAtTime(volume, Math.max(now, fadeStart));
    gain.gain.linearRampToValueAtTime(0, now + playLen);
    source.stop(now + playLen + 0.01);
  } else {
    source.start(now, trim);
  }
}

// ── Background music ──

const BGM_URL = `${BASE}bamboofortunes/sounds/bgmusic.mp3`;
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

export function preloadBFBgm(): void {
  loadBgm();
}

export async function startBFBgm(volume = 0.04): Promise<void> {
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

export function stopBFBgm(): void {
  if (bgmSource) {
    try { bgmSource.stop(); } catch { /* already stopped */ }
    bgmSource = null;
  }
  bgmPlaying = false;
}

export function setBFBgmMuted(value: boolean): void {
  bgmMuted = value;
  if (bgmGain) {
    bgmGain.gain.value = value ? 0 : 0.04;
  }
}
