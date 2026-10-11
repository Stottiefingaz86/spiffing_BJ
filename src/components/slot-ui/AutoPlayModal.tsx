import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useState } from 'react'
import { NavIconButton } from './NavIconButton'
import { TotalCostDisplay, ValueSelector } from './ValueSelector'

export const AUTO_SPIN_COUNTS = [10, 15, 20, 25, 50, 100] as const
export const AUTO_SPIN_COSTS = [0.5, 1, 1.5, 2, 3, 5, 10] as const

interface AutoPlayModalProps {
  open: boolean
  onClose: () => void
  onStart: (spins: number, spinCost: number) => void
  defaultSpinCost?: number
}

export function AutoPlayModal({
  open,
  onClose,
  onStart,
  defaultSpinCost = 1,
}: AutoPlayModalProps) {
  const defaultCostIndex = Math.max(
    0,
    AUTO_SPIN_COSTS.indexOf(defaultSpinCost as (typeof AUTO_SPIN_COSTS)[number]),
  )
  const [spinIndex, setSpinIndex] = useState(1) // default 15
  const [costIndex, setCostIndex] = useState(defaultCostIndex >= 0 ? defaultCostIndex : 1)

  const spinCount = AUTO_SPIN_COUNTS[spinIndex]
  const spinCost = AUTO_SPIN_COSTS[costIndex]
  const totalCost = spinCount * spinCost

  const formatCost = (v: number) => `$${v.toFixed(2)}`

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
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed left-1/2 top-1/2 z-50 w-[min(360px,92vw)] -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-white/[0.08] bg-[#141414] px-6 py-7 shadow-2xl">
              <h2 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.16em] text-white">
                Autoplay Settings
              </h2>

              <div className="flex flex-col gap-7">
                <ValueSelector
                  label="Number of Spins"
                  values={[...AUTO_SPIN_COUNTS]}
                  index={spinIndex}
                  onIndexChange={setSpinIndex}
                />

                <ValueSelector
                  label="Spin Cost"
                  values={[...AUTO_SPIN_COSTS]}
                  index={costIndex}
                  onIndexChange={setCostIndex}
                  format={formatCost}
                />

                <TotalCostDisplay label="Total Cost" value={formatCost(totalCost)} />

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onStart(spinCount, spinCost)
                    onClose()
                  }}
                  className="mt-1 w-full rounded-xl bg-slot-accent py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition-opacity hover:opacity-90"
                >
                  Start Auto
                </motion.button>
              </div>
            </div>

            <div className="mt-5 flex justify-center">
              <NavIconButton
                label="Close"
                onClick={onClose}
                className="size-12 border border-slot-accent/50 text-slot-accent hover:text-slot-accent"
                icon={X}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
