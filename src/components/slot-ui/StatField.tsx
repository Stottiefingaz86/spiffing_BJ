import { cn } from '@/lib/utils'
import { useThemeChrome } from '@/contexts/ThemeChromeContext'

/** Shared height for the control rail — keeps circles vertically aligned. */
export const NAV_CONTROL_RAIL = 'h-12'

/** Player bar pills & labels — adapts to canvas theme. */
export function useBarStatStyles() {
  const isLight = useThemeChrome() === 'light'

  return {
    isLight,
    statLabelClass: cn(
      'text-[9px] font-medium uppercase tracking-[0.1em] leading-none',
      isLight ? 'text-black/50' : 'text-white/40',
    ),
    statValueClass: cn(
      'text-[14px] font-semibold tabular-nums leading-none',
      isLight ? 'text-black' : 'text-white',
    ),
    statPillClass: cn(
      'flex h-10 items-center rounded-full border px-3.5',
      isLight
        ? 'border-black/[0.08] bg-white/75 shadow-[0_1px_4px_rgba(0,0,0,0.06)]'
        : 'border-white/[0.08] bg-white/[0.03]',
    ),
    statPillHoverClass: isLight
      ? 'hover:border-black/[0.12] hover:bg-white'
      : 'hover:border-white/[0.12] hover:bg-white/[0.05]',
    iconCircleClass: cn(
      'flex size-7 shrink-0 items-center justify-center rounded-full border',
      isLight
        ? 'border-black/[0.08] bg-black/[0.04] text-black/55'
        : 'border-white/[0.08] bg-white/[0.04] text-white/55',
    ),
  }
}

/** Pills on the game canvas (e.g. top balance) — adapts to background theme. */
export function useCanvasStatStyles() {
  const isLight = useThemeChrome() === 'light'

  return {
    statLabelClass: cn(
      'text-[9px] font-medium uppercase tracking-[0.1em] leading-none',
      isLight ? 'text-black/45' : 'text-white/40',
    ),
    statValueClass: cn(
      'text-[14px] font-semibold tabular-nums leading-none',
      isLight ? 'text-black' : 'text-white',
    ),
    statPillClass: cn(
      'flex h-10 items-center rounded-full border px-3.5',
      isLight
        ? 'border-black/[0.1] bg-black/[0.04]'
        : 'border-white/[0.08] bg-white/[0.03]',
    ),
  }
}

interface StatFieldProps {
  label: string
  value: string
  className?: string
  inline?: boolean
}

export function StatField({ label, value, className, inline = false }: StatFieldProps) {
  const styles = inline ? useCanvasStatStyles() : useBarStatStyles()

  const pill = (
    <div className={cn(styles.statPillClass, 'min-w-[88px]')}>
      <div className="flex min-w-[52px] flex-col gap-0.5 text-left">
        <p className={styles.statLabelClass}>{label}</p>
        <p className={cn(styles.statValueClass, 'truncate')}>{value}</p>
      </div>
    </div>
  )

  if (inline) {
    return <div className={cn('flex items-center', className)}>{pill}</div>
  }

  return (
    <div className={cn(NAV_CONTROL_RAIL, 'flex items-center', className)}>
      {pill}
    </div>
  )
}
