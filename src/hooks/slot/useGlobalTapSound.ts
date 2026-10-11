import { useEffect } from 'react'
import { isInteractiveTapTarget, playTapSound, warmTapSound } from '@/lib/tapSound'

/** Plays button_click.mp3 on every tap/click of interactive UI elements. */
export function useGlobalTapSound(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let warmed = false

    const onPointerDown = (event: PointerEvent) => {
      if (!isInteractiveTapTarget(event.target)) return

      if (!warmed) {
        warmTapSound()
        warmed = true
      }

      playTapSound()
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [enabled])
}
