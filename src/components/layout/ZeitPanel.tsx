import { useState, useEffect } from 'react'
import { X, Plus, Check } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useAuftraege } from '@/store/auftraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Auftrag } from '@/types/auftrag.types'

function todayISO() { return new Date().toLocaleDateString('sv') }

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function AuftragTile({
  auftrag, accountId, date,
}: { auftrag: Auftrag; accountId: string; date: string }) {
  const addZeiteintrag = useAuftraege(s => s.addZeiteintrag)
  const [hours,   setHours]   = useState('')
  const [mins,    setMins]    = useState('')
  const [done,    setDone]    = useState(false)

  const totalMins = (parseInt(hours || '0', 10) * 60) + parseInt(mins || '0', 10)
  const canAdd = totalMins > 0

  const handleAdd = () => {
    if (!canAdd) return
    addZeiteintrag({
      auftragId:   auftrag.id,
      accountId:   accountId || null,
      date,
      minutes:     totalMins,
      description: auftrag.title,
      hourlyRate:  null,
    })
    setHours('')
    setMins('')
    setDone(true)
    setTimeout(() => setDone(false), 1800)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 8px', borderRadius: 7, textAlign: 'center',
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)',
  }

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      border: `1px solid ${done ? 'oklch(92% 0.2 125 / 0.4)' : 'var(--border)'}`,
      background: done ? 'oklch(92% 0.2 125 / 0.07)' : 'var(--surface-1)',
      transition: 'all 300ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: done ? 'var(--accent)' : 'var(--fg)' }}>
          {auftrag.title}
        </span>
        {auftrag.defaultHourlyRate != null && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {fmtEur(auftrag.defaultHourlyRate)}/h
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
        <input
          type="number" value={hours} onChange={e => setHours(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Std" min="0" max="23"
          style={inputStyle}
        />
        <input
          type="number" value={mins} onChange={e => setMins(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Min" min="0" max="59" step="15"
          style={inputStyle}
        />
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          style={{
            width: 34, height: 34, borderRadius: 8, border: 'none',
            background: done ? 'var(--accent)' : canAdd ? 'var(--accent)' : 'var(--surface-3)',
            color: canAdd ? 'var(--accent-ink)' : 'var(--fg-dim)',
            cursor: canAdd ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 200ms',
          }}
        >
          {done ? <Check size={14} /> : <Plus size={14} />}
        </button>
      </div>
    </div>
  )
}

export function ZeitPanel() {
  const open       = useUiStore(s => s.zeitPanelOpen)
  const setOpen    = useUiStore(s => s.setZeitPanelOpen)
  const auftraege  = useAuftraege(s => s.auftraege.filter(a => a.status === 'active'))
  const accounts   = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))

  const [accountId, setAccountId] = useState('')
  const [date,      setDate]      = useState(todayISO())

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 90 }}
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 64, right: 16, zIndex: 91,
        width: 380, maxHeight: 'calc(100vh - 80px)',
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
            Zeit erfassen
          </span>
          <button onClick={() => setOpen(false)} style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Kunde + Datum */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8 }}>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              style={{
                padding: '7px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: accountId ? 'var(--fg)' : 'var(--fg-dim)', fontSize: 12,
                outline: 'none', fontFamily: 'inherit',
              }}
            >
              <option value="">Kunde wählen…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{
                padding: '7px 8px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', fontSize: 12, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Aufträge */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {auftraege.length === 0 ? (
            <div style={{
              padding: '32px 0', textAlign: 'center',
              fontSize: 13, color: 'var(--fg-dim)',
            }}>
              Keine aktiven Aufträge.<br />
              <span style={{ fontSize: 11 }}>Lege Aufträge unter Zeitmanagement an.</span>
            </div>
          ) : (
            auftraege.map(a => (
              <AuftragTile key={a.id} auftrag={a} accountId={accountId} date={date} />
            ))
          )}
        </div>
      </div>
    </>
  )
}
