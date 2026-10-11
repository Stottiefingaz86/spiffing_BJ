import { Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeChrome } from '@/contexts/ThemeChromeContext'
import { NavIconButton } from './NavIconButton'

interface SoundButtonProps {
  enabled: boolean
  onToggle: () => void
}

export function SoundButton({ enabled, onToggle }: SoundButtonProps) {
  const isLight = useThemeChrome() === 'light'

  return (
    <NavIconButton
      label={enabled ? 'Mute sound' : 'Unmute sound'}
      onClick={onToggle}
      active={!enabled}
    >
      {enabled ? (
        <Volume2
          strokeWidth={2.25}
          className={cn('size-[18px]', isLight ? 'text-black' : 'text-white')}
        />
      ) : (
        <VolumeX
          strokeWidth={2.25}
          className={cn('size-[18px]', isLight ? 'text-black/50' : 'text-white/60')}
        />
      )}
    </NavIconButton>
  )
}
