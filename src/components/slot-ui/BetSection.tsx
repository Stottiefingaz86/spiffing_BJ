import { motion } from 'framer-motion'
import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_CONTROL_RAIL, useBarStatStyles } from './StatField'

interface BetSectionProps {
  bet: number
  onOpenPicker: () => void
  disabled?: boolean
}

export function BetSection({ bet, onOpenPicker, disabled = false }: BetSectionProps) {
  const { statLabelClass, statValueClass, statPillClass, statPillHoverClass, iconCircleClass } =
    useBarStatStyles()

  return (
    <div className={cn(NAV_CONTROL_RAIL, 'flex items-center')}>
      <motion.button
        type="button"
        aria-label="Open bet picker"
        disabled={disabled}
        onClick={onOpenPicker}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        className={cn(
          statPillClass,
          'gap-2.5 pl-3.5 pr-1.5',
          statPillHoverClass,
          'transition-colors',
          'disabled:pointer-events-none disabled:opacity-35',
        )}
      >
        <div className="flex min-w-[52px] flex-col gap-0.5 text-left">
          <span className={statLabelClass}>Bet</span>
          <span className={statValueClass}>${bet.toFixed(2)}</span>
        </div>

        <span className={iconCircleClass}>
          <Coins strokeWidth={2} className="size-3.5" />
        </span>
      </motion.button>
    </div>
  )
}
