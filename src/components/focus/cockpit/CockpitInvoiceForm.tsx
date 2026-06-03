// src/components/focus/cockpit/CockpitInvoiceForm.tsx
import { useState } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { FinanceService } from '@/services/finance.service'

interface Props {
  customerId: string | undefined
  customerName: string
  /** Called when CORRA generates a mail draft — switches parent to E-Mail tab */
  onCorraInvoiceDraft: (subject: string, body: string) => void
}

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CockpitInvoiceForm({ customerId, customerName, onCorraInvoiceDraft }: Props) {
  const loadAll       = useFinanceStore(s => s.loadAll)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId)
  const userId        = useAuthStore(s => s.user?.id)
  const showToast     = useToastStore(s => s.show)

  const [beschreibung, setBeschreibung] = useState('')
  const [betrag, setBetrag]             = useState('')
  const [dueDate, setDueDate]           = useState(defaultDueDate)
  const [saving, setSaving]         = useState(false)
  const [generating, setGenerating] = useState(false)

  const betragNum = parseFloat(betrag.replace(',', '.')) || 0

  const handleCreate = async () => {
    if (!beschreibung.trim() || betragNum <= 0 || !workspaceId || !userId) return
    setSaving(true)
    try {
      await FinanceService.createInvoice({
        workspaceId,
        createdBy: userId,
        accountId: customerId ?? '',
        date: todayISO(),
        dueDate,
        status: 'draft',
        taxMode: 'standard',
        subtotal: betragNum,
        taxAmount: 0,
        total: betragNum,
        items: [{
          title: beschreibung.trim(),
          quantity: 1,
          unitPrice: betragNum,
          taxRate: 0,
          total: betragNum,
          sortOrder: 0,
        }],
      })
      if (workspaceId) loadAll(workspaceId).catch(() => {})
      showToast({ message: 'Rechnung erstellt (Entwurf).', variant: 'success' })
      setBeschreibung('')
      setBetrag('')
      setDueDate(defaultDueDate())
    } catch {
      showToast({ message: 'Rechnung konnte nicht erstellt werden.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Customer chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#484858', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Für</span>
        <span style={{
          background: 'oklch(60% 0.25 280 / 0.12)', color: 'oklch(75% 0.2 280)',
          borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
        }}>
          {customerName || 'Allgemein'}
        </span>
      </div>

      {/* Fields grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 140px', gap: 8 }}>
        <input
          autoFocus
          value={beschreibung}
          onChange={e => setBeschreibung(e.target.value)}
          placeholder="Leistung beschreiben…"
          style={{
            padding: '9px 12px', borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
            color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            style={{
              width: '100%', padding: '9px 28px 9px 12px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
              color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)',
            }}
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#484858', fontSize: 12 }}>€</span>
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{
            padding: '9px 8px', borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
            color: 'var(--fg)', fontSize: 11, outline: 'none',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#484858' }}>Fällig in {Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000)} Tagen</span>
        <div style={{ flex: 1 }} />
        {/* CORRA Begleit-Mail button — only active when beschreibung + betrag filled */}
        {betragNum > 0 && beschreibung.trim() && (
          <button
            type="button"
            onClick={async () => {
              setGenerating(true)
              try {
                const { generateCorraDraft } = await import('@/lib/ai/corra')
                const draft = await generateCorraDraft({
                  kind: 'invoice',
                  customerName,
                  amount: betragNum,
                  dealTitle: beschreibung.trim(),
                })
                onCorraInvoiceDraft(
                  `Rechnung: ${beschreibung.trim()}`,
                  draft || `Anbei die Rechnung über ${betragNum.toLocaleString('de-DE')} € für ${beschreibung.trim()}.`,
                )
              } catch {
                onCorraInvoiceDraft(
                  `Rechnung: ${beschreibung.trim()}`,
                  `Anbei die Rechnung über ${betragNum.toLocaleString('de-DE')} € für ${beschreibung.trim()}.`,
                )
              } finally {
                setGenerating(false)
              }
            }}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', borderRadius: 99,
              border: '1px solid oklch(60% 0.25 280 / 0.3)',
              background: 'oklch(60% 0.25 280 / 0.06)',
              color: 'oklch(75% 0.2 280)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {generating ? '…' : '✦'} Begleit-Mail
          </button>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={!beschreibung.trim() || betragNum <= 0 || saving || !customerId}
          style={{
            padding: '7px 18px', borderRadius: 99, border: 'none',
            background: !beschreibung.trim() || betragNum <= 0 || saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: !beschreibung.trim() || betragNum <= 0 || saving ? '#484858' : 'var(--accent-ink)',
            fontSize: 12, fontWeight: 700,
            cursor: !beschreibung.trim() || betragNum <= 0 || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Wird erstellt…' : 'Rechnung erstellen →'}
        </button>
      </div>
    </div>
  )
}
