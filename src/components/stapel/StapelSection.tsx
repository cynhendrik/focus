import { useEffect, useMemo, useState } from 'react'
import { StapelCard } from './StapelCard'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { useStapelSettingsStore } from '@/store/stapel-settings.store'
import { useMembersStore } from '@/store/members.store'
import { useCalendarStore } from '@/store/calendar.store'
import { approvePreparedItem } from '@/services/stapel-actions.service'
import { recordDismissal, shouldOfferSuppression, RULE_LABEL } from '@/lib/stapel/dismiss-learning'
import { visiblePreparedItems, sortVisible } from '@/lib/stapel/visible'
import type { PreparedItem } from '@/types/prepared-item.types'

function eur0(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/** Der Stapel — Herz von „Mein Tag": eine Fokus-Karte, Danach-Band, Abend-Karte. */
export function StapelSection() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const myId = useAuthStore(s => s.user?.id)
  const items = usePreparedItemsStore(s => s.items)
  const weekApproved = usePreparedItemsStore(s => s.weekApproved)
  const loading = usePreparedItemsStore(s => s.loading)
  const loadError = usePreparedItemsStore(s => s.loadError)
  const focusId = usePreparedItemsStore(s => s.focusId)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Morgen-zuerst: erster Termin von morgen
  const allEvents = useCalendarStore(s => s.events)
  const tomorrowEvent = useMemo(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowIso = tomorrow.toLocaleDateString('sv')
    return allEvents
      .filter(e => e.startAt.slice(0, 10) === tomorrowIso && !e.allDay)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null
  }, [allEvents])

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

  const { visible, focusItem, queued } = useMemo(() => {
    const now = new Date().toISOString()
    const vis = sortVisible(visiblePreparedItems(items, myId, now))
    const focus = (focusId != null && vis.some(i => i.id === focusId))
      ? vis.find(i => i.id === focusId)!
      : vis[0]
    const q = focus ? vis.filter(i => i.id !== focus.id) : []
    return { visible: vis, focusItem: focus, queued: q }
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
      <div style={{ padding: '28px 32px', background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--card-shadow)' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>Stapel wird geladen …</p>
      </div>
    )
  }

  if (loadError && visible.length === 0) {
    return (
      <div style={{ padding: '28px 32px', background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--card-shadow)' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>Stapel konnte nicht geladen werden — Verbindung prüfen und App neu öffnen.</p>
      </div>
    )
  }

  // ── Abend-/Leer-Karte ──────────────────────────────────────────────────────
  if (!focusItem) {
    const moneyMoved = weekApproved.reduce((sum, i) => sum + (i.payload.amount ?? 0), 0)
    const morgenText = tomorrowEvent
      ? `${new Date(tomorrowEvent.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} — ${tomorrowEvent.title}`
      : null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="hd-eyebrow">
          <span className="t acc">FÜR DICH VORBEREITET</span>
        </div>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--card-shadow), 0 18px 44px -20px rgb(35 35 60 / 0.32)',
          padding: '36px 38px',
          display: 'flex', gap: 26, alignItems: 'flex-start',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Grüne 3px-Topline */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: 'linear-gradient(135deg,#3fa374,#7cc9a4)',
          }} />
          {/* ✓-Ring */}
          <div style={{
            width: 54, height: 54, borderRadius: '50%',
            background: 'rgba(62,163,116,.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ok)', fontSize: 22, fontWeight: 700, flexShrink: 0,
          }}>
            ✓
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.03em', margin: '4px 0 6px' }}>
              Alles Vorbereitete ist erledigt.
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.65 }}>
              Nichts liegt mehr auf dem Schreibtisch. Der Rest hat bis morgen Zeit.
            </p>
            {weekApproved.length > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '16px 0 0 0', lineHeight: 1.5 }}>
                {moneyMoved > 0 ? `${eur0(moneyMoved)} — diese Woche in Bewegung gebracht · ` : ''}
                {weekApproved.length} {weekApproved.length === 1 ? 'Karte' : 'Karten'} freigegeben
              </p>
            )}
            {morgenText && (
              <div style={{
                marginTop: 20, paddingTop: 18,
                borderTop: '1px solid var(--border)',
                fontSize: 13, color: 'var(--fg-muted)',
              }}>
                Morgen zuerst: <b style={{ color: 'var(--fg-2)' }}>{morgenText}</b>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Fokus-Karte + Danach-Band ───────────────────────────────────────────────
  const queueChips = queued.map(i => ({ id: i.id, type: i.type, title: i.payload.title }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="hd-eyebrow">
        <span className="t acc">FÜR DICH VORBEREITET</span>
        <span className="c">{visible.length} {visible.length === 1 ? 'Karte' : 'Karten'}</span>
      </div>

      <div className="stage-fade" key={focusItem.id}>
        <StapelCard
          item={focusItem} focused busy={busyId === focusItem.id}
          queue={queueChips}
          onPickQueue={id => usePreparedItemsStore.getState().setFocusId(id)}
          onApprove={() => void handleApprove(focusItem)}
          onSaveDraft={(p) => void usePreparedItemsStore.getState().applyPayload(focusItem.id, p)}
          onSnooze={(d) => handleSnooze(focusItem, d)}
          onDismiss={() => handleDismiss(focusItem)}
          onDelegate={(a) => void usePreparedItemsStore.getState().applyAssignee(focusItem.id, a)}
          delegatable={delegatable}
        />
      </div>
    </div>
  )
}
