import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

export function ZoomSetupModal({ onClose }: { onClose: () => void }) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const [copied, setCopied] = useState(false)

  const webhookUrl = (SUPABASE_URL && WEBHOOK_SECRET)
    ? `${SUPABASE_URL}/functions/v1/lead-intake?workspace_id=${workspaceId}&secret=${WEBHOOK_SECRET}&source=zoom`
    : null

  const copy = () => {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Zoom einrichten</h2>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '3px 0 0' }}>Webinar-Teilnehmer automatisch als Leads importieren</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)' }}>
            <X size={16} />
          </button>
        </div>

        <ol style={{ margin: '0 0 20px', padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Gehe zu zoom.us → Einstellungen → Integrationen → Webhook-Abonnements',
            'Klicke auf „+ Neues Ereignis-Abonnement"',
            'Aktiviere das Ereignis: webinar.participant_joined',
            'Füge die folgende URL als Endpunkt-URL ein:',
            'Speichere und aktiviere das Abonnement',
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>
              {step}
            </li>
          ))}
        </ol>

        {webhookUrl ? (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Webhook URL</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' as const, lineHeight: 1.5 }}>
                {webhookUrl}
              </code>
              <button onClick={copy} style={{ flexShrink: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center' }}>
                {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: 'var(--warn)' }}>
            Webhook-URL nicht verfügbar — VITE_SUPABASE_URL oder VITE_LEAD_WEBHOOK_SECRET nicht konfiguriert.
          </div>
        )}

        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12, padding: '7px 16px' }}>
          Schließen
        </button>
      </div>
    </div>
  )
}
