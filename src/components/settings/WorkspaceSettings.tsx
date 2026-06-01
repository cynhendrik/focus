import { useState, useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCompanyStore } from '@/store/company.store'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input readOnly value={value} style={{
          flex: 1, padding: '8px 12px', fontSize: 12,
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--fg-dim)',
          outline: 'none', fontFamily: 'var(--font-mono)',
        }} />
        <button
          onClick={copy}
          style={{
            padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

interface Props { workspaceId: string }

export function WorkspaceSettings({ workspaceId }: Props) {
  const profile     = useCompanyStore(s => s.profile)
  const load        = useCompanyStore(s => s.load)
  const saveProfile = useCompanyStore(s => s.saveProfile)
  const [name, setName] = useState(profile.name ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [load])
  useEffect(() => { setName(profile.name ?? '') }, [profile.name])

  const handleSave = async () => {
    await saveProfile({ ...profile, name })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Workspace</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Grundeinstellungen deines Workspace</p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Workspace Name
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSave}
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 16px' }}
            >
              {saved ? '✓ Gespeichert' : 'Speichern'}
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <CopyField label="Workspace ID" value={workspaceId} />
        </div>
      </div>
    </div>
  )
}
