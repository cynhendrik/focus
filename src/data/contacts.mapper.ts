import type { Contact, UpsertContactPayload, DecisionPower, PreferredChannel } from '@/types/contact.types'

/** Supabase-`contacts`-Zeile → Contact-Domänentyp. */
export function contactRowToContact(r: any): Contact {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    createdBy: r.created_by,
    accountId: r.account_id ?? undefined,
    firstName: r.first_name,
    lastName: r.last_name ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    role: r.role ?? undefined,
    isPrimary: r.is_primary === true || r.is_primary === 1,
    avatarUrl: r.avatar_url ?? undefined,
    linkedinUrl: r.linkedin_url ?? undefined,
    decisionPower: (r.decision_power ?? undefined) as DecisionPower | undefined,
    preferredChannel: (r.preferred_channel ?? undefined) as PreferredChannel | undefined,
    notes: r.notes ?? undefined,
    birthday: r.birthday ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * UpsertContactPayload → `contacts`-Row für `supabase.from('contacts').upsert(...)`.
 * created_at wird bewusst ausgelassen: DB-Default `now()` beim Insert, beim Update
 * (onConflict id) bleibt der Originalwert erhalten. Leerer accountId → null (FK-Sicherheit).
 */
export function contactPayloadToRow(
  p: UpsertContactPayload,
  ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: p.createdBy,
    account_id: p.accountId || null,
    first_name: p.firstName,
    last_name: p.lastName ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    role: p.role ?? null,
    is_primary: p.isPrimary ?? false,
    avatar_url: p.avatarUrl ?? null,
    linkedin_url: p.linkedinUrl ?? null,
    decision_power: p.decisionPower ?? null,
    preferred_channel: p.preferredChannel ?? null,
    notes: p.notes ?? null,
    birthday: p.birthday ?? null,
    updated_at: ctx.now,
  }
}
