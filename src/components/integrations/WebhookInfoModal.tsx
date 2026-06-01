import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

const EXAMPLE_PAYLOAD = `{
  "name": "Max Mustermann",
  "email": "max@beispiel.de",
  "source": "generic"
}`

function CopyUrl({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, wordBreak: 'break-all' as const, lineHeight: 1.5 }}>
          {url}
        </code>
        <button onClick={copy} style={{ flexShrink: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}>
          {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  )
}

export function WebhookInfoModal({ onClose }: { onClose: () => void }) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const base   = SUPABASE_URL ?? null
  const secret = WEBHOOK_SECRET ?? null

  const zoomUrl    = base && secret ? `${base}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${secret}&source=zoom` : null
  const genericUrl = base && secret ? `${base}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${secret}&source=generic` : null
  const configured = !!zoomUrl

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 500, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Webhook</h2>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '3px 0 0' }}>Leads von externen Quellen empfangen</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)' }}>
            <X size={16} />
          </button>
        </div>

        {configured ? (
          <>
            <CopyUrl label="Zoom Webhook URL" url={zoomUrl!} />
            <CopyUrl label="Generic Webhook URL (Wix, Zapier, Typeform)" url={genericUrl!} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Beispiel-Payload (POST, JSON)</div>
              <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, overflow: 'auto' }}>
                {EXAMPLE_PAYLOAD}
              </pre>
            </div>
          </>
        ) : (
          <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '14px', fontSize: 12, color: 'var(--warn)' }}>
            Webhook-URLs nicht verfügbar — VITE_SUPABASE_URL oder VITE_LEAD_WEBHOOK_SECRET nicht konfiguriert.
          </div>
        )}

        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '7px 16px', alignSelf: 'flex-start' }}>
          Schließen
        </button>
      </div>
    </div>
  )
}
