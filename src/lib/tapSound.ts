const TAP_SOUND_URL = '/button_click.mp3'

let preload: HTMLAudioElement | null = null

function getPreload() {
  if (!preload) {
    preload = new Audio(TAP_SOUND_URL)
    preload.preload = 'auto'
    preload.load()
  }
  return preload
}

/** Play the UI tap/click sound. Safe to call rapidly — clones the audio node. */
export function playTapSound() {
  try {
    const base = getPreload()
    const clip = base.cloneNode() as HTMLAudioElement
    clip.volume = 0.45
    void clip.play()
  } catch {
    // Autoplay or missing file — ignore
  }
}

/** Call once after a user gesture so later taps aren't blocked by the browser. */
export function warmTapSound() {
  try {
    const base = getPreload()
    base.volume = 0
    const play = base.play()
    if (play) {
      void play.then(() => {
        base.pause()
        base.currentTime = 0
        base.volume = 0.45
      })
    }
  } catch {
    // ignore
  }
}

const INTERACTIVE_SELECTOR =
  'button, a[href], [role="button"], [role="switch"], [role="tab"], input[type="checkbox"], input[type="radio"], label, summary'

export function isInteractiveTapTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  const el = target.closest(INTERACTIVE_SELECTOR)
  if (!el) return false

  if (el instanceof HTMLButtonElement && el.disabled) return false
  if (el instanceof HTMLInputElement && el.disabled) return false
  if (el.getAttribute('aria-disabled') === 'true') return false

  return true
}
