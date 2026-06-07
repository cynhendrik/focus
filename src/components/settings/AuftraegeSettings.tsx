import { useState, useRef } from 'react'
import { Plus, Trash2, Archive, Check, X } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
import type { Auftrag } from '@/types/auftrag.types'

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// ── Inline-Edit-Zeile ────────────────────────────────────────────────────────

function AuftragRow({ auftrag }: { auftrag: Auftrag }) {
  const updateAuftrag = useAuftraege(s => s.updateAuftrag)
  const deleteAuftrag = useAuftraege(s => s.deleteAuftrag)
  const [editing, setEditing] = useState(false)
  const [title,   setTitle]   = useState(auftrag.title)
  const [rate,    setRate]    = useState(auftrag.defaultHourlyRate?.toString() ?? '')
  const [hover,   setHover]   = useState(false)

  const save = () => {
    const r = parseFloat(rate.replace(',', '.'))
    updateAuftrag(auftrag.id, {
      title: title.trim() || auftrag.title,
      defaultHourlyRate: r > 0 ? r : null,
    })
    setEditing(false)
  }

  const archive = () => updateAuftrag(auftrag.id, { status: 'archived' })
  const restore = () => updateAuftrag(auftrag.id, { status: 'active' })

  const isArchived = auftrag.status === 'archived'

  if (editing) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setTitle(auftrag.title); setRate(auftrag.defaultHourlyRate?.toString() ?? ''); setEditing(false) } }}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <input
          value={rate}
          onChange={e => setRate(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="€/Std"
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)' }}
        />
        <button onClick={save} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={13} />
        </button>
        <button onClick={() => { setTitle(auftrag.title); setRate(auftrag.defaultHourlyRate?.toString() ?? ''); setEditing(false) }} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'var(--surface-3)', color: 'var(--fg-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: isArchived ? 0.5 : 1, cursor: isArchived ? 'default' : 'pointer' }}
      onClick={() => !isArchived && setEditing(true)}
    >
      <span style={{ fontSize: 13, color: isArchived ? 'var(--fg-dim)' : 'var(--fg)' }}>{auftrag.title}</span>
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
        {auftrag.defaultHourlyRate != null ? fmtEur(auftrag.defaultHourlyRate) + '/h' : '—'}
      </span>
      <div style={{ display: 'flex', gap: 4, opacity: hover ? 1 : 0, transition: 'opacity 150ms' }}>
        {isArchived
          ? <button onClick={e => { e.stopPropagation(); restore() }} title="Wiederherstellen" style={btnStyle}><Archive size={12} /></button>
          : <button onClick={e => { e.stopPropagation(); archive() }} title="Archivieren" style={btnStyle}><Archive size={12} /></button>
        }
        <button onClick={e => { e.stopPropagation(); if (confirm(`„${auftrag.title}" wirklich löschen?`)) deleteAuftrag(auftrag.id) }} title="Löschen" style={btnStyle}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 5, border: 'none',
  background: 'var(--surface-3)', color: 'var(--fg-dim)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ── Neuer Auftrag Form ───────────────────────────────────────────────────────

function NewAuftragForm({ onDone }: { onDone: () => void }) {
  const createAuftrag = useAuftraege(s => s.createAuftrag)
  const [title, setTitle] = useState('')
  const [rate,  setRate]  = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const save = () => {
    const t = title.trim()
    if (!t) return
    const r = parseFloat(rate.replace(',', '.'))
    createAuftrag({ title: t, defaultHourlyRate: r > 0 ? r : null, notes: '' })
    setTitle(''); setRate('')
    ref.current?.focus()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto auto', gap: 8, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <input
        ref={ref}
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }}
        placeholder="Auftragsbezeichnung…"
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
      />
      <input
        value={rate}
        onChange={e => setRate(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }}
        placeholder="€/Std  (opt.)"
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)' }}
      />
      <button onClick={save} disabled={!title.trim()} style={{ ...btnStyle, background: title.trim() ? 'var(--accent)' : 'var(--surface-3)', color: title.trim() ? 'var(--accent-ink)' : 'var(--fg-dim)', width: 30, height: 30 }}>
        <Check size={13} />
      </button>
      <button onClick={onDone} style={{ ...btnStyle, width: 30, height: 30 }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export function AuftraegeSettings() {
  const auftraege = useAuftraege(s => s.auftraege)
  const [adding,       setAdding]       = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const active   = auftraege.filter(a => a.status === 'active')
  const archived = auftraege.filter(a => a.status === 'archived')

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Aufträge</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
            Auftragstypen für die Zeiterfassung — z.&nbsp;B. „Beratung 120&nbsp;€/h", „Entwicklung 95&nbsp;€/h".
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Neu
          </button>
        )}
      </div>

      {/* Tabellenkopf */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, padding: '6px 0', borderBottom: '2px solid var(--border)' }}>
        {['Bezeichnung', 'Stundensatz', ''].map(h => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>

      {/* Neuen Auftrag Form */}
      {adding && <NewAuftragForm onDone={() => setAdding(false)} />}

      {/* Aktive Aufträge */}
      {active.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '20px 0' }}>Noch keine Aufträge. Klicke „Neu" um den ersten anzulegen.</p>
      )}
      {active.map(a => <AuftragRow key={a.id} auftrag={a} />)}

      {/* Archivierte */}
      {archived.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--fg-dim)', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {showArchived ? '▼' : '▶'} {archived.length} archivierte Aufträge
          </button>
          {showArchived && archived.map(a => <AuftragRow key={a.id} auftrag={a} />)}
        </div>
      )}
    </div>
  )
}
