/**
 * Quest Raider — BGM + SFX from `public/quest_raiders/` only.
 * Only `reel_end.mp3` and `win.mp3` exist today; other cues reuse those at different gains.
 */

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
    : '/';

/** Distinct files under quest_raiders (deduped when loading). */
const QR_AUDIO_FILES = {
  reel_end: `${BASE}quest_raiders/reel_end.mp3`,
  win: `${BASE}quest_raiders/win.mp3`,
} as const;

type QrAudioFileKey = keyof typeof QR_AUDIO_FILES;

const BGM_URL = `${BASE}quest_raiders/bgm.mp3`;

export type TfSfxName = 'explode' | 'rowClick' | 'reelEnd' | 'tick' | 'chime' | 'spin' | 'win';

/** Logical cue → buffer + relative level (multiplies `playTF` volume). */
const SFX_ROUTING: Record<TfSfxName, { file: QrAudioFileKey; gainMul: number }> = {
  reelEnd: { file: 'reel_end', gainMul: 1 },
  /** `win.mp3` is hot on peak — keep gain conservative so cascade wins don’t slam. */
  win: { file: 'win', gainMul: 0.22 },
  spin: { file: 'reel_end', gainMul: 0.9 },
  rowClick: { file: 'reel_end', gainMul: 0.32 },
  tick: { file: 'reel_end', gainMul: 0.28 },
  /** Extra column tick (reserved). */
  chime: { file: 'reel_end', gainMul: 0.38 },
  /** Only for 2nd+ cascade pops; first hit uses `win` only (see QuestRaiderCanvas). */
  explode: { file: 'win', gainMul: 0.14 },
};

let ctx: AudioContext | null = null;
const qrBuffers = new Map<QrAudioFileKey, AudioBuffer>();
let qrLoaded = false;
let qrLoading = false;

let sfxMuted = false;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
  }
  return ctx;
}

export function unlockTFAudio(): void {
  const ac = getContext();
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
}

async function loadQrBuffers(): Promise<void> {
  if (qrLoaded || qrLoading) return;
  qrLoading = true;
  const ac = getContext();

  await Promise.all(
    (Object.entries(QR_AUDIO_FILES) as [QrAudioFileKey, string][]).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ac.decodeAudioData(arrayBuf);
        qrBuffers.set(name, audioBuf);
      } catch {
        /* non-critical */
      }
    }),
  );

  qrLoaded = true;
  qrLoading = false;
}

export async function preloadTFSfx(): Promise<void> {
  unlockTFAudio();
  await loadQrBuffers();
}

export function setTFSfxMuted(value: boolean): void {
  sfxMuted = value;
}

function playBuffer(file: QrAudioFileKey, volume: number): void {
  if (sfxMuted) return;
  const buf = qrBuffers.get(file);
  if (!buf) return;

  const ac = getContext();
  if (ac.state === 'suspended') ac.resume().catch(() => {});

  const source = ac.createBufferSource();
  source.buffer = buf;
  const gain = ac.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ac.destination);
  source.start(0);
}

export function playTF(name: TfSfxName, volume = 0.4): void {
  const route = SFX_ROUTING[name];
  if (!route) return;
  playBuffer(route.file, volume * route.gainMul);
}

// ── Background music (Quest Raider track) ──

let bgmBuffer: AudioBuffer | null = null;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGain: GainNode | null = null;
let bgmPlaying = false;
let bgmMuted = false;
/** Audible on phones / laptop speakers after unlock */
const BGM_GAIN = 0.12;

let bgmLoadingPromise: Promise<void> | null = null;

function loadBgm(): Promise<void> {
  if (bgmBuffer) return Promise.resolve();
  if (bgmLoadingPromise) return bgmLoadingPromise;
  const p = (async () => {
    const ac = getContext();
    try {
      const res = await fetch(BGM_URL);
      if (!res.ok) throw new Error(`BGM ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      /** Copy — some browsers detach the buffer after decode */
      bgmBuffer = await ac.decodeAudioData(arrayBuf.slice(0));
    } catch {
      bgmBuffer = null;
    } finally {
      bgmLoadingPromise = null;
    }
  })();
  bgmLoadingPromise = p;
  return p;
}

export function preloadTFBgm(): void {
  loadBgm();
}

export async function startTFBgm(volume = BGM_GAIN): Promise<void> {
  if (bgmPlaying) return;

  const ac = getContext();
  unlockTFAudio();
  if (ac.state === 'suspended') {
    try {
      await ac.resume();
    } catch {
      /* ignore */
    }
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
  try {
    bgmSource.start(0);
    bgmPlaying = true;
  } catch {
    bgmSource = null;
    bgmGain = null;
  }
}

export function stopTFBgm(): void {
  if (bgmSource) {
    try {
      bgmSource.stop();
    } catch {
      /* already stopped */
    }
    bgmSource = null;
  }
  bgmPlaying = false;
}

export function setTFBgmMuted(value: boolean): void {
  bgmMuted = value;
  if (bgmGain) {
    bgmGain.gain.value = value ? 0 : BGM_GAIN;
  }
}
