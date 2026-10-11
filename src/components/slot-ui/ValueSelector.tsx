import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavIconButton } from './NavIconButton'

interface ValueSelectorProps {
  label: string
  values: number[]
  index: number
  onIndexChange: (index: number) => void
  format?: (value: number) => string
}

export function ValueSelector({
  label,
  values,
  index,
  onIndexChange,
  format = (v) => String(v),
}: ValueSelectorProps) {
  const prev = index > 0 ? values[index - 1] : null
  const current = values[index]
  const next = index < values.length - 1 ? values[index + 1] : null

  return (
    <div className="flex flex-col gap-3">
      <span className="text-center text-xs font-bold uppercase tracking-[0.14em] text-white">
        {label}
      </span>
      <div className="flex items-center justify-center gap-4">
        <NavIconButton
          label="Decrease"
          onClick={() => onIndexChange(Math.max(0, index - 1))}
          disabled={index === 0}
          className="size-10 border border-slot-accent/40 text-slot-accent hover:text-slot-accent"
          icon={Minus}
        />

        <div className="flex min-w-[140px] items-center justify-center gap-3">
          <span className="w-10 text-center text-sm text-white/30 tabular-nums">
            {prev !== null ? format(prev) : ''}
          </span>
          <span className="min-w-[52px] text-center text-lg font-bold text-slot-accent tabular-nums">
            {format(current)}
          </span>
          <span className="w-10 text-center text-sm text-white/30 tabular-nums">
            {next !== null ? format(next) : ''}
          </span>
        </div>

        <NavIconButton
          label="Increase"
          onClick={() => onIndexChange(Math.min(values.length - 1, index + 1))}
          disabled={index === values.length - 1}
          className="size-10 border border-slot-accent/40 text-slot-accent hover:text-slot-accent"
          icon={Plus}
        />
      </div>
    </div>
  )
}

interface TotalCostProps {
  label: string
  value: string
}

export function TotalCostDisplay({ label, value }: TotalCostProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-center text-xs font-bold uppercase tracking-[0.14em] text-white">
        {label}
      </span>
      <div
        className={cn(
          'rounded-lg border border-white/[0.08] bg-black/40 px-4 py-3',
          'text-center text-2xl font-bold text-slot-accent tabular-nums',
        )}
      >
        {value}
      </div>
    </div>
  )
}
