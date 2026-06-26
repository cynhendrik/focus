import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { notificationRowToNotification } from './notifications.mapper'
import type { Notification } from '@/types/notification.types'

// Team-/Cloud-Modus-Guard — identisch zu notes-module.gateway.ts (lokaler Helper).
function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }

function fail(error: { message: string }): never { throw new Error(error.message) }

export const NotificationsGateway = {
  /** Eigene Benachrichtigungen, neueste zuerst. Cloud-only. */
  async listForUser(userId: string, limit = 100): Promise<Notification[]> {
    if (!shared()) return []
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error)
    return (data ?? []).map(notificationRowToNotification)
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) fail(error)
  },

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
    if (error) fail(error)
  },
}
