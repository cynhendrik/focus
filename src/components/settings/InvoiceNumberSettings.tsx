import { useEffect, useState, type CSSProperties } from 'react'
import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'

const DEFAULT_FORMAT = '{YYYY}-{NNNNN}'

/** Lokale Vorschau — spiegelt die Rust-Logik (apply_invoice_format). */
function previewNumber(fmt: string, start: number): string {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const yy = yyyy.slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return fmt
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{(N+)\}/g, (_m: string, ns: string) => String(Math.max(1, start)).padStart(ns.length, '0'))
}

const inputStyle: CSSProperties = {
  padding: '8px 12px', fontSize: 13, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--fg)', outline: 'none', fontFamily: 'var(--font-mono)', width: '100%',
  boxSizing: 'border-box',
}
const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase',
}

export function InvoiceNumberSettings() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const showToast = useToastStore(s => s.show)
  const [format, setFormat] = useState(DEFAULT_FORMAT)
  const [start, setStart] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    FinanceService.getInvoiceSequence(workspaceId)
      .then(([, st, fmt]) => { setFormat(fmt || DEFAULT_FORMAT); setStart(st || 1) })
      .catch(() => {})
  }, [workspaceId])

  const save = async () => {
    if (!workspaceId) return
    setSaving(true)
    try {
      await FinanceService.setInvoiceFormat(workspaceId, format.trim() || DEFAULT_FORMAT)
      await FinanceService.setInvoiceStartNumber(workspaceId, Math.max(1, Math.round(start)))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      showToast({ message: `Fehler beim Speichern: ${String(e)}`, variant: 'error' })
    }
    setSaving(false)
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Rechnungsnummern</div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Format &amp; Startnummer — wird automatisch fortlaufend vergeben</div>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Format</label>
            <input value={format} onChange={e => setFormat(e.target.value)} placeholder={DEFAULT_FORMAT} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Startnummer</label>
            <input type="number" min={1} value={start} onChange={e => setStart(Number(e.target.value) || 1)} style={{ ...inputStyle, fontFamily: 'inherit' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.7 }}>
          Platzhalter: <code>{'{YYYY}'}</code> Jahr · <code>{'{YY}'}</code> 2-stellig · <code>{'{MM}'}</code> Monat · <code>{'{NNNN}'}</code> Zähler (Stellen = Anzahl N).
          Bei Jahres-Platzhalter startet der Zähler jedes Jahr neu.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Vorschau nächste Nummer</span>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg)' }}>{previewNumber(format, start)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '8px 18px', fontSize: 13 }}>
            {saved ? 'Gespeichert ✓' : saving ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
