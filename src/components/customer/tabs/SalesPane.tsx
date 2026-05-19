import { useEffect, useState } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { DealModal } from '@/components/pipeline/DealModal'
import { ActivityModal } from '@/components/pipeline/ActivityModal'
import type { Deal, ActivityType, PipelineStage } from '@/types/pipeline.types'
import { Phone, Users, Mail, FileText, Bell, Check, Trash2, Plus, Calendar } from 'lucide-react'

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: typeof Phone }> = {
  call:     { label: 'Anruf',      color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  Icon: Phone },
  meeting:  { label: 'Meeting',    color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  Icon: Users },
  email:    { label: 'E-Mail',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)', Icon: Mail },
  note:     { label: 'Notiz',      color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', Icon: FileText },
  followup: { label: 'Follow-up',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)', Icon: Bell },
}

const QUICK_TYPES: ActivityType[] = ['call', 'meeting', 'email', 'note']

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

// ── Pipeline Stepper ──────────────────────────────────────────────────────────

function PipelineStepper({ deal, stages, onMove }: {
  deal: Deal
  stages: PipelineStage[]
  onMove: (s: string) => void
}) {
  const active = stages
    .filter(s => !s.isWon && !s.isLost)
    .sort((a, b) => a.orderIndex - b.orderIndex)
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
          <button
            key={stage.id}
            onClick={() => onMove(stage.name)}
            style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
              cursor: 'pointer', border: 'none', transition: 'all 120ms',
              background: isCurrent
                ? stage.color
                : isPast ? `${stage.color}28` : 'rgba(255,255,255,0.05)',
              color: isCurrent ? '#000' : isPast ? stage.color : 'rgba(255,255,255,0.28)',
            }}
          >
            {stage.label}
          </button>
        )
      })}

      {wonStage && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 10, margin: '0 1px' }}>·</span>
          <button
            onClick={() => onMove(wonStage.name)}
            style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer',
              border: isWon ? 'none' : '1px solid rgba(74,222,128,0.28)',
              background: isWon ? '#4ade80' : 'transparent',
              color: isWon ? '#000' : '#4ade80',
            }}
          >
            ✓ Gewonnen
          </button>
        </>
      )}

      {lostStage && (
        <button
          onClick={() => onMove(lostStage.name)}
          style={{
            padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            border: isLost ? 'none' : '1px solid rgba(248,113,113,0.22)',
            background: isLost ? '#f87171' : 'transparent',
            color: isLost ? '#000' : '#f87171',
          }}
        >
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
        <button
          onClick={onEdit}
          style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 6, flexShrink: 0,
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
            color: 'var(--fg-dim)', cursor: 'pointer',
          }}
        >
          Bearbeiten
        </button>
      </div>
      <PipelineStepper deal={deal} stages={stages} onMove={onMove} />
    </div>
  )
}

// ── Follow-Up Row ─────────────────────────────────────────────────────────────

function FollowUpRow({ fu, onToggle, onRemove }: {
  fu: { id: string; title?: string; dueAt?: string; status: string }
  onToggle: () => void
  onRemove: () => void
}) {
  const due = fu.dueAt ? fmtDue(fu.dueAt) : null
  return (
    <div
      className="fu-row"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 8px',
        borderRadius: 8, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)', marginBottom: 4, position: 'relative',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
          cursor: 'pointer', marginTop: 1,
          border: '1.5px solid var(--border-strong)', background: 'transparent',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>{fu.title ?? '—'}</div>
        {due && (
          <div style={{
            fontSize: 10, marginTop: 2, fontFamily: 'var(--font-mono)',
            color: due.overdue ? '#f87171' : 'var(--fg-dim)',
          }}>
            {due.label}
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="fu-del"
        style={{
          width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
          opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0,
        }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

// ── Feed Item ─────────────────────────────────────────────────────────────────

const BODY_TRUNCATE = 140

function FeedItem({ item, onRemove }: {
  item: { id: string; type: string; title?: string; body?: string; status: string; createdAt: string }
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.note
  const { Icon } = cfg
  const isDoneFu = item.type === 'followup' && item.status === 'done'

  // title from modal (custom or type-label), body = Gesprächsnotiz
  const headline = item.title
  const note     = item.body
  const isLong   = (note?.length ?? 0) > BODY_TRUNCATE
  const noteText = note
    ? (isLong && !expanded ? note.slice(0, BODY_TRUNCATE).trimEnd() + '…' : note)
    : undefined

  return (
    <div
      className="feed-item"
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'relative',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: isDoneFu ? 'rgba(74,222,128,0.08)' : cfg.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isDoneFu
          ? <Check size={13} style={{ color: '#4ade80' }} />
          : <Icon size={13} style={{ color: cfg.color }} />
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row: type label + timestamp */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: isDoneFu ? '#4ade80' : cfg.color }}>
            {isDoneFu ? 'Follow-up erledigt' : cfg.label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            {fmtTime(item.createdAt)}
          </span>
        </div>

        {/* Custom title (if set and different from type label) */}
        {headline && headline !== cfg.label && (
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginTop: 3, lineHeight: 1.4 }}>
            {headline}
          </p>
        )}

        {/* Gesprächsnotiz / body */}
        {noteText && (
          <>
            <p style={{
              fontSize: 11, color: 'var(--fg-muted)', marginTop: 4,
              lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              {noteText}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded(v => !v)}
                style={{
                  marginTop: 4, fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-dim)')}
              >
                {expanded ? 'Weniger anzeigen ↑' : 'Mehr lesen ↓'}
              </button>
            )}
          </>
        )}
      </div>

      <button
        onClick={onRemove}
        className="feed-del"
        style={{
          width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
          opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0,
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ── SalesPane ─────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function SalesPane({ customerId }: Props) {
  const { customerDeals, loadForCustomer: loadDeals, moveToStage } = useDealsStore()
  const stages = usePipelineStore(s => s.stages)
  const { activities, loadForCustomer: loadActivities, create, update, remove } = useActivitiesStore()
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)

  const [editDeal,   setEditDeal]   = useState<Deal | 'new' | null>(null)
  const [actModal,   setActModal]   = useState<ActivityType | null>(null)
  const [showFuForm, setShowFuForm] = useState(false)
  const [fuTitle,    setFuTitle]    = useState('')
  const [fuDate,     setFuDate]     = useState('')
  const [fuSaving,   setFuSaving]   = useState(false)

  useEffect(() => {
    loadDeals(customerId)
    loadActivities(customerId)
  }, [customerId])

  const openDeals   = customerDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
  const closedDeals = customerDeals.filter(d => d.stage === 'won' || d.stage === 'lost')

  const openFollowUps = activities
    .filter(a => a.type === 'followup' && a.status === 'open')
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))

  const feedItems = activities
    .filter(a => !(a.type === 'followup' && a.status === 'open'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const hasOverdue = openFollowUps.some(f => f.dueAt && new Date(f.dueAt) < new Date())

  const handleCreateFu = async () => {
    if (!fuTitle.trim()) return
    setFuSaving(true)
    try {
      await create({
        workspaceId,
        createdBy: user?.email ?? 'user',
        accountId: customerId,
        customerId,
        type: 'followup',
        title: fuTitle.trim(),
        dueAt: fuDate || undefined,
        status: 'open',
      })
      setFuTitle('')
      setFuDate('')
      setShowFuForm(false)
    } finally {
      setFuSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Zone 1 + 2: Deals + Offene Aktionen ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 256px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0, maxHeight: 288,
      }}>

        {/* Deals */}
        <div style={{ padding: '14px 20px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>
              Deals{openDeals.length > 0 && <span style={{ fontWeight: 600, color: 'var(--fg-dim)', marginLeft: 5 }}>{openDeals.length}</span>}
            </span>
            <button
              onClick={() => setEditDeal('new')}
              className="btn-ghost"
              style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={10} /> Deal hinzufügen
            </button>
          </div>

          {openDeals.length === 0 && closedDeals.length === 0 ? (
            <div
              onClick={() => setEditDeal('new')}
              style={{
                textAlign: 'center', padding: '18px 16px', borderRadius: 10, cursor: 'pointer',
                border: '1.5px dashed rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
            >
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                Noch kein Deal — klicken um zu starten
              </div>
            </div>
          ) : (
            <>
              {openDeals.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  stages={stages}
                  onEdit={() => setEditDeal(deal)}
                  onMove={stage => moveToStage(deal.id, stage)}
                />
              ))}
              {closedDeals.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {closedDeals.map(deal => (
                    <div
                      key={deal.id}
                      onClick={() => setEditDeal(deal)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '5px 10px', borderRadius: 7, marginBottom: 3,
                        cursor: 'pointer', opacity: 0.5,
                      }}
                    >
                      <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{deal.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: deal.stage === 'won' ? '#4ade80' : '#f87171' }}>
                        {deal.stage === 'won' ? '✓ Gewonnen' : 'Lost'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Offene Aktionen */}
        <div style={{ padding: '14px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>
              Aktionen{openFollowUps.length > 0 && (
                <span style={{ fontWeight: 600, color: hasOverdue ? '#f87171' : 'var(--fg-dim)', marginLeft: 5 }}>
                  {openFollowUps.length}
                </span>
              )}
            </span>
            <button
              onClick={() => setShowFuForm(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2 }}
            >
              <Plus size={13} />
            </button>
          </div>

          {showFuForm && (
            <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                autoFocus
                className="mock-input"
                value={fuTitle}
                onChange={e => setFuTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateFu()}
                placeholder="Was ist zu tun?"
                style={{ fontSize: 11 }}
              />
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  className="mock-input"
                  type="date"
                  value={fuDate}
                  onChange={e => setFuDate(e.target.value)}
                  style={{ flex: 1, fontSize: 11 }}
                />
                <button
                  onClick={handleCreateFu}
                  disabled={fuSaving || !fuTitle.trim()}
                  className="btn-primary"
                  style={{ fontSize: 10, padding: '4px 10px', flexShrink: 0 }}
                >
                  {fuSaving ? '…' : 'OK'}
                </button>
              </div>
            </div>
          )}

          {openFollowUps.length === 0 && !showFuForm ? (
            <div
              onClick={() => setShowFuForm(true)}
              style={{ textAlign: 'center', padding: '14px 0', cursor: 'pointer' }}
            >
              <Bell size={14} style={{ color: 'var(--fg-dim)', margin: '0 auto 6px' }} />
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Keine offenen Aktionen</div>
            </div>
          ) : (
            openFollowUps.map(fu => (
              <FollowUpRow
                key={fu.id}
                fu={fu}
                onToggle={() => update(fu.id, { status: 'done' })}
                onRemove={() => remove(fu.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Zone 3: Activity Feed ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Quick log bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {QUICK_TYPES.map(type => {
            const cfg = TYPE_CONFIG[type]
            const { Icon } = cfg
            return (
              <button
                key={type}
                onClick={() => setActModal(type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                  color: 'var(--fg-muted)', cursor: 'pointer', transition: 'background 120ms, color 120ms, border-color 120ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = cfg.bg
                  e.currentTarget.style.color = cfg.color
                  e.currentTarget.style.borderColor = `${cfg.color}44`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = 'var(--fg-muted)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <Icon size={12} />
                {cfg.label}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          {feedItems.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{feedItems.length} Einträge</span>
          )}
        </div>

        {/* Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {feedItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-dim)', fontSize: 12 }}>
              Noch keine Aktivitäten — log den ersten Kontakt oben
            </div>
          ) : (
            feedItems.map(item => (
              <FeedItem key={item.id} item={item} onRemove={() => remove(item.id)} />
            ))
          )}
        </div>
      </div>

      {/* Modals */}
      {editDeal !== null && (
        <DealModal
          initial={editDeal === 'new' ? undefined : editDeal}
          presetCustomerId={customerId}
          onClose={() => setEditDeal(null)}
        />
      )}
      {actModal && (
        <ActivityModal
          customerId={customerId}
          presetType={actModal}
          onClose={() => setActModal(null)}
        />
      )}

      <style>{`
        .fu-row:hover .fu-del { opacity: 1 !important; }
        .feed-item:hover .feed-del { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
