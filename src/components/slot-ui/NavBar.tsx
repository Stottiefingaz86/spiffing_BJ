import { AutoSpinButton } from './AutoSpinButton'
import { BetSection } from './BetSection'
import { BuyBonusButton } from './BuyBonusButton'
import { SpeedButton } from './SpeedButton'
import { SpinButton } from './SpinButton'
import type { SpeedLevel } from '@/hooks/slot/slotConstants'
import { useThemeChrome } from '@/contexts/ThemeChromeContext'
import { cn } from '@/lib/utils'

interface NavBarProps {
  bet: number
  buyBonusCost: number
  showBuyBonus?: boolean
  isSpinning: boolean
  isAutoPlaying: boolean
  autoSpinsRemaining: number
  speedLevel: SpeedLevel
  canSpin: boolean
  canBuyBonus: boolean
  onOpenBetPicker: () => void
  onBuyBonus: () => void
  onCycleSpeed: () => void
  onSpin: () => void
  onOpenAutoPlay: () => void
  onStopAutoPlay: () => void
}

export function NavBar({
  bet,
  buyBonusCost,
  showBuyBonus = true,
  isSpinning,
  isAutoPlaying,
  autoSpinsRemaining,
  speedLevel,
  canSpin,
  canBuyBonus,
  onOpenBetPicker,
  onBuyBonus,
  onCycleSpeed,
  onSpin,
  onOpenAutoPlay,
  onStopAutoPlay,
}: NavBarProps) {
  const betLocked = isSpinning || isAutoPlaying
  const isLight = useThemeChrome() === 'light'

  const meta = (
    <div className="flex items-center gap-3 sm:gap-4">
      {showBuyBonus && (
        <BuyBonusButton cost={buyBonusCost} onBuy={onBuyBonus} disabled={!canBuyBonus} />
      )}
      <BetSection bet={bet} onOpenPicker={onOpenBetPicker} disabled={betLocked} />
    </div>
  )

  const controls = (
    <div className="flex h-16 items-end justify-center gap-3 md:h-14 md:items-center">
      <SpeedButton level={speedLevel} onCycle={onCycleSpeed} />
      <SpinButton
        onSpin={onSpin}
        disabled={!canSpin || isAutoPlaying}
        isSpinning={isSpinning}
      />
      <AutoSpinButton
        isPlaying={isAutoPlaying}
        spinsRemaining={autoSpinsRemaining}
        onOpen={onOpenAutoPlay}
        onStop={onStopAutoPlay}
        disabled={isSpinning && !isAutoPlaying}
      />
    </div>
  )

  return (
    <div
      className={cn(
        'player-bar pointer-events-auto w-full border-t',
        isLight ? 'player-bar-light border-black/[0.06]' : 'border-white/[0.04]',
      )}
    >
      <div className="mx-auto max-w-4xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
        <div className="flex flex-col items-center gap-3 md:hidden">
          {controls}
          {meta}
        </div>

        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-x-6">
          {meta}
          {controls}
          <div aria-hidden />
        </div>
      </div>
    </div>
  )
}
