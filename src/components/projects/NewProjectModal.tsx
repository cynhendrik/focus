import { useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useDialogFocus } from '@/components/ui/Sheet'

interface Props {
  presetCustomerId?: string
  onClose: () => void
}

export function NewProjectModal({ presetCustomerId, onClose }: Props) {
  const upsert = useProjectsStore(s => s.upsert)
  const createPhase = useProjectsStore(s => s.createPhase)
  const customers = useCustomersStore(s => s.customers)
  const setSelectedProjectId = useUiStore(s => s.setSelectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [customerId, setCustomerId] = useState(presetCustomerId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [firstPhaseName, setFirstPhaseName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)

  const lockedCustomer = presetCustomerId ? customers.find(c => c.id === presetCustomerId) : null
  const canSave = title.trim() !== '' && customerId !== '' && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      let projectId = createdProjectId
      if (!projectId) {
        const project = await upsert({
          workspaceId,
          accountId: customerId,
          title: title.trim(),
          description: description.trim() || undefined,
        })
        projectId = project.id
        setCreatedProjectId(projectId)
      }
      if (firstPhaseName.trim()) {
        await createPhase({ projectId, name: firstPhaseName.trim() })
      }
      setSelectedProjectId(projectId)
      setAppView('project_detail')
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Neues Projekt"
        tabIndex={-1}
        style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 440, maxWidth: '90vw' }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Neues Projekt</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Kunde *</label>
            {lockedCustomer ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{lockedCustomer.name}</div>
              </div>
            ) : (
              <select className="mock-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">— Kunden auswählen —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` · ${c.company}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Titel *</label>
            <input
              className="mock-input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Website Relaunch" autoFocus={!lockedCustomer}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Beschreibung</label>
            <textarea
              className="mock-input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional" rows={2} style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Erste Phase</label>
            <input
              className="mock-input" value={firstPhaseName} onChange={e => setFirstPhaseName(e.target.value)}
              placeholder="z.B. Konzeption (optional, kann auch später angelegt werden)"
            />
          </div>
        </div>

        {saveError && (
          <div style={{
            marginTop: 16, padding: '8px 12px', borderRadius: 8,
            background: 'oklch(72% 0.18 25 / 0.12)', border: '1px solid oklch(72% 0.18 25 / 0.4)',
            color: 'oklch(72% 0.18 25)', fontSize: 12, lineHeight: 1.4,
          }}>
            {createdProjectId
              ? `Projekt wurde angelegt, aber die erste Phase konnte nicht erstellt werden: ${saveError}`
              : `Speichern fehlgeschlagen: ${saveError}`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={!canSave} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Wird angelegt…' : 'Projekt anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
