import type { ReactNode } from 'react'
import { AutoPlayModal } from './AutoPlayModal'
import { BetPickerModal } from './BetPickerModal'
import { NavBar } from './NavBar'
import { TopMenu } from './TopMenu'
import type { SpeedLevel } from '@/hooks/slot/slotConstants'
import { ThemeChromeContext, type ThemeChrome } from '@/contexts/ThemeChromeContext'
import { useGlobalTapSound } from '@/hooks/slot/useGlobalTapSound'

export interface SlotOverlayProps {
  children?: ReactNode
  themeChrome?: ThemeChrome
  gameTitle?: string
  lobbyHref?: string
  /** When false, hide Buy Bonus control (e.g. Aztec / Quest Raider). Default true. */
  showBuyBonus?: boolean
  balance: number
  bet: number
  isSpinning: boolean
  isAutoPlaying: boolean
  autoSpinsRemaining: number
  autoPlayOpen: boolean
  betPickerOpen: boolean
  betOptions: readonly number[]
  speedLevel: SpeedLevel
  soundEnabled: boolean
  musicEnabled: boolean
  canSpin: boolean
  canBuyBonus: boolean
  buyBonusCost: number
  onOpenBetPicker: () => void
  onBuyBonus: () => void
  onCloseBetPicker: () => void
  onSelectBet: (amount: number) => void
  onCycleSpeed: () => void
  onToggleSound: () => void
  onToggleMusic: () => void
  onSpin: () => void
  onOpenAutoPlay: () => void
  onCloseAutoPlay: () => void
  onStartAutoPlay: (spins: number, spinCost: number) => void
  onStopAutoPlay: () => void
}

export function SlotOverlay({
  children,
  themeChrome = 'dark',
  gameTitle,
  lobbyHref = '/',
  showBuyBonus = true,
  balance,
  bet,
  isSpinning,
  isAutoPlaying,
  autoSpinsRemaining,
  autoPlayOpen,
  betPickerOpen,
  betOptions,
  speedLevel,
  soundEnabled,
  musicEnabled,
  canSpin,
  canBuyBonus,
  buyBonusCost,
  onOpenBetPicker,
  onBuyBonus,
  onCloseBetPicker,
  onSelectBet,
  onCycleSpeed,
  onToggleSound,
  onToggleMusic,
  onSpin,
  onOpenAutoPlay,
  onCloseAutoPlay,
  onStartAutoPlay,
  onStopAutoPlay,
}: SlotOverlayProps) {
  useGlobalTapSound(soundEnabled)

  return (
    <ThemeChromeContext.Provider value={themeChrome}>
      <div className="slot-overlay-root relative h-full w-full overflow-hidden">
        {/* Full-bleed game tree: use .slot-bg (under chrome) + .slot-stage (frame stays clear) */}
        <div className="absolute inset-0 z-0">{children}</div>

        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col">
          <div className="pointer-events-auto shrink-0 px-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
            <TopMenu
              balance={balance}
              gameTitle={gameTitle}
              lobbyHref={lobbyHref}
              musicEnabled={musicEnabled}
              soundEnabled={soundEnabled}
              onToggleMusic={onToggleMusic}
              onToggleSound={onToggleSound}
            />
          </div>

          <div className="min-h-0 flex-1" aria-hidden />

          <div className="pointer-events-auto shrink-0">
            <NavBar
              bet={bet}
              buyBonusCost={buyBonusCost}
              showBuyBonus={showBuyBonus}
              isSpinning={isSpinning}
              isAutoPlaying={isAutoPlaying}
              autoSpinsRemaining={autoSpinsRemaining}
              speedLevel={speedLevel}
              canSpin={canSpin}
              canBuyBonus={canBuyBonus}
              onOpenBetPicker={onOpenBetPicker}
              onBuyBonus={onBuyBonus}
              onCycleSpeed={onCycleSpeed}
              onSpin={onSpin}
              onOpenAutoPlay={onOpenAutoPlay}
              onStopAutoPlay={onStopAutoPlay}
            />
          </div>
        </div>

        <BetPickerModal
          open={betPickerOpen}
          balance={balance}
          selectedBet={bet}
          options={betOptions}
          onClose={onCloseBetPicker}
          onSelect={onSelectBet}
        />

        <AutoPlayModal
          open={autoPlayOpen}
          onClose={onCloseAutoPlay}
          onStart={onStartAutoPlay}
          defaultSpinCost={bet}
        />
      </div>
    </ThemeChromeContext.Provider>
  )
}

export { NavBar } from './NavBar'
export { TopMenu } from './TopMenu'
export { SpinButton } from './SpinButton'
export { BetSection } from './BetSection'
export { BetPickerModal } from './BetPickerModal'
export { AutoSpinButton } from './AutoSpinButton'
export { AutoPlayModal } from './AutoPlayModal'
export { StatField } from './StatField'
export { NavIconButton } from './NavIconButton'
export { SpeedButton } from './SpeedButton'
export { NavCircleButton } from './NavCircleButton'
export { BuyBonusButton } from './BuyBonusButton'
export { GameMenuModal } from './GameMenuModal'
export { SoundButton } from './SoundButton'
