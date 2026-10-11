import { motion } from 'framer-motion'
import { Repeat, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavCircleButton, useNavIconMutedClass } from './NavCircleButton'

interface AutoSpinButtonProps {
  isPlaying: boolean
  spinsRemaining: number
  onOpen: () => void
  onStop: () => void
  disabled?: boolean
}

export function AutoSpinButton({
  isPlaying,
  spinsRemaining,
  onOpen,
  onStop,
  disabled = false,
}: AutoSpinButtonProps) {
  const iconClass = useNavIconMutedClass()

  if (isPlaying) {
    return (
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-full border border-slot-accent/30',
          'bg-slot-accent/[0.08] px-3',
        )}
      >
        <span className="min-w-[16px] text-center text-xs font-bold tabular-nums text-slot-accent">
          {spinsRemaining}
        </span>
        <motion.button
          type="button"
          aria-label="Stop autoplay"
          onClick={onStop}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="flex size-6 items-center justify-center rounded-full bg-slot-accent text-black"
        >
          <Square strokeWidth={0} className="size-2.5 fill-current" />
        </motion.button>
      </div>
    )
  }

  return (
    <NavCircleButton label="Open autoplay settings" disabled={disabled} onClick={onOpen}>
      <Repeat strokeWidth={2} className={cn('size-4', iconClass)} />
    </NavCircleButton>
  )
}
