import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useThemeChrome } from '@/contexts/ThemeChromeContext'

/** Secondary nav circles — matches bet coin button size. */
export const NAV_CIRCLE_SIZE = 'size-9 md:size-10'

interface NavCircleButtonProps {
  label: string
  onClick?: () => void
  disabled?: boolean
  accent?: boolean
  className?: string
  children: ReactNode
}

export function useNavCircleStyles(accent = false) {
  const isLight = useThemeChrome() === 'light'

  return cn(
    NAV_CIRCLE_SIZE,
    'flex shrink-0 items-center justify-center rounded-full border transition-colors',
    accent
      ? 'border-slot-accent/35 bg-slot-accent/[0.08]'
      : isLight
        ? 'border-black/[0.1] bg-white/75 shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:border-black/[0.16] hover:bg-white'
        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.05]',
    'disabled:pointer-events-none disabled:opacity-30',
  )
}

export function NavCircleButton({
  label,
  onClick,
  disabled = false,
  accent = false,
  className,
  children,
}: NavCircleButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.04 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className={cn(useNavCircleStyles(accent), className)}
    >
      {children}
    </motion.button>
  )
}

/** Muted icon colour for secondary nav buttons. */
export function useNavIconMutedClass() {
  const isLight = useThemeChrome() === 'light'
  return isLight ? 'text-black/50' : 'text-white/55'
}

/** Inactive bolt colour for speed button. */
export function useNavBoltInactiveClass() {
  const isLight = useThemeChrome() === 'light'
  return isLight ? 'text-black/35' : 'text-white/40'
}
