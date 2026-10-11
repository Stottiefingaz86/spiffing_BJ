import { useState } from 'react'
import { NavIconButton } from './NavIconButton'
import { SoundButton } from './SoundButton'
import { StatField } from './StatField'
import { GameMenuModal } from './GameMenuModal'
import { Home, Menu } from 'lucide-react'

interface TopMenuProps {
  balance: number
  gameTitle?: string
  lobbyHref?: string
  musicEnabled: boolean
  soundEnabled: boolean
  onToggleMusic: () => void
  onToggleSound: () => void
}

export function TopMenu({
  balance,
  gameTitle,
  lobbyHref = '/',
  musicEnabled,
  soundEnabled,
  onToggleMusic,
  onToggleSound,
}: TopMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NavIconButton
            label="Back to lobby"
            onClick={() => {
              window.location.href = lobbyHref
            }}
            icon={Home}
          />
          <NavIconButton label="Open menu" onClick={() => setOpen(true)} icon={Menu} />
          <SoundButton enabled={soundEnabled} onToggle={onToggleSound} />
        </div>

        <StatField label="Balance" value={balance.toFixed(2)} inline />
      </div>

      <GameMenuModal
        open={open}
        onClose={() => setOpen(false)}
        gameTitle={gameTitle}
        musicEnabled={musicEnabled}
        soundEnabled={soundEnabled}
        onToggleMusic={onToggleMusic}
        onToggleSound={onToggleSound}
      />
    </>
  )
}
