import { useState, useMemo } from 'react'
import { X, Send, Users, List } from 'lucide-react'
import { useCampaignStore } from '@/store/campaign.store'
import { useLeadsStore } from '@/store/leads.store'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { LeadRef } from '@/types/campaign.types'

type RecipientMode = 'smartlist' | 'manual'

export function CreateCampaignModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (campaignId: string) => void
}) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const leads       = useLeadsStore(s => s.leads)
  const smartLists  = useSmartListsStore(s => s.lists)
  const accounts    = useMailStore(s => s.accounts)
  const create      = useCampaignStore(s => s.create)

  const [name,        setName]        = useState('')
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [senderId,    setSenderId]    = useState(accounts[0]?.id ?? '')
  const [mode,        setMode]        = useState<RecipientMode>('smartlist')
  const [smartListId, setSmartListId] = useState<string>(smartLists[0]?.id ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Only leads with a valid email address
  const leadsWithEmail = useMemo(() => leads.filter((l): l is typeof l & { email: string } => l.email != null && l.email !== ''), [leads])

  const resolvedLeads = useMemo((): LeadRef[] => {
    if (mode === 'manual') {
      return leadsWithEmail
        .filter(l => selectedIds.has(l.id))
        .map(l => ({ id: l.id, email: l.email, name: l.name, company: l.companyName ?? undefined }))
    }
    // Smart list mode: use all leads with email (v1 — full list)
    return leadsWithEmail.map(l => ({
      id: l.id, email: l.email, name: l.name, company: l.companyName ?? undefined,
    }))
  }, [mode, leadsWithEmail, selectedIds])

  const toggleLead = (id: string) => {
    setSelectedIds(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleCreate = async () => {
    if (!name.trim() || !subject.trim() || !body.trim() || !senderId || resolvedLeads.length === 0) {
      setError('Bitte alle Felder ausfüllen und mindestens einen Empfänger wählen.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await create({
        workspaceId,
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        senderAccountId: senderId,
        smartListId: mode === 'smartlist' ? smartListId || undefined : undefined,
        leads: resolvedLeads,
      })
      onCreated('')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
    >
      <div style={{
        width: 580, maxWidth: '94vw', maxHeight: '88vh',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(45,212,191,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={12} style={{ color: '#2dd4bf' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Neue Kampagne</span>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer' }}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Kampagnen-Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mock-input" placeholder="Kalt-Outreach Mai 2026" style={{ width: '100%' }} />
          </div>

          {/* Sender */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Absender-Konto</label>
            <select value={senderId} onChange={e => setSenderId(e.target.value)} className="mock-input" style={{ width: '100%' }}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.displayName || a.email}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>
              Betreff
              <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--fg-dim)' }}>— {'{{name}}'} und {'{{company}}'} werden ersetzt</span>
            </label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="mock-input" placeholder='Kurze Vorstellung — {{name}}' style={{ width: '100%' }} />
          </div>

          {/* Body */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Nachricht</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="mock-input"
              placeholder={`Hallo {{name}},\n\nkurze Frage…`}
              style={{ width: '100%', minHeight: 120, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>

          {/* Recipient mode toggle */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 6 }}>Empfänger</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                onClick={() => setMode('smartlist')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: mode === 'smartlist' ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.05)',
                  color: mode === 'smartlist' ? '#2dd4bf' : 'var(--fg-dim)',
                  border: mode === 'smartlist' ? '1px solid rgba(45,212,191,0.25)' : '1px solid transparent',
                }}
              >
                <List size={11} /> Smart List
              </button>
              <button
                onClick={() => setMode('manual')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: mode === 'manual' ? 'rgba(163,230,53,0.12)' : 'rgba(255,255,255,0.05)',
                  color: mode === 'manual' ? '#a3e635' : 'var(--fg-dim)',
                  border: mode === 'manual' ? '1px solid rgba(163,230,53,0.25)' : '1px solid transparent',
                }}
              >
                <Users size={11} /> Manuell
              </button>
            </div>

            {mode === 'smartlist' && (
              <select value={smartListId} onChange={e => setSmartListId(e.target.value)} className="mock-input" style={{ width: '100%' }}>
                {smartLists.map(sl => (
                  <option key={sl.id} value={sl.id}>{sl.icon} {sl.name}</option>
                ))}
              </select>
            )}

            {mode === 'manual' && (
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {leadsWithEmail.map((l, i) => (
                  <label
                    key={l.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                      borderBottom: i < leadsWithEmail.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: 12,
                    }}
                  >
                    <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleLead(l.id)} />
                    <span style={{ fontWeight: 600 }}>{l.name}</span>
                    {l.companyName && <span style={{ color: 'var(--fg-dim)' }}>· {l.companyName}</span>}
                    <span style={{ color: 'var(--fg-dim)', marginLeft: 'auto', fontSize: 11 }}>{l.email}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 6 }}>
              {resolvedLeads.length} Empfänger ausgewählt
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Abbrechen</button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary"
            style={{ fontSize: 12, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={12} />
            {saving ? 'Erstelle…' : `Kampagne erstellen (${resolvedLeads.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
