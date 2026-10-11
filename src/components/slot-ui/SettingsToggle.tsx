import { cn } from '@/lib/utils'

interface SettingsToggleProps {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
}

export function SettingsToggle({ label, description, enabled, onToggle }: SettingsToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white">{label}</p>
        <p className="mt-0.5 text-[11px] text-white/40">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          'inline-flex h-7 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          enabled ? 'bg-slot-accent' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'block size-6 rounded-full bg-white shadow-sm transition-transform duration-200',
            enabled ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}
