import { useState, useMemo } from 'react'
import { ArrowLeft, Mail, Activity, User, Trash2 } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useLeadsStore } from '@/store/leads.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useCrmStore } from '@/store/crm.store'
import { useToastStore } from '@/store/toast.store'
import { CrmService } from '@/services/crm.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import type { Lead, LeadSource, LeadStage } from '@/types/lead.types'
import type { FollowUp } from '@/types/crm.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const FALLBACK_STAGE_COLOR = '#94a3b8'

type LeadTab = 'uebersicht' | 'aktivitaeten' | 'mails'

const TABS: { id: LeadTab; label: string; icon: typeof User }[] = [
  { id: 'uebersicht',   label: 'Übersicht',   icon: User },
  { id: 'aktivitaeten', label: 'Aktivitäten', icon: Activity },
  { id: 'mails',        label: 'Mails',       icon: Mail },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function sourceLabel(source: LeadSource): string {
  const map: Record<LeadSource, string> = {
    zoom: 'Zoom Webinar', newsletter: 'Newsletter', manual: 'Manuell',
    inbox: 'E-Mail Eingang', linkedin: 'LinkedIn', website: 'Website',
    event: 'Event', generic: 'Sonstig',
  }
  return map[source] ?? source
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function urgencyColor(dueDate: string, status: string): string {
  if (status === 'erledigt') return 'var(--border-strong)'
  const today = new Date().toLocaleDateString('sv')
  if (dueDate < today)  return '#ef4444'
  if (dueDate === today) return '#f97316'
  return 'var(--accent)'
}

function dueDateLabel(dueDate: string): { text: string; color: string } {
  const today = new Date().toLocaleDateString('sv')
  const diff = Math.floor((new Date(dueDate).getTime() - new Date(today).getTime()) / 86_400_000)
  if (diff < 0)  return { text: `${Math.abs(diff)}d überfällig`, color: '#ef4444' }
  if (diff === 0) return { text: 'Heute',  color: '#f97316' }
  if (diff === 1) return { text: 'Morgen', color: 'var(--accent)' }
  return { text: fmtDate(dueDate), color: 'var(--fg-dim)' }
}

// ── Stage Selector ─────────────────────────────────────────────────────────────

function StageSelector({ stages, currentName, onPick }: {
  stages: LeadStage[]
  currentName: string
  onPick: (stage: LeadStage) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {stages.map(s => {
        const active = s.name === currentName
        const color = s.color || FALLBACK_STAGE_COLOR
        return (
          <button
            key={s.id}
            onClick={() => { if (!active) onPick(s) }}
            style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              fontFamily: 'inherit', cursor: active ? 'default' : 'pointer',
              border: `1.5px solid ${active ? color : 'var(--border)'}`,
              background: active ? `${color}22` : 'transparent',
              color: active ? color : 'var(--fg-dim)',
              letterSpacing: '0.03em',
              transition: 'all 140ms',
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-dim)' } }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Follow-Up Card ────────────────────────────────────────────────────────────

function FollowUpCard({ followUp, onToggle, onDelete }: {
  followUp: FollowUp
  onToggle: () => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const isDone = followUp.status === 'erledigt'
  const leftColor = urgencyColor(followUp.dueDate, followUp.status)
  const due = followUp.dueDate ? dueDateLabel(followUp.dueDate) : null

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px 11px 18px',
        background: 'var(--surface-2)',
        border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 12,
        opacity: isDone ? 0.55 : 1,
        transition: 'border-color 140ms, opacity 200ms',
      }}
    >
      {/* Left urgency bar */}
      <div style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        borderRadius: 99, background: leftColor,
      }} />

      {/* Checkbox */}
      <button
        onClick={onToggle}
        style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${isDone ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: isDone ? 'var(--accent)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 160ms',
        }}
      >
        {isDone && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="var(--accent-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: isDone ? 'var(--fg-dim)' : 'var(--fg)',
          textDecoration: isDone ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {followUp.title}
        </div>
        {due && (
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: due.color, marginTop: 2 }}>
            {due.text}
          </div>
        )}
      </div>

      {/* Delete */}
      {hover && (
        <button
          onClick={onDelete}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', cursor: 'pointer',
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

function UebersichtTab({ lead }: { lead: Lead }) {
  function Row({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null
    return (
      <div style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', width: 110, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{value}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <Row label="E-Mail"     value={lead.email} />
      <Row label="Telefon"    value={lead.phone} />
      <Row label="Firma"      value={lead.companyName} />
      <Row label="Quelle"     value={sourceLabel(lead.leadSource)} />
      <Row label="Erstellt"   value={fmtDate(lead.createdAt)} />
      {lead.reEngageDate && <Row label="Re-Engage" value={fmtDate(lead.reEngageDate)} />}
      {lead.linkedinUrl && <Row label="LinkedIn"   value={lead.linkedinUrl} />}
    </div>
  )
}

function AktivitaetenTab({ lead, workspaceId }: {
  lead: Lead
  workspaceId: string
}) {
  const userId       = useAuthStore(s => s.user?.id ?? '')
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const loadAll      = useCrmStore(s => s.loadAll)
  const showToast    = useToastStore(s => s.show)

  const [title,   setTitle]   = useState('')
  const [date,    setDate]    = useState(new Date().toISOString().split('T')[0])
  const [saving,  setSaving]  = useState(false)

  const leadFollowUps = useMemo(() =>
    allFollowUps
      .filter(f => f.customerId === lead.id)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'erledigt' ? 1 : -1
        return a.dueDate.localeCompare(b.dueDate)
      }),
    [allFollowUps, lead.id],
  )

  const openCount = leadFollowUps.filter(f => f.status === 'offen').length
  const doneCount = leadFollowUps.filter(f => f.status === 'erledigt').length

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await ActivitiesGateway.create({
        workspaceId, createdBy: userId, accountId: lead.id,
        type: 'task', title: title.trim(),
        dueAt: date || undefined,
        status: 'open',
        payload: JSON.stringify({ is_follow_up: true }),
      })
      setTitle('')
      await loadAll(workspaceId)
      showToast({ message: 'Follow-Up erstellt.', variant: 'success' })
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Follow-Up konnte nicht erstellt werden',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (f: FollowUp) => {
    try {
      await CrmService.upsert({
        id: f.id, customerId: f.customerId, title: f.title,
        dueDate: f.dueDate,
        status: f.status === 'erledigt' ? 'offen' : 'erledigt',
        priority: f.priority,
      })
      await loadAll(workspaceId)
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Status konnte nicht geändert werden',
        variant: 'error',
      })
    }
  }

  const handleDelete = async (f: FollowUp) => {
    try {
      await CrmService.delete(f.id)
      await loadAll(workspaceId)
      showToast({ message: 'Follow-Up gelöscht.', variant: 'success' })
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Follow-Up konnte nicht gelöscht werden',
        variant: 'error',
      })
    }
  }

  return (
    <div style={{ padding: '20px 0' }}>

      {/* Stats row */}
      {leadFollowUps.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{openCount}</span> offen
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontWeight: 700 }}>{doneCount}</span> erledigt
          </span>
        </div>
      )}

      {/* Quick-add */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20,
        padding: '12px 14px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <input
          className="mock-input"
          placeholder="Follow-Up hinzufügen…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1, fontSize: 13 }}
        />
        <input
          type="date"
          className="mock-input"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ width: 130, fontSize: 13 }}
        />
        <button
          className="btn-primary"
          onClick={handleAdd}
          disabled={saving || !title.trim()}
          style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}
        >
          {saving ? '…' : '+ Hinzufügen'}
        </button>
      </div>

      {/* Follow-up list */}
      {leadFollowUps.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '24px 0', textAlign: 'center' }}>
          Noch keine Follow-Ups für diesen Lead.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {leadFollowUps.map(f => (
            <FollowUpCard
              key={f.id}
              followUp={f}
              onToggle={() => handleToggle(f)}
              onDelete={() => handleDelete(f)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MailsTab({ lead }: { lead: Lead }) {
  const emails = useMailStore(s => s.emails)

  const leadMails = useMemo(() => {
    if (!lead.email) return []
    const addr = lead.email.toLowerCase()
    return [...emails]
      .filter(e => e.fromAddr?.toLowerCase() === addr)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  }, [emails, lead.email])

  if (!lead.email) return (
    <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--fg-dim)' }}>
      Keine E-Mail-Adresse hinterlegt.
    </div>
  )

  if (leadMails.length === 0) return (
    <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--fg-dim)' }}>
      Keine Mails von {lead.email} in der Inbox.
    </div>
  )

  return (
    <div style={{ paddingTop: 8 }}>
      {leadMails.map(m => (
        <div key={m.id} style={{
          padding: '12px 0', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 99, marginTop: 5, flexShrink: 0,
            background: m.isRead ? 'transparent' : 'var(--accent)',
            border: m.isRead ? '1.5px solid var(--border-strong)' : 'none',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: m.isRead ? 500 : 700, marginBottom: 3 }}>
              {m.subject || '(ohne Betreff)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {fmtDateTime(m.sentAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function LeverageLeadRoute() {
  const leadId        = useUiStore(s => s.selectedLeverageLeadId)
  const setAppView    = useUiStore(s => s.setAppView)
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const leads         = useLeadsStore(s => s.leads)
  const bulkUpdate    = useLeadsStore(s => s.bulkUpdate)
  const convertToDeal = useLeadsStore(s => s.convertToDeal)
  const stages        = useLeadStagesStore(s => s.stages)
  const userId        = useAuthStore(s => s.user?.id ?? '')
  const showToast     = useToastStore(s => s.show)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const lead = leads.find(l => l.id === leadId)
  const [tab, setTab] = useState<LeadTab>('uebersicht')

  // Stage-Wechsel im Detail spiegelt das Board: Qualifizieren konvertiert den
  // Lead zum Kunden (gleiche ID → History bleibt) und legt den ersten Deal an.
  const handlePickStage = async (stage: LeadStage) => {
    if (!lead || stage.name === lead.leadStatus) return
    try {
      if (stage.isQualified) {
        const customerId = lead.id
        await convertToDeal(customerId, workspaceId, userId)
        showToast({
          message: `${lead.name} ist jetzt Kunde — Deal in der Pipeline.`,
          action: { label: '→ Kunde öffnen', onClick: () => openCustomerAt(customerId, 'verlauf') },
        })
        openCustomerAt(customerId, 'verlauf')
      } else {
        await bulkUpdate({ ids: [lead.id], status: stage.name }, workspaceId)
      }
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Stage-Wechsel fehlgeschlagen',
        variant: 'error',
      })
    }
  }

  if (!lead) return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 12 }}
        onClick={() => setAppView('leverage_leads')}>
        ← Zurück
      </button>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Lead nicht gefunden.</p>
    </div>
  )

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>

      {/* Header */}
      <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
        <button
          className="btn-ghost"
          onClick={() => setAppView('leverage_leads')}
          style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}
        >
          <ArrowLeft size={13} /> Alle Leads
        </button>

        {/* Name + email */}
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {lead.name}
          </h1>
          {lead.email && (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {lead.email}
            </div>
          )}
        </div>

        {/* Stage selector */}
        <div style={{ marginBottom: 18 }}>
          <StageSelector
            stages={stages}
            currentName={lead.leadStatus}
            onPick={handlePickStage}
          />
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => {
            const Icon   = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', fontSize: 12, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: active ? 'var(--fg)' : 'var(--fg-dim)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1, fontFamily: 'inherit', transition: 'color 120ms',
                }}
              >
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 32px' }}>
        {tab === 'uebersicht'   && <UebersichtTab lead={lead} />}
        {tab === 'aktivitaeten' && <AktivitaetenTab lead={lead} workspaceId={workspaceId} />}
        {tab === 'mails'        && <MailsTab lead={lead} />}
      </div>

    </div>
  )
}
