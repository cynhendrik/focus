import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft, ChevronDown, Mail as MailIcon, Phone, Clock, X,
  DollarSign, CalendarClock, Trash2, User,
  Target, CheckCircle, FileText, File, Mail, History, Euro,
  type LucideIcon,
} from 'lucide-react'
import type { CreateActivityPayload } from '@/types/pipeline.types'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore, type CustomerTab } from '@/store/ui.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useFilesStore } from '@/store/files.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useMailStore } from '@/store/mail.store'
import { useContactsStore } from '@/store/contacts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { FinanceService } from '@/services/finance.service'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { ProfilPane } from '@/components/customer/tabs/ProfilPane'
import { CockpitPane } from '@/components/customer/tabs/CockpitPane'
import { WorkflowPane } from '@/components/customer/tabs/WorkflowPane'
import { NotizPane } from '@/components/customer/tabs/NotizPane'
import { DateienPane } from '@/components/customer/tabs/DateienPane'
import { TimelinePane } from '@/components/customer/tabs/TimelinePane'
import { FinanzPane } from '@/components/customer/tabs/FinanzPane'
import { KommunikationPane } from '@/components/chat/KommunikationPane'
import { PulseBar } from '@/components/customer/PulseBar'
import { PrimaryContact } from '@/components/customer/PrimaryContact'

const TAB_DEFS: { id: CustomerTab; label: string; icon: LucideIcon }[] = [
  { id: 'cockpit',       label: 'Cockpit',       icon: Target      },
  { id: 'tasks',         label: 'Tasks',         icon: CheckCircle },
  { id: 'notizen',       label: 'Notizen',       icon: FileText    },
  { id: 'dokumente',     label: 'Dokumente',     icon: File        },
  { id: 'kommunikation', label: 'Kommunikation', icon: Mail        },
  { id: 'verlauf',       label: 'Verlauf',       icon: History     },
  { id: 'finanzen',      label: 'Finanzen',      icon: Euro        },
]

interface Props { customerId: string }

export function CustomerRoute({ customerId }: Props) {
  const customer    = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const activeTab   = useUiStore(s => s.activeCustomerTab)
  const setTab      = useUiStore(s => s.setActiveCustomerTab)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const [showDetails,     setShowDetails]     = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showTimeLog,     setShowTimeLog]     = useState(false)
  const [aktionenOpen,    setAktionenOpen]    = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const workspaceId    = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user           = useAuthStore(s => s.user)
  const createActivity = useActivitiesStore(s => s.create)
  const removeCustomer = useCustomersStore(s => s.remove)
  const aktionenRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aktionenOpen) return
    const handler = (e: MouseEvent) => {
      if (aktionenRef.current && !aktionenRef.current.contains(e.target as Node))
        setAktionenOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aktionenOpen])

  const handleDelete = async () => {
    await removeCustomer(customerId)
    setSelected(null)
  }

  const loadTodos      = useTodosStore(s => s.loadForCustomer)
  const loadNotes      = useNotesStore(s => s.loadForCustomer)
  const loadDeadlines  = useDeadlinesStore(s => s.loadForCustomer)
  const loadFollowUps  = useCrmStore(s => s.loadForCustomer)
  const loadFolders    = useFilesStore(s => s.loadForCustomer)
  const loadActivities = useActivitiesStore(s => s.loadForCustomer)
  const loadDeals      = useDealsStore(s => s.loadForCustomer)
  const loadStages     = usePipelineStore(s => s.load)
  const loadEmails     = useMailStore(s => s.loadEmails)
  const loadContacts   = useContactsStore(s => s.loadByAccount)

  useEffect(() => {
    loadTodos(customerId)
    loadNotes(customerId)
    loadDeadlines(customerId)
    loadFollowUps(customerId)
    loadFolders(customerId)
    loadActivities(customerId)
    loadDeals(customerId)
    loadEmails()
    loadContacts(customerId)
    if (workspaceId) loadStages(workspaceId)
  }, [customerId, workspaceId])

  // Badges: live-Zaehler fuer Tasks (offen) und Finanzen (offen/ueberfaellig).
  const openTaskCount = useTodosStore(s =>
    s.allTodos.filter(t => t.customerId === customerId && t.status !== 'done').length,
  )
  const [openInvoiceCount, setOpenInvoiceCount] = useState(0)
  useEffect(() => {
    FinanceService.getInvoicesByAccount(customerId)
      .then(list => setOpenInvoiceCount(
        list.filter(i => i.status === 'open' || i.status === 'overdue').length,
      ))
      .catch(() => setOpenInvoiceCount(0))
  }, [customerId])

  const tabBadges = useMemo<Partial<Record<CustomerTab, number>>>(() => ({
    tasks:    openTaskCount    || undefined,
    finanzen: openInvoiceCount || undefined,
  }), [openTaskCount, openInvoiceCount])

  if (!customer) return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>

  const renderPane = () => {
    switch (activeTab) {
      case 'cockpit':       return <CockpitPane       customerId={customerId} />
      case 'tasks':         return <WorkflowPane      customerId={customerId} />
      case 'notizen':       return <NotizPane       customerId={customerId} />
      case 'dokumente':     return <DateienPane       customerId={customerId} />
      case 'kommunikation': return <KommunikationPane customerId={customerId} />
      case 'verlauf':       return <TimelinePane      customerId={customerId} />
      case 'finanzen':      return <FinanzPane        customerId={customerId} />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="detail-head">
        <button className="back" onClick={() => setSelected(null)}>
          <ChevronLeft size={16} />
        </button>
        <div className="avatar" style={{ width: 56, height: 56, borderRadius: 16, fontSize: 18 }}>
          {customer.name.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{customer.name}</h1>
          <PrimaryContact customerId={customerId} />
          <PulseBar customerId={customerId} />
        </div>
        <button className="btn-ghost"><Phone size={13} /> Anrufen</button>
        <button className="btn-ghost"><MailIcon size={13} /> Mail</button>

        {/* Aktionen-Menü */}
        <div ref={aktionenRef} style={{ position: 'relative' }}>
          <button
            className="btn-ghost"
            onClick={() => setAktionenOpen(v => !v)}
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}
          >
            Aktionen
            <ChevronDown size={12} style={{
              transition: 'transform 200ms',
              transform: aktionenOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }} />
          </button>

          <AnimatePresence>
            {aktionenOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0,  scale: 1     }}
                exit   ={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.16, ease: [0.2, 0.7, 0.1, 1] }}
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 6, minWidth: 210,
                  boxShadow: 'var(--shadow-2)', zIndex: 100,
                  display: 'flex', flexDirection: 'column', gap: 2,
                  transformOrigin: 'top right',
                }}
              >
                <AktionItem icon={<User size={14} />}         label="Stammdaten"           onClick={() => { setShowDetails(true); setAktionenOpen(false) }} />
                <AktionItem icon={<DollarSign size={14} />} label="Rechnung schreiben"   onClick={() => { setShowInvoiceForm(true); setAktionenOpen(false) }} />
                <AktionItem icon={<Clock size={14} />}       label="Zeiterfassung"         onClick={() => { setShowTimeLog(true); setAktionenOpen(false) }} />
                <AktionItem icon={<CalendarClock size={14} />} label="Follow-Up erstellen" onClick={() => {
                  createActivity({ workspaceId, createdBy: user?.id ?? '', accountId: customerId, type: 'followup', title: 'Follow-Up', status: 'open' })
                  setAktionenOpen(false)
                }} />

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />

                <AktionItem
                  icon={<Trash2 size={14} />} label="Löschen"
                  danger onClick={() => { setShowDeleteModal(true); setAktionenOpen(false) }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tab bar — flach, underline-akzentuiert, Badges fuer Tasks + Finanzen */}
      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        padding: '0 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        {TAB_DEFS.map(t => {
          const Ic     = t.icon
          const active = activeTab === t.id
          const badge  = tabBadges[t.id]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '18px 18px 16px',
                marginRight: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: active ? 'var(--fg)' : 'var(--fg-dim)',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 600 : 500,
                position: 'relative',
                transition: 'color 140ms',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-dim)' }}
            >
              <Ic size={15} style={{ opacity: active ? 1 : 0.85 }} />
              <span>{t.label}</span>
              {badge !== undefined && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, padding: '0 6px', borderRadius: 99,
                  background: 'oklch(35% 0.10 25)',
                  color: 'oklch(80% 0.13 25)',
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  border: '1px solid oklch(38% 0.12 25 / 0.7)',
                }}>
                  {badge}
                </span>
              )}
              {active && (
                <span style={{
                  position: 'absolute', left: 18, right: 18, bottom: -1,
                  height: 2, borderRadius: 2,
                  background: 'var(--accent)',
                  boxShadow: '0 0 12px oklch(92% 0.2 125 / 0.5)',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Active pane
          ⚠️ Pane wrapper deliberately animates ONLY opacity — no transform,
          no y, no will-change. Any of those would create a containing block
          for `position: fixed` descendants, trapping every modal/sheet/
          confirm-dialog inside the tab area instead of the viewport. */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
          >
            {renderPane()}
          </motion.div>
        </AnimatePresence>
      </div>

      {showInvoiceForm && (
        <InvoiceForm
          initialAccountId={customerId}
          onClose={() => setShowInvoiceForm(false)}
          onSaved={() => setShowInvoiceForm(false)}
        />
      )}

      {showTimeLog && (
        <TimeLogModal
          customerId={customerId}
          customerName={customer.name}
          workspaceId={workspaceId}
          userId={user?.id ?? ''}
          onCreate={createActivity}
          onClose={() => setShowTimeLog(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteConfirmModal
          customerName={customer.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {showDetails && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetails(false)} />
          <div className="relative flex flex-col w-[480px] max-w-full h-full bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
              <h2 className="text-base font-bold text-[var(--text)]">Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ProfilPane customerId={customerId} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface TimeLogModalProps {
  customerId: string
  customerName: string
  workspaceId: string
  userId: string
  onCreate: (payload: CreateActivityPayload) => Promise<void>
  onClose: () => void
}

function TimeLogModal({ customerId, customerName, workspaceId, userId, onCreate, onClose }: TimeLogModalProps) {
  const [hours,   setHours]   = useState('1')
  const [minutes, setMinutes] = useState('0')
  const [desc,    setDesc]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const totalMin = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0)

  const handleSave = async () => {
    if (totalMin <= 0) { setError('Bitte eine gültige Dauer eingeben'); return }
    setSaving(true); setError(null)
    try {
      const h = Math.floor(totalMin / 60)
      const m = totalMin % 60
      const durationStr = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`
      await onCreate({
        workspaceId, createdBy: userId, accountId: customerId,
        type: 'note',
        title: `Zeiterfassung: ${durationStr}`,
        body: desc.trim() || undefined,
        status: 'done',
      })
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'oklch(0% 0 0 / 0.55)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{
        width: 420, maxWidth: '94vw',
        padding: 0, overflow: 'hidden',
        boxShadow: 'var(--shadow-2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} style={{ color: 'var(--fg-muted)' }} />
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Zeiterfassung</h2>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 3 }}>{customerName}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Duration */}
          <div>
            <label className="card-label" style={{ display: 'block', marginBottom: 8 }}>Dauer</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min="0" max="23" value={hours}
                  onChange={e => setHours(e.target.value)}
                  className="mock-input"
                  style={{ width: 64, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>h</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min="0" max="59" step="5" value={minutes}
                  onChange={e => setMinutes(e.target.value)}
                  className="mock-input"
                  style={{ width: 64, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>min</span>
              </div>
              {totalMin > 0 && (
                <span className="chip" data-tone="accent">
                  {Math.floor(totalMin / 60) > 0 ? `${Math.floor(totalMin / 60)}h ` : ''}
                  {totalMin % 60 > 0 ? `${totalMin % 60}min` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="card-label" style={{ display: 'block', marginBottom: 6 }}>Beschreibung (optional)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="mock-input"
              rows={3}
              placeholder="Was wurde gemacht?"
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'oklch(72% 0.18 25 / 0.1)', borderRadius: 8 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern…' : 'Zeit erfassen'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AktionItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8, width: '100%', textAlign: 'left',
        background: hover ? (danger ? 'oklch(72% 0.18 25 / 0.1)' : 'var(--surface-2)') : 'none',
        border: 'none', cursor: 'pointer', fontSize: 13,
        color: danger ? 'var(--danger)' : 'var(--fg-2)',
        transition: 'background 120ms ease',
      }}
    >
      <span style={{ color: danger ? 'var(--danger)' : 'var(--fg-muted)', display: 'flex', opacity: hover ? 1 : 0.8 }}>{icon}</span>
      {label}
    </button>
  )
}

function DeleteConfirmModal({ customerName, onConfirm, onCancel }: { customerName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'oklch(0% 0 0 / 0.55)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{ width: 360, maxWidth: '92vw', padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-2)' }}>
        <div style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'oklch(72% 0.18 25 / 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Trash2 size={16} style={{ color: 'var(--danger)' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Kunde löschen?</h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--fg)' }}>{customerName}</strong> wird unwiderruflich gelöscht. Alle Daten, Aktivitäten und Deals gehen verloren.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" onClick={onCancel}>Abbrechen</button>
          <button
            onClick={onConfirm}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 99, border: 'none', cursor: 'pointer',
              background: 'var(--danger)', color: '#fff',
              fontSize: 13, fontWeight: 600,
            }}
          >
            <Trash2 size={13} /> Löschen
          </button>
        </div>
      </div>
    </div>
  )
}
