import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronDown, Mail as MailIcon, Phone, Clock, X, DollarSign, CalendarClock, Trash2, User } from 'lucide-react'
import type { CreateActivityPayload } from '@/types/pipeline.types'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore, type CustomerTab } from '@/store/ui.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useCrmStore } from '@/store/crm.store'
import { useFilesStore } from '@/store/files.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { ProfilPane } from '@/components/customer/tabs/ProfilPane'
import { UeberblickPane } from '@/components/customer/tabs/UeberblickPane'
import { ArbeitenPane } from '@/components/customer/tabs/ArbeitenPane'
import { HistorieWrapperPane } from '@/components/customer/tabs/HistorieWrapperPane'

function avatarBg(name: string): string {
  const palette = ['bg-blue-600', 'bg-violet-600', 'bg-emerald-700', 'bg-orange-600', 'bg-pink-600', 'bg-teal-600']
  let h = 0
  for (const c of name) h += c.charCodeAt(0)
  return palette[h % palette.length]
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function TabIcon({ id }: { id: CustomerTab }) {
  const paths: Record<CustomerTab, string[]> = {
    ueberblick: ['M3 12h18', 'M3 6h18', 'M3 18h18'],
    arbeiten:   ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
    historie:   ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(paths[id] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const TABS: { id: CustomerTab; label: string }[] = [
  { id: 'ueberblick', label: 'Überblick' },
  { id: 'arbeiten',   label: 'Arbeiten'  },
  { id: 'historie',   label: 'Historie'  },
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

  const loadTodos     = useTodosStore(s => s.loadForCustomer)
  const loadNotes     = useNotesStore(s => s.loadForCustomer)
  const loadDeadlines = useDeadlinesStore(s => s.loadForCustomer)
  const loadFollowUps  = useCrmStore(s => s.loadForCustomer)
  const loadFolders    = useFilesStore(s => s.loadForCustomer)
  const loadActivities = useActivitiesStore(s => s.loadForCustomer)

  useEffect(() => {
    loadTodos(customerId)
    loadNotes(customerId)
    loadDeadlines(customerId)
    loadFollowUps(customerId)
    loadFolders(customerId)
    loadActivities(customerId)
  }, [customerId])

  const tabsRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 })

  useLayoutEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const active = el.querySelector(`[data-active="true"]`) as HTMLElement | null
    if (!active) return
    const rect = active.getBoundingClientRect()
    const parentRect = el.getBoundingClientRect()
    setIndicator({ left: rect.left - parentRect.left, width: rect.width, opacity: 1 })
  }, [activeTab])

  if (!customer) return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>

  const renderPane = () => {
    switch (activeTab) {
      case 'ueberblick': return <UeberblickPane customerId={customerId} />
      case 'arbeiten':   return <ArbeitenPane customerId={customerId} />
      case 'historie':   return <HistorieWrapperPane customerId={customerId} />
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
        <div style={{ flex: 1 }}>
          <h1>{customer.name}</h1>
          <div className="sub">
            <span>Letzte Aktivität: {relativeTime(customer.updatedAt)} · {customer.status}</span>
          </div>
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

      {/* Tab bar */}
      <div style={{ marginBottom: 22 }}>
        <div className="tabs glass" ref={tabsRef}>
          <motion.div
            className="tab-indicator"
            initial={false}
            animate={{
              left: indicator.left,
              width: indicator.width,
              opacity: indicator.opacity,
            }}
            transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.7 }}
          />
          {TABS.map(t => (
            <div
              key={t.id}
              className="tab"
              data-active={String(activeTab === t.id)}
              onClick={() => setTab(t.id)}
            >
              <TabIcon id={t.id} />
              {t.label}
            </div>
          ))}
        </div>
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
