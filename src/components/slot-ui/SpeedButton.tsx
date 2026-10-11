import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpeedLevel } from '@/hooks/slot/slotConstants'
import { NavCircleButton, useNavBoltInactiveClass } from './NavCircleButton'

interface SpeedButtonProps {
  level: SpeedLevel
  onCycle: () => void
  disabled?: boolean
}

const labels: Record<SpeedLevel, string> = {
  0: 'Normal speed',
  1: 'Speed 1',
  2: 'Speed 2',
}

export function SpeedButton({ level, onCycle, disabled = false }: SpeedButtonProps) {
  const inactiveClass = useNavBoltInactiveClass()

  return (
    <NavCircleButton
      label={labels[level]}
      disabled={disabled}
      onClick={onCycle}
      accent={level > 0}
    >
      <div className="flex items-center gap-px">
        <Zap
          strokeWidth={2.5}
          className={cn(
            'size-3 transition-colors',
            level >= 1 ? 'fill-slot-accent text-slot-accent' : inactiveClass,
          )}
        />
        <Zap
          strokeWidth={2.5}
          className={cn(
            'size-3 transition-colors',
            level >= 2 ? 'fill-slot-accent text-slot-accent' : inactiveClass,
          )}
        />
      </div>
    </NavCircleButton>
  )
}
