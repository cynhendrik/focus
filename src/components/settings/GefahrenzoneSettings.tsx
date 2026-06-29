import { useRef, useState } from 'react'
import { AlertTriangle, Download, Upload } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useToastStore } from '@/store/toast.store'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { SettingsPage, SettingCard } from './ui'

interface Props { workspaceId: string }

interface ImportSummary { tables: number; rows: number; skipped_unknown_columns: number }

export function GefahrenzoneSettings({ workspaceId: _workspaceId }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')
  const [busy, setBusy] = useState<'export' | 'import' | 'reset' | 'delete' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToastStore(s => s.show)
  const activeId = useWorkspaceStore(s => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const isOwner = workspaces.find(w => w.id === activeId)?.role === 'owner'
  const deleteWorkspace = useWorkspaceStore(s => s.deleteWorkspace)
  const localWorkspaces = useWorkspaceStore(s => s.localWorkspaces)

  const handleReset = async () => {
    if (!isOwner) {
      toast({ message: 'Nur der Inhaber dieses Workspace kann zurücksetzen.', variant: 'error' })
      return
    }
    const sharedWarn = isShared
      ? '\n\nACHTUNG: Dieser Workspace ist GETEILT — dies löscht die Daten für ALLE Mitglieder.'
      : ''
    if (!window.confirm(`Workspace wirklich zurücksetzen? Alle Inhalte werden gelöscht (Firmenprofil & Einstellungen bleiben). Unwiderruflich.${sharedWarn}`)) {
      return
    }
    setBusy('reset')
    try {
      await invoke('cmd_reset_workspace')
      if (isShared && activeId) {
        const { error } = await supabase.rpc('reset_workspace', { ws_id: activeId })
        if (error) {
          toast({ message: `Lokal geleert, aber Cloud-Reset fehlgeschlagen: ${error.message}. Bitte erneut ausführen.`, variant: 'error', durationMs: 8000 })
          setBusy(null)
          return
        }
      }
      toast({ message: 'Workspace zurückgesetzt — App lädt neu…', variant: 'success', durationMs: 2000 })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast({ message: `Reset fehlgeschlagen: ${String(e)}`, variant: 'error' })
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!activeId) return
    if (isShared && !isOwner) {
      toast({ message: 'Nur der Inhaber dieses Workspace kann ihn löschen.', variant: 'error' })
      return
    }
    const sharedWarn = isShared
      ? '\n\nACHTUNG: Dieser Workspace ist GETEILT — er wird für ALLE Mitglieder gelöscht.'
      : ''
    if (!window.confirm(`Workspace „${activeId}" endgültig löschen? Alle Inhalte UND der Workspace selbst werden entfernt. Unwiderruflich.${sharedWarn}`)) return
    setBusy('delete')
    try {
      await deleteWorkspace(activeId)
      toast({ message: 'Workspace gelöscht — App lädt neu…', variant: 'success', durationMs: 2000 })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast({ message: `Löschen fehlgeschlagen: ${String(e)}`, variant: 'error' })
      setBusy(null)
    }
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
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
      const userId = useAuthStore.getState().user?.id ?? null
      if (!activeWorkspaceId) {
        toast({ message: 'Kein aktiver Workspace — Import abgebrochen.', variant: 'error' })
        setBusy(null); return
      }
      const s = await invoke<ImportSummary>('cmd_import_backup', { json, activeWorkspaceId, userId })
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
    <SettingsPage
      title="Daten & Gefahrenzone"
      subtitle="Backup, Wiederherstellung und irreversible Aktionen"
      maxWidth={560}
    >
      {/* Backup / Export */}
      <SettingCard>
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
      </SettingCard>

      {/* Import / Restore */}
      <SettingCard>
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
      </SettingCard>

      {/* Reset */}
      <SettingCard danger>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} style={{ color: '#f87171' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Workspace zurücksetzen</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Löscht alle Kunden, Deals, Leads und Einstellungen. Nicht rückgängig machbar.
        </p>
        {!isOwner && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 10px' }}>
            Nur der Inhaber dieses Workspace kann zurücksetzen.
          </p>
        )}
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder='Tippe "zurücksetzen" zum Bestätigen'
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            borderRadius: 'var(--radius-sm)', marginBottom: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box' as const,
          }}
        />
        <button
          disabled={confirmText !== 'zurücksetzen' || !isOwner || busy !== null}
          onClick={handleReset}
          style={{
            padding: '7px 16px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
            cursor: confirmText === 'zurücksetzen' && isOwner && busy === null ? 'pointer' : 'not-allowed',
            background: confirmText === 'zurücksetzen' && isOwner && busy === null ? '#ef4444' : 'var(--surface-2)',
            border: '1px solid ' + (confirmText === 'zurücksetzen' && isOwner && busy === null ? '#ef4444' : 'var(--border)'),
            color: confirmText === 'zurücksetzen' && isOwner && busy === null ? '#fff' : 'var(--fg-dim)',
            transition: 'background 140ms, color 140ms',
          }}
        >
          {busy === 'reset' ? 'Setzt zurück…' : 'Workspace zurücksetzen'}
        </button>
      </SettingCard>

      {/* Löschen */}
      <SettingCard danger>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} style={{ color: '#f87171' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Workspace löschen</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Entfernt diesen Workspace vollständig — alle Inhalte und den Workspace selbst. Nicht rückgängig machbar.
          {isShared ? ' Bei geteilten Workspaces für alle Mitglieder.' : ''}
        </p>
        {isShared && !isOwner && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 10px' }}>
            Nur der Inhaber dieses Workspace kann ihn löschen.
          </p>
        )}
        {!isShared && localWorkspaces.length > 1 && (
          <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 10px' }}>
            Hinweis: Lokale Workspaces teilen sich eine Datenbank — dies leert die lokalen Daten aller lokalen Workspaces.
          </p>
        )}
        <input
          value={confirmDelete}
          onChange={e => setConfirmDelete(e.target.value)}
          placeholder='Tippe "löschen" zum Bestätigen'
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            borderRadius: 'var(--radius-sm)', marginBottom: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
          }}
        />
        <button
          disabled={confirmDelete !== 'löschen' || (isShared && !isOwner) || busy !== null}
          onClick={handleDelete}
          style={{
            padding: '7px 16px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
            cursor: confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? 'pointer' : 'not-allowed',
            background: confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? '#ef4444' : 'var(--surface-2)',
            border: '1px solid ' + (confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? '#ef4444' : 'var(--border)'),
            color: confirmDelete === 'löschen' && !(isShared && !isOwner) && busy === null ? '#fff' : 'var(--fg-dim)',
            transition: 'background 140ms, color 140ms',
          }}
        >
          {busy === 'delete' ? 'Lösche…' : 'Workspace löschen'}
        </button>
      </SettingCard>
    </SettingsPage>
  )
}
