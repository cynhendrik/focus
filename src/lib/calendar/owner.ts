import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { personColor } from './person-color'
import type { CalendarEvent } from '@/types/calendar.types'

export interface EventOwner {
  color: string
  name: string
  isOther: boolean
  /** true, wenn der Termin von jemand anderem im geteilten Workspace stammt —
   *  nur dann lohnt eine „von X"-Kennzeichnung. Solo/eigene Termine: false. */
  show: boolean
}

/**
 * Wer hat den Termin angelegt — Farbe + Name. Liest bewusst aus getState()
 * (Anzeige, kein reaktives Abo nötig; die Views rendern bei Datenänderung neu).
 */
export function resolveOwner(ev: Pick<CalendarEvent, 'createdBy'>): EventOwner {
  const myId = useAuthStore.getState().user?.id
  const isShared = useWorkspaceStore.getState().isActiveWorkspaceShared()
  const cid = ev.createdBy || ''
  const isOther = !!cid && cid !== myId
  return {
    color: personColor(cid),
    name: useMembersStore.getState().nameOf(cid),
    isOther,
    show: isShared && isOther,
  }
}
