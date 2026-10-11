import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaytableRow } from '@/constants/paytable'
import { DEFAULT_PAYTABLE_NOTE, DEMO_PAYTABLE } from '@/constants/paytable'
import { SettingsToggle } from './SettingsToggle'

interface GameMenuModalProps {
  open: boolean
  onClose: () => void
  gameTitle?: string
  paytable?: readonly PaytableRow[]
  paytableNote?: string
  musicEnabled: boolean
  soundEnabled: boolean
  onToggleMusic: () => void
  onToggleSound: () => void
}

const SYMBOL_COLORS = [
  'bg-amber-500/20 text-amber-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-sky-500/20 text-sky-300',
  'bg-violet-500/20 text-violet-300',
  'bg-rose-500/20 text-rose-300',
]

export function GameMenuModal({
  open,
  onClose,
  gameTitle = 'Slot Game',
  paytable = DEMO_PAYTABLE,
  paytableNote = DEFAULT_PAYTABLE_NOTE,
  musicEnabled,
  soundEnabled,
  onToggleMusic,
  onToggleSound,
}: GameMenuModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,720px)] w-[min(420px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161616] shadow-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                  {gameTitle}
                </h2>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <X strokeWidth={2} className="size-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slot-accent">
                    Paytable
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/45">{paytableNote}</p>

                  <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
                    <div className="grid grid-cols-[1fr_repeat(3,52px)] gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                      <span>Symbol</span>
                      <span className="text-center">×3</span>
                      <span className="text-center">×4</span>
                      <span className="text-center">×5</span>
                    </div>

                    <div className="divide-y divide-white/[0.04]">
                      {paytable.map((row, index) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-[1fr_repeat(3,52px)] items-center gap-2 px-3 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                                SYMBOL_COLORS[index % SYMBOL_COLORS.length],
                              )}
                            >
                              {row.symbol}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white">{row.label}</p>
                              {row.description && (
                                <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                                  {row.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <PaytableValue value={row.x3} />
                          <PaytableValue value={row.x4} />
                          <PaytableValue value={row.x5} />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="mt-6">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slot-accent">
                    Settings
                  </h3>
                  <div className="mt-3 flex flex-col gap-2">
                    <SettingsToggle
                      label="Music"
                      description="Background loop"
                      enabled={musicEnabled}
                      onToggle={onToggleMusic}
                    />
                    <SettingsToggle
                      label="Sound effects"
                      description="Spins, wins, reels"
                      enabled={soundEnabled}
                      onToggle={onToggleSound}
                    />
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function PaytableValue({ value }: { value: string }) {
  const isDash = value === '—'

  return (
    <p
      className={cn(
        'text-center text-sm font-semibold tabular-nums',
        isDash ? 'text-white/25' : 'text-slot-accent',
      )}
    >
      {value}
    </p>
  )
}
