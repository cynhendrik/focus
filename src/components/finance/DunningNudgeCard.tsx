import { useState } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { dueReminders, DEFAULT_DUNNING_FEES } from '@/services/dunning.service'
import { DunningReviewModal } from './DunningReviewModal'

const fmtEur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DunningNudgeCard() {
  const invoices = useFinanceStore(s => s.invoices)
  const payments = useFinanceStore(s => s.payments)
  const todos    = useTodosStore(s => s.allTodos)
  const accounts = useAccountsStore(s => s.accounts)
  const fees     = useCompanyStore(s => s.profile.dunningFees) ?? DEFAULT_DUNNING_FEES
  const [open, setOpen] = useState(false)

  const items = dueReminders(invoices, todos, accounts, fees, payments)
  if (items.length === 0) return null
  const total = items.reduce((s, i) => s + i.amountDue, 0)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
        padding: '14px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
        background: 'oklch(72% 0.18 25 / 0.07)', border: '1px solid oklch(72% 0.18 25 / 0.25)',
        boxShadow: 'var(--card-shadow)',
        transition: 'background 160ms, box-shadow 160ms',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 'var(--radius-sm)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'oklch(72% 0.18 25 / 0.14)', color: 'var(--danger)',
        }}>
          <Bell size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
            {items.length} Mahnung{items.length !== 1 ? 'en' : ''} fällig
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            offen {fmtEur(total)} € · Prüfen &amp; senden
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
      </button>
      {open && <DunningReviewModal onClose={() => setOpen(false)} />}
    </>
  )
}
