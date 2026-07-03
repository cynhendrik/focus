import { useEffect, useMemo, useState } from 'react'
import { StapelCard } from './StapelCard'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { useStapelSettingsStore } from '@/store/stapel-settings.store'
import { useMembersStore } from '@/store/members.store'
import { approvePreparedItem } from '@/services/stapel-actions.service'
import { recordDismissal, shouldOfferSuppression, RULE_LABEL } from '@/lib/stapel/dismiss-learning'
import { visiblePreparedItems, sortVisible } from '@/lib/stapel/visible'
import type { PreparedItem } from '@/types/prepared-item.types'

function eur0(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/** Der Stapel — Herz von „Mein Tag": eine Fokus-Karte, kompakte Liste, Deckel bei 7. */
export function StapelSection() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const myId = useAuthStore(s => s.user?.id)
  const items = usePreparedItemsStore(s => s.items)
  const weekApproved = usePreparedItemsStore(s => s.weekApproved)
  const loading = usePreparedItemsStore(s => s.loading)
  const loadError = usePreparedItemsStore(s => s.loadError)
  const focusId = usePreparedItemsStore(s => s.focusId)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    void usePreparedItemsStore.getState().load(workspaceId)
    void usePreparedItemsStore.getState().loadWeekApproved(workspaceId)
  }, [workspaceId])
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const members = useMembersStore(s => s.members())
  const delegatable = isShared
    ? members.filter(m => m.id !== myId).map(m => ({ id: m.id, displayName: m.displayName }))
    : undefined

  const { visible, focusItem } = useMemo(() => {
    const now = new Date().toISOString()
    const vis = sortVisible(visiblePreparedItems(items, myId, now))
    const focus = (focusId != null && vis.some(i => i.id === focusId))
      ? vis.find(i => i.id === focusId)!
      : vis[0]
    return { visible: vis, focusItem: focus }
  }, [items, myId, focusId])

  const handleApprove = async (item: PreparedItem) => {
    setBusyId(item.id)
    try {
      const result = await approvePreparedItem(item)
      if (!result.ok) {
        useToastStore.getState().show({ message: result.error ?? 'Freigabe fehlgeschlagen.', variant: 'error', durationMs: 8000 })
        return
      }
      await usePreparedItemsStore.getState().applyStatus(item.id, 'approved', { approvedAt: new Date().toISOString() })
      usePreparedItemsStore.getState().setFocusId(null)
      useToastStore.getState().show({ message: `Freigegeben ✓ — ${item.payload.title}`, variant: 'success' })
      void usePreparedItemsStore.getState().loadWeekApproved(workspaceId)
    } finally {
      setBusyId(null)
    }
  }

  const handleSnooze = (item: PreparedItem, days: number) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString()
    void usePreparedItemsStore.getState().applyStatus(item.id, 'snoozed', { snoozeUntil: until })
    usePreparedItemsStore.getState().setFocusId(null)
  }

  const handleDismiss = (item: PreparedItem) => {
    const count = recordDismissal(item.ruleId)
    void usePreparedItemsStore.getState().applyStatus(item.id, 'dismissed')
    usePreparedItemsStore.getState().setFocusId(null)
    if (shouldOfferSuppression(count)) {
      useToastStore.getState().show({
        message: `Du hast ${RULE_LABEL[item.ruleId] ?? 'diese Karten'} dreimal verworfen — soll ich sie künftig nicht mehr vorbereiten?`,
        variant: 'info', durationMs: 10_000,
        action: { label: 'Nicht mehr vorbereiten', onClick: () => useStapelSettingsStore.getState().suppressRule(item.ruleId) },
      })
    }
  }

  if (loading && visible.length === 0) {
    return (
      <div style={{ padding: '28px 32px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>Stapel wird geladen …</p>
      </div>
    )
  }

  if (loadError && visible.length === 0) {
    return (
      <div style={{ padding: '28px 32px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>Stapel konnte nicht geladen werden — Verbindung prüfen und App neu öffnen.</p>
      </div>
    )
  }

  if (!focusItem) {
    const moneyMoved = weekApproved.reduce((sum, i) => sum + (i.payload.amount ?? 0), 0)
    return (
      <div style={{ padding: '28px 32px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Alles erledigt. Heute ist frei für Fokusarbeit.</h2>
        {weekApproved.length > 0 && (
          <p style={{ margin: '10px 0 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
            Diese Woche freigegeben: {weekApproved.length} {weekApproved.length === 1 ? 'Karte' : 'Karten'}
            {moneyMoved > 0 ? ` — ${eur0(moneyMoved)} in Bewegung gebracht.` : '.'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          FÜR DICH VORBEREITET
        </span>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{visible.length} {visible.length === 1 ? 'Karte' : 'Karten'}</span>
      </div>

      <StapelCard
        item={focusItem} focused busy={busyId === focusItem.id}
        onApprove={() => void handleApprove(focusItem)}
        onSaveDraft={(p) => void usePreparedItemsStore.getState().applyPayload(focusItem.id, p)}
        onSnooze={(d) => handleSnooze(focusItem, d)}
        onDismiss={() => handleDismiss(focusItem)}
        onDelegate={(a) => void usePreparedItemsStore.getState().applyAssignee(focusItem.id, a)}
        delegatable={delegatable}
      />
    </div>
  )
}
