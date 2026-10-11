import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavIconButton } from './NavIconButton'

interface BetPickerModalProps {
  open: boolean
  balance: number
  selectedBet: number
  options: readonly number[]
  onClose: () => void
  onSelect: (amount: number) => void
}

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function BetPickerModal({
  open,
  balance,
  selectedBet,
  options,
  onClose,
  onSelect,
}: BetPickerModalProps) {
  const [draft, setDraft] = useState(selectedBet)

  useEffect(() => {
    if (open) setDraft(selectedBet)
  }, [open, selectedBet])

  const confirm = () => {
    if (draft > balance) return
    onSelect(draft)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed left-1/2 top-1/2 z-50 w-[min(360px,92vw)] -translate-x-1/2 -translate-y-1/2"
          >
            <div className="overflow-hidden rounded-2xl border border-slot-accent/30 bg-[#141414] shadow-2xl">
              <div className="border-b border-white/[0.06] px-4 py-3.5">
                <h2 className="text-center text-sm font-bold uppercase tracking-[0.14em] text-white">
                  Select bet
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3">
                {options.map((amount) => {
                  const selected = amount === draft
                  const disabled = amount > balance

                  return (
                    <motion.button
                      key={amount}
                      type="button"
                      disabled={disabled}
                      whileTap={disabled ? undefined : { scale: 0.96 }}
                      onClick={() => setDraft(amount)}
                      className={cn(
                        'rounded-lg py-2.5 text-sm font-bold tabular-nums transition-colors',
                        selected
                          ? 'bg-slot-accent text-black shadow-[0_0_0_1px_rgba(255,200,120,0.35)]'
                          : 'bg-[#2a2a2a] text-white hover:bg-[#353535]',
                        disabled && 'cursor-not-allowed opacity-30',
                      )}
                    >
                      {formatDollars(amount)}
                    </motion.button>
                  )
                })}
              </div>

              <div className="space-y-2 border-t border-white/[0.06] p-3">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-[#1e1e1e] px-3 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                    Selected
                  </span>
                  <span className="text-lg font-bold tabular-nums text-slot-accent">
                    {formatDollars(draft)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-[#1e1e1e] px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                    Balance
                  </span>
                  <span className="text-sm font-bold tabular-nums text-emerald-400">
                    {formatDollars(balance)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={draft > balance}
                  className={cn(
                    'flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold uppercase tracking-[0.14em] transition-opacity',
                    'bg-slot-accent text-black hover:opacity-90',
                    'disabled:pointer-events-none disabled:opacity-35',
                  )}
                >
                  Confirm bet
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <NavIconButton
                label="Close"
                onClick={onClose}
                className="size-11 border border-slot-accent/40 text-slot-accent hover:text-slot-accent"
                icon={X}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
