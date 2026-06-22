import { useWorkspaceStore } from '@/store/workspace.store'
import { hasCapability, type Capability } from '@/lib/capabilities'

/** UI-Gating-Hook. NICHT als Sicherheitsgrenze verwenden — das ist RLS. */
export function useCapability(cap: Capability): boolean {
  return useWorkspaceStore(s => {
    const ws = s.workspaces.find(w => w.id === s.activeWorkspaceId)
    return hasCapability(
      ws ? { role: ws.role, capabilities: ws.capabilities } : null,
      cap,
      ws?.isShared ?? false,
    )
  })
}
