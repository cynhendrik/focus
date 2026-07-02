import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { runPreparation } from '@/services/preparation.service'

const TICK_MS = 60 * 60_000   // stündlich; zusätzlich beim Start + Workspace-Wechsel
const START_DELAY_MS = 15_000 // Stores erst hydrieren lassen (vgl. Briefing-Hydration-Guard)

export function usePreparationTick() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  useEffect(() => {
    if (!workspaceId) return
    const start = setTimeout(() => void runPreparation(workspaceId), START_DELAY_MS)
    const id = setInterval(() => void runPreparation(workspaceId), TICK_MS)
    return () => { clearTimeout(start); clearInterval(id) }
  }, [workspaceId])
}
