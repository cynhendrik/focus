import { useState } from 'react'
import { Eye, EyeOff, Copy, Check, Trash2 } from 'lucide-react'
import { getApiKey, setApiKey, clearApiKey, getModel, setModel } from '@/lib/ai/briefing'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

const MODELS = [
  { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8 (Stärkste)' },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (Empfohlen)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Schnell)' },
]

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <button onClick={copy} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}>
        {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

interface Props { workspaceId: string }

export function DeveloperSettings({ workspaceId }: Props) {
  const [apiKey, setApiKeyState] = useState(getApiKey() ?? '')
  const [showKey, setShowKey]    = useState(false)
  const [model, setModelState]   = useState(getModel())
  const [keySaved, setKeySaved]  = useState(false)

  const handleSaveKey = () => {
    if (apiKey.trim()) setApiKey(apiKey.trim())
    else clearApiKey()
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const handleClearKey = () => {
    clearApiKey()
    setApiKeyState('')
  }

  const handleModelChange = (m: string) => {
    setModelState(m)
    setModel(m)
  }

  const base   = SUPABASE_URL ?? '—'
  const secret = WEBHOOK_SECRET ?? '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Entwickler</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Interne Konfiguration — nicht für Endkunden sichtbar</p>
      </div>

      {/* Backend URLs */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Backend</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {SUPABASE_URL
            ? <CopyRow label="Supabase URL" value={SUPABASE_URL} />
            : <div style={{ padding: '14px 20px', fontSize: 12, color: 'var(--warn)' }}>VITE_SUPABASE_URL nicht gesetzt</div>
          }
          {SUPABASE_URL && WEBHOOK_SECRET && (
            <>
              <CopyRow label="Zoom Webhook URL" value={`${SUPABASE_URL}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${WEBHOOK_SECRET}&source=zoom`} />
              <CopyRow label="Generic Webhook URL" value={`${SUPABASE_URL}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${WEBHOOK_SECRET}&source=generic`} />
            </>
          )}
          {(!SUPABASE_URL || !WEBHOOK_SECRET) && (
            <div style={{ padding: '14px 20px', fontSize: 12, color: 'var(--warn)', borderTop: SUPABASE_URL ? '1px solid var(--border)' : 'none' }}>
              {!SUPABASE_URL ? 'VITE_SUPABASE_URL' : 'VITE_LEAD_WEBHOOK_SECRET'} nicht gesetzt
            </div>
          )}
        </div>
      </div>

      {/* API Key */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Anthropic API Key</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKeyState(e.target.value)}
                placeholder="sk-ant-api03-..."
                style={{
                  width: '100%', padding: '8px 36px 8px 12px', fontSize: 13, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--fg)', outline: 'none', fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box' as const,
                }}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 0 }}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={handleSaveKey} className="btn-primary" style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}>
              {keySaved ? '✓' : 'Speichern'}
            </button>
            {apiKey && (
              <button onClick={handleClearKey} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Model */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Modell</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {MODELS.map((m, i) => (
            <button
              key={m.id}
              onClick={() => handleModelChange(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', width: '100%', textAlign: 'left' as const,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: i < MODELS.length - 1 ? '1px solid var(--border)' : 'none',
                color: 'var(--fg)',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${model === m.id ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: model === m.id ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {model === m.id && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-ink)' }} />}
              </div>
              <span style={{ fontSize: 13, fontWeight: model === m.id ? 600 : 400 }}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
