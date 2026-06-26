import type { MemberProfile } from '@/types/profile.types'

/** Supabase-`profiles`-Zeile → MemberProfile. */
export function profileRowToProfile(r: any): MemberProfile {
  return {
    id:          r.id,
    displayName: r.display_name ?? '',
    email:       r.email ?? null,
  }
}
