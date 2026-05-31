import { useEffect, useState } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { DealModal } from '@/components/pipeline/DealModal'
import { ActivityModal } from '@/components/pipeline/ActivityModal'
import { LeadScoreCard } from '@/components/customer/LeadScoreCard'
import type { Deal, ActivityType, PipelineStage } from '@/types/pipeline.types'
import { Phone, Users, Mail, FileText, Bell, Check, Trash2, Plus, Calendar, ChevronDown, MessageCircle } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVal(v: number): string {
  return v.toLocaleString('de-DE') + ' €'
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dc = new Date(iso); dc.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - dc.getTime()) / 86400000)
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return `Heute ${time}`
  if (diff === 1) return `Gestern ${time}`
  if (diff < 7) return `vor ${diff} Tagen`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDue(iso: string): { label: string; overdue: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dc = new Date(iso); dc.setHours(0, 0, 0, 0)
  const diff = Math.floor((dc.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { label: 'Überfällig', overdue: true }
  if (diff === 0) return { label: 'Heute', overdue: false }
  if (diff === 1) return { label: 'Morgen', overdue: false }
  return { label: new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), overdue: false }
}

const TYPE_ICON: Record<string, typeof Phone> = {
  call: Phone, meeting: Users, email: Mail, note: FileText, followup: Bell,
}

const TYPE_LABEL: Record<string, string> = {
  call: 'Anruf', meeting: 'Meeting', email: 'E-Mail', note: 'Notiz', followup: 'Follow-up',
}

// ── Pipeline Stepper ──────────────────────────────────────────────────────────

function PipelineStepper({ deal, stages, onMove }: {
  deal: Deal
  stages: PipelineStage[]
  onMove: (s: string) => void
}) {
  const active = stages.filter(s => !s.isWon && !s.isLost).sort((a, b) => a.orderIndex - b.orderIndex)
  const wonStage  = stages.find(s => s.isWon)
  const lostStage = stages.find(s => s.isLost)
  const currentIdx = active.findIndex(s => s.name === deal.stage)
  const isWon  = deal.stage === wonStage?.name
  const isLost = deal.stage === lostStage?.name

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
      {active.map((stage, idx) => {
        const isPast    = idx < currentIdx || isWon
        const isCurrent = stage.name === deal.stage
        return (
          <button key={stage.id} onClick={() => onMove(stage.name)} style={{
            padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
            cursor: 'pointer', border: 'none', transition: 'all 120ms',
            background: isCurrent ? 'var(--accent)' : isPast ? 'var(--accent-soft)' : 'var(--surface-2)',
            color: isCurrent ? 'var(--accent-ink)' : isPast ? 'var(--accent)' : 'var(--fg-dim)',
          }}>
            {stage.label}
          </button>
        )
      })}
      {wonStage && (
        <>
          <span style={{ color: 'var(--border)', fontSize: 10, margin: '0 2px' }}>·</span>
          <button onClick={() => onMove(wonStage.name)} style={{
            padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            border: isWon ? 'none' : '1px solid var(--accent)',
            background: isWon ? 'var(--accent)' : 'transparent',
            color: isWon ? 'var(--accent-ink)' : 'var(--accent)',
          }}>
            ✓ Gewonnen
          </button>
        </>
      )}
      {lostStage && (
        <button onClick={() => onMove(lostStage.name)} style={{
          padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer',
          border: isLost ? 'none' : '1px solid var(--border)',
          background: isLost ? 'var(--fg-dim)' : 'transparent',
          color: isLost ? 'var(--bg)' : 'var(--fg-dim)',
        }}>
          Lost
        </button>
      )}
    </div>
  )
}

// ── Deal Card ─────────────────────────────────────────────────────────────────

function DealCard({ deal, stages, onEdit, onMove }: {
  deal: Deal
  stages: PipelineStage[]
  onEdit: () => void
  onMove: (s: string) => void
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{deal.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {deal.value != null && (
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                {fmtVal(deal.value)}
              </span>
            )}
            {deal.probability != null && (
              <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontWeight: 600 }}>{deal.probability}%</span>
            )}
            {deal.expectedClose && (
              <span style={{ fontSize: 10, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Calendar size={9} />
                {new Date(deal.expectedClose).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <button onClick={onEdit} style={{
          fontSize: 10, padding: '3px 9px', borderRadius: 6, flexShrink: 0,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--fg-dim)', cursor: 'pointer',
        }}>
          Bearbeiten
        </button>
      </div>
      <PipelineStepper deal={deal} stages={stages} onMove={onMove} />
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count, isOpen, onToggle, onAdd }: {
  label: string
  count: number
  isOpen: boolean
  onToggle: () => void
  onAdd?: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 0', cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>{label}</span>
      {count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)',
          background: 'var(--bg1)', border: '1px solid var(--border)',
          borderRadius: 99, padding: '1px 6px', lineHeight: 1.6,
        }}>
          {count}
        </span>
      )}
      {onAdd && (
        <button
          onClick={e => { e.stopPropagation(); onAdd() }}
          style={{
            width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--accent)', cursor: 'pointer',
            background: 'transparent', border: 'none', flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus size={12} />
        </button>
      )}
      <ChevronDown size={13} style={{
        color: 'var(--fg-dim)', flexShrink: 0, transition: 'transform 150ms',
        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
      }} />
    </div>
  )
}

// ── Follow-Up Item ────────────────────────────────────────────────────────────

function FollowUpItem({ fu, onToggle, onRemove }: {
  fu: { id: string; title?: string; dueAt?: string; status: string }
  onToggle: () => void
  onRemove: () => void
}) {
  const due  = fu.dueAt ? fmtDue(fu.dueAt) : null
  const done = fu.status === 'done'

  return (
    <div className="fu-item" style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '8px 0', borderBottom: '1px solid var(--border)',
      position: 'relative',
    }}>
      <button onClick={onToggle} style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: done ? 'none' : '1.5px solid var(--border-strong)',
        background: done ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <Check size={9} strokeWidth={3} style={{ color: 'var(--accent-ink)' }} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--fg)',
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 0.45 : 1,
        }}>
          {fu.title ?? '—'}
        </span>
        {due && !done && (
          <span style={{
            marginLeft: 8, fontSize: 10, fontFamily: 'var(--font-mono)',
            color: due.overdue ? 'var(--danger)' : 'var(--fg-dim)',
          }}>
            {due.label}
          </span>
        )}
      </div>
      <button onClick={onRemove} className="fu-del" style={{
        width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
        opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0, border: 'none',
      }}>
        <Trash2 size={10} />
      </button>
    </div>
  )
}

// ── Activity Item ─────────────────────────────────────────────────────────────

const BODY_TRUNCATE = 140

function ActivityItem({ item, onRemove }: {
  item: { id: string; type: string; title?: string; body?: string; status: string; createdAt: string }
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon      = TYPE_ICON[item.type] ?? FileText
  const typeLabel = TYPE_LABEL[item.type] ?? item.type
  const isDoneFu  = item.type === 'followup' && item.status === 'done'

  const headline = item.title && item.title !== typeLabel ? item.title : null
  const note     = item.body
  const isLong   = (note?.length ?? 0) > BODY_TRUNCATE
  const noteText = note
    ? (isLong && !expanded ? note.slice(0, BODY_TRUNCATE).trimEnd() + '…' : note)
    : undefined

  return (
    <div className="act-item" style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
      position: 'relative',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: isDoneFu ? 'var(--accent-soft)' : 'var(--bg1)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isDoneFu
          ? <Check size={12} style={{ color: 'var(--accent)' }} />
          : <Icon size={12} style={{ color: 'var(--fg-dim)' }} />
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
            {isDoneFu ? 'Follow-up erledigt' : typeLabel}
          </span>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            {fmtTime(item.createdAt)}
          </span>
        </div>
        {headline && (
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', marginTop: 2, lineHeight: 1.4 }}>
            {headline}
          </p>
        )}
        {noteText && (
          <>
            <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {noteText}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded(v => !v)}
                style={{
                  marginTop: 3, fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                {expanded ? 'Weniger ↑' : 'Mehr ↓'}
              </button>
            )}
          </>
        )}
      </div>

      <button onClick={onRemove} className="act-del" style={{
        width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
        opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0, border: 'none',
      }}>
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ── Chat Placeholder ──────────────────────────────────────────────────────────

function WhatsAppPlaceholder() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MessageCircle size={12} style={{ color: 'var(--fg-dim)' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>WhatsApp Business</div>
        <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>Nicht verbunden · Bald verfügbar</div>
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', border: '1px solid var(--border)',
        borderRadius: 99, padding: '2px 7px',
      }}>
        Bald
      </span>
    </div>
  )
}

// ── SalesPane ─────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function SalesPane({ customerId }: Props) {
  const { customerDeals, loadForCustomer: loadDeals, moveToStage } = useDealsStore()
  const stages = usePipelineStore(s => s.stages)
  const { activities, loadForCustomer: loadActivities, create, update, remove } = useActivitiesStore()
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)

  const [editDeal,   setEditDeal]   = useState<Deal | 'new' | null>(null)
  const [actModal,   setActModal]   = useState<ActivityType | null>(null)
  const [showFuForm, setShowFuForm] = useState(false)
  const [fuTitle,    setFuTitle]    = useState('')
  const [fuDate,     setFuDate]     = useState('')
  const [fuSaving,   setFuSaving]   = useState(false)
  const [openSects,  setOpenSects]  = useState<Set<string>>(
    () => new Set(['followups', 'calls', 'chat', 'notes'])
  )

  const toggleSect = (key: string) => setOpenSects(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  useEffect(() => {
    loadDeals(customerId)
    loadActivities(customerId)
  }, [customerId])

  const openDeals   = customerDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
  const closedDeals = customerDeals.filter(d => d.stage === 'won' || d.stage === 'lost')

  const openFollowUps   = activities.filter(a => a.type === 'followup' && a.status === 'open').sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))
  const doneFollowUps   = activities.filter(a => a.type === 'followup' && a.status === 'done').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const callActivities  = activities.filter(a => a.type === 'call' || a.type === 'meeting').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const emailActivities = activities.filter(a => a.type === 'email').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const noteActivities  = activities.filter(a => a.type === 'note').sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const handleCreateFu = async () => {
    if (!fuTitle.trim()) return
    setFuSaving(true)
    try {
      await create({
        workspaceId, createdBy: user?.email ?? 'user',
        accountId: customerId, customerId,
        type: 'followup', title: fuTitle.trim(),
        dueAt: fuDate || undefined, status: 'open',
      })
      setFuTitle(''); setFuDate(''); setShowFuForm(false)
    } finally { setFuSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Lead Score (Rules Engine) ── */}
      {customer && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <LeadScoreCard score={customer.leadScore} factors={customer.scoreFactors} />
        </div>
      )}

      {/* ── Deals ── */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, overflowY: 'auto', maxHeight: 240,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>
            Deals{openDeals.length > 0 && <span style={{ fontWeight: 600, color: 'var(--fg-dim)', marginLeft: 5 }}>{openDeals.length}</span>}
          </span>
          <button
            onClick={() => setEditDeal('new')}
            style={{
              fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: '1px solid var(--accent)',
              borderRadius: 7, color: 'var(--accent)', cursor: 'pointer',
            }}
          >
            <Plus size={10} /> Deal hinzufügen
          </button>
        </div>

        {openDeals.length === 0 && closedDeals.length === 0 ? (
          <div
            onClick={() => setEditDeal('new')}
            style={{
              textAlign: 'center', padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
              border: '1.5px dashed var(--border)', color: 'var(--fg-dim)', fontSize: 11,
            }}
          >
            Noch kein Deal — klicken um zu starten
          </div>
        ) : (
          <>
            {openDeals.map(deal => (
              <DealCard key={deal.id} deal={deal} stages={stages}
                onEdit={() => setEditDeal(deal)} onMove={s => moveToStage(deal.id, s)} />
            ))}
            {closedDeals.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {closedDeals.map(deal => (
                  <div key={deal.id} onClick={() => setEditDeal(deal)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 10px', borderRadius: 7, marginBottom: 3,
                    cursor: 'pointer', opacity: 0.5,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{deal.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: deal.stage === 'won' ? 'var(--accent)' : 'var(--fg-dim)' }}>
                      {deal.stage === 'won' ? '✓ Gewonnen' : 'Lost'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 4 Sections ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 28px' }}>

        {/* 1 · Follow-ups */}
        <div>
          <SectionHeader
            label="Follow-ups"
            count={openFollowUps.length + doneFollowUps.length}
            isOpen={openSects.has('followups')}
            onToggle={() => toggleSect('followups')}
            onAdd={() => setShowFuForm(v => !v)}
          />
          {openSects.has('followups') && (
            <div>
              {showFuForm && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <input
                    autoFocus className="mock-input"
                    value={fuTitle} onChange={e => setFuTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateFu()}
                    placeholder="Was ist zu tun?" style={{ fontSize: 11 }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="mock-input" type="date" value={fuDate}
                      onChange={e => setFuDate(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
                    <button onClick={() => setShowFuForm(false)} className="btn-secondary" style={{ fontSize: 10, padding: '4px 10px' }}>
                      Abb.
                    </button>
                    <button onClick={handleCreateFu} disabled={fuSaving || !fuTitle.trim()}
                      className="btn-primary" style={{ fontSize: 10, padding: '4px 10px' }}>
                      {fuSaving ? '…' : 'OK'}
                    </button>
                  </div>
                </div>
              )}
              {openFollowUps.length === 0 && doneFollowUps.length === 0 && !showFuForm ? (
                <div onClick={() => setShowFuForm(true)} style={{
                  padding: '12px 0', color: 'var(--fg-dim)', fontSize: 11,
                  cursor: 'pointer', textAlign: 'center', borderBottom: '1px solid var(--border)',
                }}>
                  Keine Follow-ups — klicken zum Erstellen
                </div>
              ) : (
                <>
                  {openFollowUps.map(fu => (
                    <FollowUpItem key={fu.id} fu={fu}
                      onToggle={() => update(fu.id, { status: 'done' })}
                      onRemove={() => remove(fu.id)} />
                  ))}
                  {doneFollowUps.map(fu => (
                    <FollowUpItem key={fu.id} fu={fu}
                      onToggle={() => update(fu.id, { status: 'open' })}
                      onRemove={() => remove(fu.id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* 2 · Anrufe & Meetings */}
        <div>
          <SectionHeader
            label="Anrufe & Meetings"
            count={callActivities.length}
            isOpen={openSects.has('calls')}
            onToggle={() => toggleSect('calls')}
            onAdd={() => setActModal('call')}
          />
          {openSects.has('calls') && (
            <div>
              {callActivities.length === 0 ? (
                <div onClick={() => setActModal('call')} style={{
                  padding: '12px 0', color: 'var(--fg-dim)', fontSize: 11,
                  cursor: 'pointer', textAlign: 'center', borderBottom: '1px solid var(--border)',
                }}>
                  Noch kein Anruf oder Meeting — jetzt erfassen
                </div>
              ) : (
                callActivities.map(item => (
                  <ActivityItem key={item.id} item={item} onRemove={() => remove(item.id)} />
                ))
              )}
            </div>
          )}
        </div>

        {/* 3 · Chat */}
        <div>
          <SectionHeader
            label="Chat"
            count={emailActivities.length}
            isOpen={openSects.has('chat')}
            onToggle={() => toggleSect('chat')}
            onAdd={() => setActModal('email')}
          />
          {openSects.has('chat') && (
            <div>
              <WhatsAppPlaceholder />
              {emailActivities.length === 0 ? (
                <div onClick={() => setActModal('email')} style={{
                  padding: '10px 0', color: 'var(--fg-dim)', fontSize: 11,
                  cursor: 'pointer', borderBottom: '1px solid var(--border)',
                }}>
                  Keine E-Mails protokolliert
                </div>
              ) : (
                emailActivities.map(item => (
                  <ActivityItem key={item.id} item={item} onRemove={() => remove(item.id)} />
                ))
              )}
            </div>
          )}
        </div>

        {/* 4 · Notizen & Protokolle */}
        <div>
          <SectionHeader
            label="Notizen & Protokolle"
            count={noteActivities.length}
            isOpen={openSects.has('notes')}
            onToggle={() => toggleSect('notes')}
            onAdd={() => setActModal('note')}
          />
          {openSects.has('notes') && (
            <div>
              {noteActivities.length === 0 ? (
                <div onClick={() => setActModal('note')} style={{
                  padding: '12px 0', color: 'var(--fg-dim)', fontSize: 11,
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  Noch keine Notizen — jetzt erstellen
                </div>
              ) : (
                noteActivities.map(item => (
                  <ActivityItem key={item.id} item={item} onRemove={() => remove(item.id)} />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {editDeal !== null && (
        <DealModal initial={editDeal === 'new' ? undefined : editDeal}
          presetCustomerId={customerId} onClose={() => setEditDeal(null)} />
      )}
      {actModal && (
        <ActivityModal customerId={customerId} presetType={actModal} onClose={() => setActModal(null)} />
      )}

      <style>{`
        .fu-item:hover .fu-del { opacity: 1 !important; }
        .act-item:hover .act-del { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
