import { useEffect, useState } from 'react'
import { WorkspaceMembersGateway, type WorkspaceMember } from '@/data/workspace-members.gateway'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useCapability } from '@/hooks/useCapability'
import type { Role, Capability } from '@/lib/capabilities'
import { useAuthStore } from '@/store/auth.store'

const GRANTABLE: Capability[] = ['finances', 'contracts']

export function MembersSettings() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const isShared = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId)?.isShared ?? false)
  const canManage = useCapability('manage_members')
  const myId = useAuthStore(s => s.user?.id)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canManage || !isShared || !workspaceId) return
    WorkspaceMembersGateway.list(workspaceId).then(setMembers).catch(e => setError(String(e)))
  }, [canManage, isShared, workspaceId])

  // Nur im geteilten Workspace und nur für Verwalter (Owner) anzeigen.
  if (!canManage || !isShared) return null

  async function update(userId: string, patch: { role?: Role; capabilities?: Capability[] }) {
    try {
      await WorkspaceMembersGateway.updateMember(workspaceId, userId, patch)
      setMembers(await WorkspaceMembersGateway.list(workspaceId))
    } catch (e) { setError(String(e)) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Mitglieder & Rechte</h3>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
      {members.map(m => {
        const isOwner = m.role === 'owner'
        const isSelf = m.userId === myId
        return (
          <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              {m.userId}{isSelf ? ' (du)' : ''}
            </span>
            <select
              value={m.role}
              disabled={isOwner || isSelf}
              onChange={e => update(m.userId, { role: e.target.value as Role })}
            >
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
              {isOwner && <option value="owner">Inhaber</option>}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              {GRANTABLE.map(cap => (
                <label key={cap} style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', opacity: m.role === 'member' ? 1 : 0.4 }}>
                  <input
                    type="checkbox"
                    disabled={m.role !== 'member'}
                    checked={m.role !== 'member' || m.capabilities.includes(cap)}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...m.capabilities, cap]
                        : m.capabilities.filter(c => c !== cap)
                      update(m.userId, { capabilities: next })
                    }}
                  />
                  {cap === 'finances' ? 'Finanzen' : 'Verträge'}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
