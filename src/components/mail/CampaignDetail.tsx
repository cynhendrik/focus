import { useEffect, useState } from 'react'
import { ArrowLeft, Send } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { useCampaignStore } from '@/store/campaign.store'
import { useLeadsStore } from '@/store/leads.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { CampaignRecipient, LeadRef, CampaignProgress } from '@/types/campaign.types'

function KpiTile({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? 'var(--fg)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function RecipientRow({ r }: { r: CampaignRecipient }) {
  const statusColor = r.repliedAt ? '#a3e635' : r.error ? '#ef4444' : 'var(--fg-dim)'
  const statusText  = r.repliedAt ? '✓ Antwort' : r.error ? '✗ Fehler' : '— Offen'
  const sentDate = r.sentAt
    ? new Date(r.sentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : '—'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 80px 80px',
      padding: '10px 16px', alignItems: 'center', fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.email}
      </div>
      <div style={{ color: 'var(--fg-dim)', textAlign: 'right' }}>{sentDate}</div>
      <div style={{ textAlign: 'right', fontWeight: 600, color: statusColor }}>{statusText}</div>
    </div>
  )
}

export function CampaignDetail({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const { campaigns, recipients, loadRecipients, isLoading, send, setSendProgress, sendProgress } = useCampaignStore()
  const allLeads    = useLeadsStore(s => s.leads)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const campaign    = campaigns.find(c => c.id === campaignId)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Wire campaign-progress event listener
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let mounted = true
    listen<CampaignProgress>('campaign-progress', (e) => {
      if (mounted) setSendProgress(e.payload)
    }).then(fn => { if (mounted) unlisten = fn })
    return () => {
      mounted = false
      unlisten?.()
    }
  }, [setSendProgress])

  const handleSend = async () => {
    if (!campaign) return
    setSending(true)
    setSendError(null)
    try {
      const emailToLead = new Map(
        allLeads
          .filter((l): l is typeof l & { email: string } => l.email != null && l.email !== '')
          .map(l => [l.email, l])
      )
      const leadRefs: LeadRef[] = recipients.map(r => {
        const lead = emailToLead.get(r.email)
        return { id: r.leadId, email: r.email, name: lead?.name ?? r.email, company: lead?.companyName ?? undefined }
      })
      await send(campaign.id, JSON.stringify(leadRefs), workspaceId)
      await loadRecipients(campaign.id)
    } catch (e) {
      setSendError(String(e))
    } finally {
      setSending(false)
      setSendProgress(null)
    }
  }

  useEffect(() => {
    loadRecipients(campaignId)
  }, [campaignId, loadRecipients])

  if (!campaign) return null

  const open = campaign.totalRecipients - campaign.repliedCount
  const replyRate = campaign.sentCount > 0
    ? `${Math.round((campaign.repliedCount / campaign.sentCount) * 100)}%`
    : '—'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px' }}>
        <button
          onClick={onBack}
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', color: 'var(--fg-dim)', cursor: 'pointer' }}
        >
          <ArrowLeft size={13} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{campaign.name}</h2>
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '2px 0 0' }}>{campaign.subject}</p>
        </div>
        {campaign.status === 'draft' && (
          <button
            onClick={handleSend}
            disabled={sending || recipients.length === 0}
            className="btn-primary"
            style={{ fontSize: 11, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Send size={11} />
            {sending
              ? sendProgress
                ? `Sendet… ${sendProgress.sent}/${sendProgress.total}`
                : 'Sendet…'
              : `Jetzt senden (${recipients.length})`
            }
          </button>
        )}
      </div>

      {sendError && (
        <div style={{ margin: '0 20px 10px', fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>
          Fehler: {sendError}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 16px' }}>
        <KpiTile value={campaign.sentCount}    label="Gesendet" />
        <KpiTile value={campaign.repliedCount} label="Geantwortet" color="#a3e635" />
        <KpiTile value={replyRate}             label="Reply Rate"  color="#2dd4bf" />
        <KpiTile value={open}                  label="Offen"       color="#fb923c" />
      </div>

      {/* Recipient list */}
      <div style={{ margin: '0 20px' }}>
        <div className="section-head" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 11 }}>Empfänger <span className="count">{String(recipients.length).padStart(2, '0')}</span></h2>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px',
            padding: '8px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase',
          }}>
            <span>Lead</span>
            <span style={{ textAlign: 'right' }}>Gesendet</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>
          {isLoading && recipients.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 11 }}>Lädt…</div>
          ) : recipients.map((r, i) => (
            <div key={r.id} style={{ borderBottom: i < recipients.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <RecipientRow r={r} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
