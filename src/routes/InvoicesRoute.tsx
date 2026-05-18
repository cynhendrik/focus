const INVOICES = [
  { id: 'INV-2026-041', client: 'TechCorp GmbH',     amount: 12400, due: '15.05.26', status: 'Ausstehend', paid: false },
  { id: 'INV-2026-040', client: 'PixelStudio',        amount: 3800,  due: '10.05.26', status: 'Bezahlt',    paid: true  },
  { id: 'INV-2026-039', client: 'GreenLeaf Organic',  amount: 8200,  due: '01.05.26', status: 'Überfällig', paid: false },
  { id: 'INV-2026-038', client: 'Sunrise Coffee',     amount: 4600,  due: '28.04.26', status: 'Bezahlt',    paid: true  },
  { id: 'INV-2026-037', client: 'WebAgency Berlin',   amount: 9100,  due: '20.04.26', status: 'Bezahlt',    paid: true  },
  { id: 'INV-2026-036', client: 'StartupXY',          amount: 2200,  due: '30.05.26', status: 'Entwurf',    paid: false },
]

const MONTH_DATA = [12, 18, 22, 15, 28, 32, 24, 38, 42, 35, 48, 52]

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k €'
  return n.toLocaleString('de-DE') + ' €'
}

function statusTone(status: string): string {
  if (status === 'Überfällig') return 'bad'
  if (status === 'Bezahlt')    return 'ok'
  if (status === 'Entwurf')    return ''
  return 'warn'
}

export function InvoicesRoute() {
  const total       = INVOICES.reduce((s, i) => s + i.amount, 0)
  const paid        = INVOICES.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
  const outstanding = total - paid
  const overdue     = INVOICES.filter(i => i.status === 'Überfällig').reduce((s, i) => s + i.amount, 0)
  const maxMonth    = Math.max(...MONTH_DATA)

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Finance<em>.</em></h1>
        <div className="greeting-sub">
          <span>Mai 2026 · KW 20</span>
          <span>MTD <strong>{fmt(paid)}</strong></span>
        </div>
      </div>

      <div className="row-4">
        {[
          { label: 'Eingegangen',  value: fmt(paid),        sub: 'Diesen Monat',  color: 'var(--ok)'    },
          { label: 'Offen',        value: fmt(outstanding), sub: '3 Rechnungen',  color: 'var(--fg)'    },
          { label: 'Überfällig',   value: fmt(overdue),     sub: '1 Rechnung',    color: 'var(--danger)'},
          { label: 'Forecast Q2',  value: '142k €',         sub: '+12% vs Q1',    color: 'var(--accent)'},
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 18 }}>
            <span className="card-label">{s.label}</span>
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.04em', marginTop: 8, color: s.color, fontFamily: 'var(--font-mono)' }}>
              {s.value}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="row">
        {/* Revenue bar chart */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Umsatz · 12 Monate</h2>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>+24% YoY</span>
          </div>
          <div className="bar" style={{ height: 140 }}>
            {MONTH_DATA.map((v, i) => (
              <div key={i} className="bar-col" data-dim={String(i < 6)}
                   style={{ height: `${(v / maxMonth * 100)}%` }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            <span>JUN '25</span><span>SEP</span><span>DEZ</span><span>MRZ</span><span>MAI '26</span>
          </div>
        </div>

        {/* Cash Aging */}
        <div className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Cash-Aging</h2>
          {[
            { label: 'Nicht fällig', val: 23000, pct: 60, tone: 'ok'   },
            { label: '1–14 Tage',    val: 8200,  pct: 22, tone: ''     },
            { label: '15–30 Tage',   val: 4400,  pct: 12, tone: 'warn' },
            { label: '30+ Tage',     val: 3600,  pct: 6,  tone: 'bad'  },
          ].map((b, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span>{b.label}</span>
                <span className="mono">{fmt(b.val)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'oklch(100% 0 0 / 0.05)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${b.pct}%`,
                  background: b.tone === 'bad' ? 'var(--danger)' : b.tone === 'warn' ? 'var(--warn)' : b.tone === 'ok' ? 'var(--ok)' : 'var(--accent)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-head">
        <h2>Rechnungen <span className="count">{INVOICES.length}</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost">Status</button>
          <button className="btn-ghost">Export</button>
          <button className="btn-primary">+ Rechnung</button>
        </div>
      </div>

      <div className="card" style={{ padding: 8 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 100px 90px 80px',
          gap: 14, padding: '12px 14px',
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          letterSpacing: '0.1em', color: 'var(--fg-dim)',
          textTransform: 'uppercase', borderBottom: '1px solid var(--border)',
        }}>
          <span>Rechnung</span><span>Client</span>
          <span style={{ textAlign: 'right' }}>Betrag</span>
          <span>Fällig</span>
          <span style={{ textAlign: 'right' }}>Status</span>
        </div>
        {INVOICES.map(inv => (
          <div key={inv.id} className="invoice-row">
            <span>{inv.id}</span>
            <span style={{ color: 'var(--fg-2)' }}>{inv.client}</span>
            <span className="invoice-amount">{fmt(inv.amount)}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{inv.due}</span>
            <span style={{ textAlign: 'right' }}>
              <span className="chip" data-tone={statusTone(inv.status)}>{inv.status}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
