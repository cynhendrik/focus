export type Role = 'owner' | 'admin' | 'member'
export type Capability = 'finances' | 'contracts' | 'manage_members'

export interface Membership {
  role: Role
  capabilities: Capability[]
}

/**
 * Spiegelt die SQL-Funktion has_capability(). NUR für UI-Gating — die echte
 * Grenze ist RLS. Lokal/solo (nicht shared) = volle Rechte (kein Aussperren).
 */
export function hasCapability(
  membership: Membership | null,
  cap: Capability,
  isShared: boolean,
): boolean {
  if (!isShared) return true
  if (!membership) return false
  if (membership.role === 'owner') return true
  if (membership.role === 'admin') return cap !== 'manage_members'
  return membership.capabilities.includes(cap)
}
