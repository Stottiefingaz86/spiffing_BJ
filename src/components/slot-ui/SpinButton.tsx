import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinButtonProps {
  onSpin: () => void
  disabled?: boolean
  isSpinning?: boolean
}

export function SpinButton({ onSpin, disabled = false, isSpinning = false }: SpinButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label="Spin"
      disabled={disabled}
      onClick={onSpin}
      whileHover={disabled ? undefined : { scale: 1.04 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        'size-16 md:size-14',
        'bg-slot-accent text-white shadow-[0_4px_24px_rgba(255,85,0,0.45)]',
        'transition-opacity hover:opacity-90',
        'disabled:pointer-events-none disabled:opacity-35',
      )}
    >
      <motion.span
        animate={isSpinning ? { rotate: 360 } : { rotate: 0 }}
        transition={
          isSpinning
            ? { duration: 0.65, repeat: Infinity, ease: 'linear' }
            : { duration: 0.15 }
        }
      >
        <RefreshCw strokeWidth={2.5} className="size-7 md:size-6" />
      </motion.span>
    </motion.button>
  )
}
