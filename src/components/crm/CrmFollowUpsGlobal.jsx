import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import { fmtDate } from '../../utils/helpers'

export function CrmFollowUpsGlobal({ onSelectCustomer }) {
  const customers      = useStore(s => s.customers)
  const crmFollowUps   = useStore(s => s.crmFollowUps)
  const updateFollowUp = useStore(s => s.updateCrmFollowUp)
  const deleteFollowUp = useStore(s => s.deleteCrmFollowUp)

  const [showOnlyOpen, setShowOnlyOpen] = useState(true)

  const today = new Date().toISOString().slice(0, 10)

  const customerMap = useMemo(() => {
    const m = {}
    customers.forEach(c => { m[c.id] = c })
    return m
  }, [customers])

  const followUps = useMemo(() => {
    const list = showOnlyOpen
      ? crmFollowUps.filter(f => f.status === 'offen')
      : [...crmFollowUps]
    return list.sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [crmFollowUps, showOnlyOpen])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Follow-Ups
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {followUps.length} {showOnlyOpen ? 'offene' : 'gesamt'} · sortiert nach Datum
          </div>
        </div>
        <button
          onClick={() => setShowOnlyOpen(p => !p)}
          style={{
            padding: '6px 14px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700,
            background: showOnlyOpen ? 'var(--p5)' : 'var(--bg2)',
            border: showOnlyOpen ? '1px solid var(--border3)' : '1px solid var(--border)',
            color: showOnlyOpen ? 'var(--p)' : 'var(--text3)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {showOnlyOpen ? 'Nur offene' : 'Alle anzeigen'}
        </button>
      </div>

      {followUps.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text4)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Keine Follow-Ups</div>
          <div style={{ fontSize: 13 }}>
            {showOnlyOpen
              ? 'Keine offenen Follow-Ups vorhanden.'
              : 'Noch keine Follow-Ups angelegt. Öffne einen Kunden und gehe auf den Tab "Follow-Ups".'}
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--bg1)' }}>
          {/* Table head */}
          <div style={{
            display: 'grid', gridTemplateColumns: '220px 1fr 140px 100px 40px',
            padding: '10px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
          }}>
            {['Kunde', 'Notiz', 'Datum', 'Status', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {followUps.map((f, idx) => {
            const customer = customerMap[f.customerId]
            const done     = f.status === 'erledigt'
            const overdue  = !done && f.date < today
            const isToday  = f.date === today
            const isLast   = idx === followUps.length - 1

            return (
              <div
                key={f.id}
                style={{
                  display: 'grid', gridTemplateColumns: '220px 1fr 140px 100px 40px',
                  padding: '12px 16px', alignItems: 'center',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  background: overdue ? 'rgba(239,68,68,0.03)' : isToday ? 'rgba(124,58,237,0.03)' : 'transparent',
                }}
              >
                {/* Customer */}
                <div>
                  <button
                    onClick={() => customer && onSelectCustomer(customer.id)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: customer ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left' }}
                  >
                    <span
                      style={{ fontSize: 13, fontWeight: 600, color: customer ? 'var(--p)' : 'var(--text3)' }}
                      onMouseEnter={e => { if (customer) e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
                    >
                      {customer?.name ?? 'Unbekannt'}
                    </span>
                  </button>
                  {customer?.company && (
                    <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 1 }}>{customer.company}</div>
                  )}
                </div>

                {/* Notes */}
                <div style={{ fontSize: 13, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                  {f.notes || <span style={{ color: 'var(--text4)' }}>—</span>}
                </div>

                {/* Date */}
                <div>
                  <span style={{ fontSize: 13, fontWeight: isToday || overdue ? 700 : 400, color: overdue ? 'var(--red)' : isToday ? 'var(--p)' : done ? 'var(--text4)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                    {fmtDate(f.date)}
                  </span>
                  {overdue && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1 }}>Überfällig</div>}
                  {isToday && !done && <div style={{ fontSize: 10, color: 'var(--p)', fontWeight: 700, marginTop: 1 }}>Heute</div>}
                </div>

                {/* Status toggle */}
                <div>
                  <button
                    onClick={() => updateFollowUp(f.id, { status: done ? 'offen' : 'erledigt' })}
                    style={{
                      padding: '4px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                      background: done ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: done ? '#10b981' : '#f59e0b',
                    }}
                  >
                    {done ? 'Erledigt' : 'Offen'}
                  </button>
                </div>

                {/* Delete */}
                <div>
                  <button
                    onClick={() => deleteFollowUp(f.id)}
                    style={{ padding: '3px 6px', borderRadius: 'var(--r-sm)', background: 'transparent', border: 'none', color: 'var(--text4)', fontSize: 12, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text4)'}
                  >✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
