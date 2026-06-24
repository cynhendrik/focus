import { useState, useMemo } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { getDunningState } from '@/hooks/useOverdueTaskSync'
import { isOverdue } from '@/lib/invoice-status'
import { sendReminder as serviceSendReminder, escalatedInvoices } from '@/services/dunning.service'
import type { Invoice } from '@/types/finance.types'
import {
  CheckCircle, Send, FileText, ChevronDown, ChevronUp,
  Loader, AlertTriangle, Clock,
} from 'lucide-react'

function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysOverdue(dueDate: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000))
}

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
const LEVEL_COLOR = ['var(--warn)', 'var(--danger)', 'var(--danger)']
const LEVEL_BG    = [
  'oklch(82% 0.16 70 / 0.12)',
  'oklch(72% 0.18 25 / 0.12)',
  'oklch(72% 0.18 25 / 0.18)',
]

// ── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  invoice: Invoice
  customerName: string
  dunningLevel: number
  onPaid: (id: string) => Promise<void>
  onSend: (invoice: Invoice, customerName: string, dunningLevel: number) => Promise<void>
  onPreview: (invoice: Invoice) => void
  sending: boolean
  marking: boolean
}

function MahnRow({ invoice, customerName, dunningLevel, onPaid, onSend, onPreview, sending, marking }: RowProps) {
  const days  = daysOverdue(invoice.dueDate)
  const color = LEVEL_COLOR[dunningLevel] ?? LEVEL_COLOR[2]
  const bg    = LEVEL_BG[dunningLevel] ?? LEVEL_BG[2]
  const label = LEVEL_LABEL[dunningLevel] ?? '2. Mahnung'
  const initials = customerName.slice(0, 2).toUpperCase()

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '36px 1fr auto auto auto',
      alignItems: 'center',
      gap: 14,
      padding: '13px 18px',
      borderBottom: '1px solid var(--border)',
      transition: 'background 160ms',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'oklch(100% 0 0 / 0.02)' }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: `${color}20`, border: `1px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        color, userSelect: 'none',
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: '-0.01em', marginBottom: 3 }}>
          {customerName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
            {invoice.number ?? invoice.id.slice(0, 8)}
          </span>
          <span style={{
            fontSize: 9.5, padding: '1px 7px', borderRadius: 99,
            fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', background: bg, color,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 9.5, padding: '1px 7px', borderRadius: 99,
            fontFamily: 'var(--font-mono)', fontWeight: 600,
            background: 'oklch(72% 0.18 25 / 0.1)', color: 'var(--danger)',
          }}>
            {days}d überfällig
          </span>
        </div>
      </div>

      {/* Amount */}
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
        {fmtEur(invoice.total)} €
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          title="PDF anzeigen"
          onClick={() => onPreview(invoice)}
          style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 160ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          <FileText size={13} />
        </button>

        <button
          type="button"
          title={`${label} senden`}
          onClick={() => onSend(invoice, customerName, dunningLevel)}
          disabled={sending}
          style={{
            height: 32, padding: '0 12px', borderRadius: 8,
            border: `1px solid ${color}40`, background: bg,
            color, cursor: sending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, opacity: sending ? 0.6 : 1,
            transition: 'all 160ms',
          }}
        >
          {sending ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
          {LEVEL_LABEL[dunningLevel] ?? 'Mahnung'}
        </button>

        <button
          type="button"
          title="Als bezahlt markieren"
          onClick={() => onPaid(invoice.id)}
          disabled={marking}
          style={{
            height: 32, padding: '0 12px', borderRadius: 8,
            border: '1px solid oklch(82% 0.18 155 / 0.3)',
            background: 'oklch(82% 0.18 155 / 0.1)',
            color: 'var(--ok)', cursor: marking ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, opacity: marking ? 0.6 : 1,
            transition: 'all 160ms',
          }}
        >
          {marking ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={11} />}
          Bezahlt
        </button>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function MahnwesenPanel() {
  const invoices        = useFinanceStore(s => s.invoices)
  const updateStatus    = useFinanceStore(s => s.updateInvoiceStatus)
  const loadAll         = useFinanceStore(s => s.loadAll)
  const accounts        = useAccountsStore(s => s.accounts)
  const allTodos        = useTodosStore(s => s.allTodos)
  const mailAccounts    = useMailStore(s => s.accounts)
  const showToast       = useToastStore(s => s.show)
  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [sending, setSending]   = useState<string | null>(null)  // invoiceId
  const [marking, setMarking]   = useState<string | null>(null)
  const [batchSending, setBatch] = useState(false)
  const [showDone, setShowDone] = useState(false)

  // Berechne Mahnstatus für jede überfällige Rechnung
  const overdueItems = useMemo(() => {
    return invoices
      .filter(i => isOverdue(i) && !i.isSuggestion)
      .map(inv => {
        const state = getDunningState(inv, allTodos)
        const account = accounts.find(a => a.id === inv.accountId)
        return { invoice: inv, state, customerName: account?.name ?? '—' }
      })
      .sort((a, b) => {
        // Höchste Stufe zuerst, dann älteste zuerst
        if (b.state.level !== a.state.level) return b.state.level - a.state.level
        return a.invoice.dueDate.localeCompare(b.invoice.dueDate)
      })
  }, [invoices, allTodos, accounts])

  const actionableItems = overdueItems.filter(i => i.state.canCreate)
  const waitingItems    = overdueItems.filter(i => !i.state.canCreate)

  // ── Senden ─────────────────────────────────────────────────────────────────

  const sendReminder = async (invoice: Invoice, _customerName: string, dunningLevel: number) => {
    setSending(invoice.id)
    const res = await serviceSendReminder(invoice, dunningLevel)
    setSending(null)
    if (res.warning) showToast({ message: res.warning, variant: 'error' })
    else if (res.ok) showToast({ message: 'Mahnung gesendet.', variant: 'success' })
    else showToast({ message: res.error ?? 'Senden fehlgeschlagen.', variant: 'error' })
    if (workspaceId) loadAll(workspaceId)
  }

  const markAsPaid = async (id: string) => {
    setMarking(id)
    try {
      await updateStatus(id, 'paid')
      showToast({ message: 'Rechnung als bezahlt markiert.', variant: 'success' })
    } catch {
      showToast({ message: 'Fehler beim Aktualisieren.', variant: 'error' })
    } finally {
      setMarking(null)
    }
  }

  const sendAll = async () => {
    if (!mailAccounts[0]) {
      showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' })
      return
    }
    setBatch(true)
    let count = 0
    for (const item of actionableItems) {
      try {
        await sendReminder(item.invoice, item.customerName, item.state.level)
        count++
      } catch { /* weiter */ }
    }
    setBatch(false)
    showToast({ message: `${count} Erinnerung${count !== 1 ? 'en' : ''} gesendet.`, variant: 'success' })
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (overdueItems.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '80px 40px', gap: 12, textAlign: 'center',
      }}>
        <CheckCircle size={40} style={{ color: 'var(--ok)', opacity: 0.6 }} />
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Alles im grünen Bereich</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Keine überfälligen Rechnungen — gut gemacht.</div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Mahnwesen
            </h2>
            {overdueItems.length > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                padding: '2px 8px', borderRadius: 99,
                background: 'oklch(72% 0.18 25 / 0.14)', color: 'var(--danger)',
              }}>
                {overdueItems.length} überfällig
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
            {actionableItems.length > 0
              ? `${actionableItems.length} Erinnerung${actionableItems.length !== 1 ? 'en' : ''} fällig zum Senden`
              : 'Alle Erinnerungen sind auf Cooldown'}
          </div>
        </div>

        {actionableItems.length > 0 && (
          <button
            type="button"
            onClick={sendAll}
            disabled={batchSending || sending !== null}
            className="btn-primary"
            style={{ gap: 7 }}
          >
            {batchSending
              ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <Send size={13} />
            }
            {batchSending ? 'Wird gesendet…' : `Alle ${actionableItems.length} senden`}
          </button>
        )}
      </div>

      {/* Aktionsfähige Erinnerungen */}
      {actionableItems.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 18px', borderBottom: '1px solid var(--border)',
            background: 'oklch(72% 0.18 25 / 0.04)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--danger)' }}>
              Fällig zum Senden
            </span>
          </div>
          {actionableItems.map(({ invoice, state, customerName }) => (
            <MahnRow
              key={invoice.id}
              invoice={invoice}
              customerName={customerName}
              dunningLevel={state.level}
              onPaid={markAsPaid}
              onSend={sendReminder}
              onPreview={() => {}} // TODO: wire to existing preview
              sending={sending === invoice.id}
              marking={marking === invoice.id}
            />
          ))}
        </div>
      )}

      {/* Auf Cooldown / wartend */}
      {waitingItems.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowDone(v => !v)}
            style={{
              width: '100%', padding: '10px 18px',
              borderBottom: showDone ? '1px solid var(--border)' : 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 160ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'oklch(100% 0 0 / 0.02)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <Clock size={12} style={{ color: 'var(--fg-dim)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
              Auf Cooldown · {waitingItems.length}
            </span>
            <div style={{ flex: 1 }} />
            {showDone ? <ChevronUp size={13} style={{ color: 'var(--fg-dim)' }} /> : <ChevronDown size={13} style={{ color: 'var(--fg-dim)' }} />}
          </button>
          {showDone && waitingItems.map(({ invoice, state, customerName }) => (
            <MahnRow
              key={invoice.id}
              invoice={invoice}
              customerName={customerName}
              dunningLevel={state.level}
              onPaid={markAsPaid}
              onSend={sendReminder}
              onPreview={() => {}}
              sending={sending === invoice.id}
              marking={marking === invoice.id}
            />
          ))}
        </div>
      )}

      {(() => {
        const escalated = escalatedInvoices(invoices, allTodos, accounts)
        if (escalated.length === 0) return null
        return (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)', padding: '0 18px 8px' }}>
              Braucht Entscheidung
            </div>
            {escalated.map(e => (
              <div key={e.invoice.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.customerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                    nach 2. Mahnung · {e.daysOverdue}d überfällig · Inkasso / abschreiben / persönlich
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{fmtEur(e.invoice.total)} €</span>
              </div>
            ))}
          </div>
        )
      })()}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
