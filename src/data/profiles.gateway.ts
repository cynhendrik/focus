import { supabase } from '@/lib/supabase'
import { profileRowToProfile } from './profiles.mapper'
import type { MemberProfile } from '@/types/profile.types'

function fail(error: { message: string }): never { throw new Error(error.message) }

export const ProfilesGateway = {
  /** Eigene Profilzeile anlegen/aktualisieren (beim Login). Idempotent (upsert auf pk). */
  async ensureSelf(input: { id: string; displayName: string; email: string | null }): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { id: input.id, display_name: input.displayName, email: input.email, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      )
    if (error) fail(error)
  },

  /** Profile zu einer Menge von User-IDs laden (nur co-member-lesbare kommen via RLS zurück). */
  async listByIds(ids: string[]): Promise<MemberProfile[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids)
    if (error) fail(error)
    return (data ?? []).map(profileRowToProfile)
  },
}
