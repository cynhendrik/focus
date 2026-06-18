import { useRef, useState } from 'react'
import { AlertTriangle, Download, Upload } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useToastStore } from '@/store/toast.store'

interface Props { workspaceId: string }

interface ImportSummary { tables: number; rows: number; skipped_unknown_columns: number }

export function GefahrenzoneSettings({ workspaceId: _workspaceId }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToastStore(s => s.show)

  const handleReset = () => {
    // Ehrlich: es gibt (noch) kein Backend-Kommando, das den Workspace wirklich
    // leert. Vorher hat der Button "✓ Zurückgesetzt" gezeigt, ohne etwas zu
    // löschen — das war irreführend. Bis ein echtes, abgesichertes Reset-Kommando
    // existiert, sagen wir die Wahrheit statt Erfolg vorzutäuschen.
    toast({
      message: 'Workspace-Reset ist noch nicht verfügbar. Exportiere ein Backup und lösche Einträge gezielt, oder installiere neu.',
      variant: 'error',
      durationMs: 6000,
    })
    setConfirmText('')
  }

  // Vollständiges Backup — schreibt ALLE Tabellen (nicht nur die im Store
  // geladenen) als versioniertes JSON. Diese Datei dient später auch als
  // Eingabe für den Cloud-/SaaS-Import. (Rust: cmd_export_backup)
  const handleExport = async () => {
    setBusy('export')
    try {
      const path = await invoke<string>('cmd_export_backup', {})
      toast({ message: `Backup gespeichert: ${path}`, variant: 'success', durationMs: 6000 })
    } catch (e) {
      toast({ message: `Export fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm('Backup importieren? Einträge mit gleicher ID werden überschrieben.')) return
    setBusy('import')
    try {
      const json = await file.text()
      const s = await invoke<ImportSummary>('cmd_import_backup', { json })
      toast({
        message: `${s.rows} Einträge aus ${s.tables} Tabellen wiederhergestellt — App lädt neu…`,
        variant: 'success', durationMs: 3000,
      })
      setTimeout(() => window.location.reload(), 1600)
    } catch (err) {
      toast({ message: `Import fehlgeschlagen: ${String(err)}`, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Daten & Gefahrenzone</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Backup, Wiederherstellung und irreversible Aktionen</p>
      </div>

      {/* Backup / Export */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Backup exportieren</div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Sichert <strong>alle</strong> Daten (Kunden, Rechnungen, Kontakte, Notizen, Kalender …) als
          eine JSON-Datei. Bewahre sie sicher auf — bei einem Gerätewechsel oder -defekt kannst du sie
          unten wieder importieren.
        </p>
        <button onClick={handleExport} disabled={busy !== null} className="btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 16px' }}>
          <Download size={13} /> {busy === 'export' ? 'Exportiere…' : 'Backup exportieren'}
        </button>
      </div>

      {/* Import / Restore */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Backup importieren</div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Stellt Daten aus einer Backup-Datei wieder her. Einträge mit gleicher ID werden überschrieben,
          neue ergänzt.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy !== null} className="btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 16px' }}>
          <Upload size={13} /> {busy === 'import' ? 'Importiere…' : 'Backup importieren'}
        </button>
      </div>

      {/* Reset */}
      <div style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} style={{ color: '#f87171' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Workspace zurücksetzen</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Löscht alle Kunden, Deals, Leads und Einstellungen. Nicht rückgängig machbar.
        </p>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder='Tippe "zurücksetzen" zum Bestätigen'
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8, marginBottom: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box' as const,
          }}
        />
        <button
          disabled={confirmText !== 'zurücksetzen'}
          onClick={handleReset}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: confirmText === 'zurücksetzen' ? 'pointer' : 'not-allowed',
            background: confirmText === 'zurücksetzen' ? '#ef4444' : 'var(--surface-2)',
            border: '1px solid ' + (confirmText === 'zurücksetzen' ? '#ef4444' : 'var(--border)'),
            color: confirmText === 'zurücksetzen' ? '#fff' : 'var(--fg-dim)',
            transition: 'background 140ms, color 140ms',
          }}
        >
          Workspace zurücksetzen
        </button>
      </div>
    </div>
  )
}
