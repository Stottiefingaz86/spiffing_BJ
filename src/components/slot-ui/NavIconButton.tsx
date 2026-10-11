import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useThemeChrome } from '@/contexts/ThemeChromeContext'

interface NavIconButtonProps {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  icon?: LucideIcon
  children?: ReactNode
  className?: string
}

export function NavIconButton({
  label,
  onClick,
  disabled = false,
  active = false,
  icon: Icon,
  children,
  className,
}: NavIconButtonProps) {
  const isLight = useThemeChrome() === 'light'

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
        'disabled:pointer-events-none disabled:opacity-30',
        isLight
          ? 'text-black/55 hover:text-black'
          : 'text-white/55 hover:text-white',
        active && 'text-slot-accent hover:text-slot-accent',
        className,
      )}
    >
      {Icon ? <Icon strokeWidth={2} className="size-5" /> : children}
    </motion.button>
  )
}
