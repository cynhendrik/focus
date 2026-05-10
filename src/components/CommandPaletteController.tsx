import { CommandPalette } from './CommandPalette'
import { useUiStore } from '@/store/ui.store'

export function CommandPaletteController() {
  const cmdOpen = useUiStore(s => s.cmdPaletteOpen)
  const setCmdPaletteOpen = useUiStore(s => s.setCmdPaletteOpen)

  return (
    <CommandPalette
      open={cmdOpen}
      onClose={() => setCmdPaletteOpen(false)}
    />
  )
}
