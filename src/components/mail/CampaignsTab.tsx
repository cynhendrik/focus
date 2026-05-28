import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useCampaignStore } from '@/store/campaign.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { CampaignWithStats } from '@/types/campaign.types'

function replyRate(c: CampaignWithStats): string {
  if (c.sentCount === 0) return '—'
  return `${Math.round((c.repliedCount / c.sentCount) * 100)}%`
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:   { label: 'Entwurf',        color: 'var(--fg-dim)', bg: 'rgba(255,255,255,0.06)' },
    sending: { label: 'Wird gesendet',  color: '#fb923c',        bg: 'rgba(251,146,60,0.12)' },
    sent:    { label: 'Gesendet',       color: '#a3e635',        bg: 'rgba(163,230,53,0.12)' },
    error:   { label: 'Fehler',         color: '#ef4444',        bg: 'rgba(239,68,68,0.12)'  },
  }
  const s = map[status] ?? map.draft
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export function CampaignsTab({ onNew, onSelect }: {
  onNew: () => void
  onSelect: (id: string) => void
}) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const { campaigns, isLoading, load } = useCampaignStore()

  useEffect(() => {
    if (workspaceId) load(workspaceId)
  }, [workspaceId])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Kampagnen</h2>
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '2px 0 0' }}>
            {campaigns.length} Kampagne{campaigns.length !== 1 ? 'n' : ''}
          </p>
        </div>
        <button
          onClick={onNew}
          className="btn-primary"
          style={{ fontSize: 11, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Plus size={11} />
          Neue Kampagne
        </button>
      </div>

      {isLoading && campaigns.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12 }}>
          Lädt…
        </div>
      ) : campaigns.length === 0 ? (
        <div
          style={{ margin: '0 20px', padding: '32px', textAlign: 'center', border: '1.5px dashed var(--border)', borderRadius: 12, color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer' }}
          onClick={onNew}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          Keine Kampagnen — erste Kampagne erstellen
        </div>
      ) : (
        <div className="card" style={{ margin: '0 20px', padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 70px 90px 80px 100px 80px',
            padding: '8px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Kampagne</span>
            <span style={{ textAlign: 'right' }}>Empfänger</span>
            <span style={{ textAlign: 'right' }}>Gesendet</span>
            <span style={{ textAlign: 'right' }}>Antworten</span>
            <span style={{ textAlign: 'right' }}>Reply Rate</span>
            <span style={{ textAlign: 'center' }}>Status</span>
          </div>
          {campaigns.map((c, i) => (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 70px 90px 80px 100px 80px',
                padding: '12px 16px', cursor: 'pointer', transition: 'background 120ms',
                borderBottom: i < campaigns.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.subject}
                </div>
              </div>
              <div style={{ fontSize: 12, textAlign: 'right' }}>{c.totalRecipients}</div>
              <div style={{ fontSize: 12, textAlign: 'right', color: '#a3e635', fontWeight: 600 }}>{c.sentCount}</div>
              <div style={{ fontSize: 12, textAlign: 'right', color: '#2dd4bf', fontWeight: 600 }}>{c.repliedCount}</div>
              <div style={{ fontSize: 12, textAlign: 'right', fontWeight: 700, color: c.sentCount > 0 ? '#2dd4bf' : 'var(--fg-dim)' }}>
                {replyRate(c)}
              </div>
              <div style={{ textAlign: 'center' }}>
                <StatusChip status={c.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
