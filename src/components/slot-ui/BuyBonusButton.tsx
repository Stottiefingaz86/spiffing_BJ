import { motion } from 'framer-motion'
import { Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_CONTROL_RAIL, useBarStatStyles } from './StatField'

interface BuyBonusButtonProps {
  cost: number
  onBuy: () => void
  disabled?: boolean
}

export function BuyBonusButton({ cost, onBuy, disabled = false }: BuyBonusButtonProps) {
  const { statLabelClass, statValueClass, statPillClass, statPillHoverClass } = useBarStatStyles()

  return (
    <div className={cn(NAV_CONTROL_RAIL, 'flex items-center')}>
      <motion.button
        type="button"
        aria-label={`Buy bonus for $${cost.toFixed(2)}`}
        disabled={disabled}
        onClick={onBuy}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        className={cn(
          statPillClass,
          'gap-2.5 pl-3.5 pr-1.5',
          statPillHoverClass,
          'transition-colors hover:border-slot-accent/25 hover:bg-slot-accent/[0.06]',
          'disabled:pointer-events-none disabled:opacity-35',
        )}
      >
        <div className="flex min-w-[52px] flex-col gap-0.5 text-left">
          <span className={statLabelClass}>Buy Bonus</span>
          <span className={statValueClass}>${cost.toFixed(2)}</span>
        </div>

        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full',
            'border border-slot-accent/20 bg-slot-accent/[0.1] text-slot-accent',
          )}
        >
          <Gift strokeWidth={2} className="size-3.5" />
        </span>
      </motion.button>
    </div>
  )
}
