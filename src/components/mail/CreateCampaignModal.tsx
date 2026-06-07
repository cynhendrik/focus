import { useState, useMemo, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { X, Send, Paperclip, Bold, Italic, List, Users, Building2 } from 'lucide-react'
import { useCampaignStore } from '@/store/campaign.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAccountsStore } from '@/store/accounts.store'
import { CampaignService } from '@/services/campaign.service'
import type { LeadRef } from '@/types/campaign.types'

type RecipientType = 'lead' | 'account'

// ── Mini toolbar button ───────────────────────────────────────────────────────

function ToolBtn({
  active, onClick, children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{
        width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(45,212,191,0.15)' : 'none',
        border: active ? '1px solid rgba(45,212,191,0.4)' : '1px solid transparent',
        color: active ? '#2dd4bf' : 'var(--fg-dim)',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function CreateCampaignModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (campaignId: string) => void
}) {
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const leads        = useLeadsStore(s => s.leads)
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const create       = useCampaignStore(s => s.create)

  const [name,           setName]           = useState('')
  const [subject,        setSubject]        = useState('')
  const [senderId,       setSenderId]       = useState(mailAccounts[0]?.id ?? '')
  const [recipientType,  setRecipientType]  = useState<RecipientType>('lead')
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [search,         setSearch]         = useState('')
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Hallo {{name}},\n\n…' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:120px; font-family:inherit; padding:0;',
      },
    },
  })

  // ── Filtered lists ──────────────────────────────────────────────────────────

  const leadsWithEmail = useMemo(
    () => leads.filter((l): l is typeof l & { email: string } => l.email != null && l.email !== ''),
    [leads],
  )

  const accountsWithEmail = useMemo(
    () => accounts.filter(a => a.email),
    [accounts],
  )

  const filteredLeads = useMemo(() => {
    if (!search) return leadsWithEmail
    const q = search.toLowerCase()
    return leadsWithEmail.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.companyName ?? '').toLowerCase().includes(q),
    )
  }, [leadsWithEmail, search])

  const filteredAccounts = useMemo(() => {
    if (!search) return accountsWithEmail
    const q = search.toLowerCase()
    return accountsWithEmail.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.email ?? '').toLowerCase().includes(q),
    )
  }, [accountsWithEmail, search])

  const visibleItems = recipientType === 'lead' ? filteredLeads : filteredAccounts

  // ── Resolved recipients ─────────────────────────────────────────────────────

  const resolvedRecipients = useMemo((): LeadRef[] => {
    if (recipientType === 'lead') {
      return leadsWithEmail
        .filter(l => selectedIds.has(l.id))
        .map(l => ({ id: l.id, email: l.email, name: l.name, company: l.companyName ?? undefined }))
    }
    return accountsWithEmail
      .filter(a => selectedIds.has(a.id))
      .map(a => ({ id: a.id, email: a.email!, name: a.name }))
  }, [recipientType, leadsWithEmail, accountsWithEmail, selectedIds])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const switchType = (type: RecipientType) => {
    setRecipientType(type)
    setSelectedIds(new Set())
    setSearch('')
  }

  const toggleItem = (id: string) => {
    setSelectedIds(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    const ids = visibleItems.map(i => i.id)
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (allSelected) { ids.forEach(id => n.delete(id)) }
      else { ids.forEach(id => n.add(id)) }
      return n
    })
  }

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
      const path = await CampaignService.storeAttachment(bytes, file.name)
      setAttachmentPath(path)
      setAttachmentName(file.name)
    } catch (err) {
      setError(`Anhang konnte nicht gespeichert werden: ${String(err)}`)
    }
    e.target.value = ''
  }, [])

  const handleCreate = async () => {
    const body = editor?.getHTML() ?? ''
    const hasContent = body.replace(/<[^>]*>/g, '').trim().length > 0
    if (!name.trim() || !subject.trim() || !hasContent || !senderId || resolvedRecipients.length === 0) {
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
        body,
        senderAccountId: senderId,
        leads: resolvedRecipients,
        attachmentPath: attachmentPath ?? undefined,
      })
      onCreated('')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const allVisible = visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id))

  // ── Render ──────────────────────────────────────────────────────────────────

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
        width: 620, maxWidth: '95vw', maxHeight: '90vh',
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
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name + Sender row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Kampagnen-Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="mock-input" placeholder="Kalt-Outreach Juni 2026" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Absender</label>
              <select value={senderId} onChange={e => setSenderId(e.target.value)} className="mock-input" style={{ width: '100%' }}>
                {mailAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.displayName || a.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>
              Betreff
              <span style={{ fontWeight: 400, marginLeft: 6 }}>— {'{{name}}'} und {'{{company}}'} werden ersetzt</span>
            </label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="mock-input" placeholder='Kurze Vorstellung — {{name}}' style={{ width: '100%' }} />
          </div>

          {/* Body editor */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Nachricht</label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                <ToolBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
                  <Bold size={13} />
                </ToolBtn>
                <ToolBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                  <Italic size={13} />
                </ToolBtn>
                <ToolBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                  <List size={13} />
                </ToolBtn>
              </div>
              {/* Editor area */}
              <div style={{ padding: '10px 12px' }}>
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {/* PDF Attachment */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 6 }}>PDF-Anhang <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={handleFilePick} />
            {attachmentName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 8, fontSize: 12 }}>
                <Paperclip size={12} style={{ color: '#2dd4bf', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachmentName}</span>
                <button
                  onClick={() => { setAttachmentPath(null); setAttachmentName(null) }}
                  style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-ghost"
                style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Paperclip size={12} />
                PDF auswählen
              </button>
            )}
          </div>

          {/* Recipients */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)' }}>Empfänger</label>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {(['lead', 'account'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => switchType(type)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 10px',
                      background: recipientType === type ? 'rgba(45,212,191,0.15)' : 'none',
                      color: recipientType === type ? '#2dd4bf' : 'var(--fg-dim)',
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {type === 'lead' ? <Users size={10} /> : <Building2 size={10} />}
                    {type === 'lead' ? 'Leads' : 'Kunden'}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mock-input"
              placeholder={recipientType === 'lead' ? 'Leads durchsuchen…' : 'Kunden durchsuchen…'}
              style={{ width: '100%', marginBottom: 6 }}
            />

            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {/* Select all row */}
              {visibleItems.length > 0 && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)',
                }}>
                  <input type="checkbox" checked={allVisible} onChange={toggleAll} />
                  Alle auswählen ({visibleItems.length})
                </label>
              )}

              {visibleItems.length === 0 ? (
                <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--fg-dim)' }}>
                  {recipientType === 'lead'
                    ? 'Keine Leads mit E-Mail-Adresse vorhanden.'
                    : 'Keine Kunden mit E-Mail-Adresse vorhanden.'}
                </div>
              ) : visibleItems.map((item, i) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                    borderBottom: i < visibleItems.length - 1 ? '1px solid var(--border)' : 'none',
                    fontSize: 12,
                  }}
                >
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleItem(item.id)} />
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  {'companyName' in item && item.companyName && (
                    <span style={{ color: 'var(--fg-dim)' }}>· {item.companyName}</span>
                  )}
                  <span style={{ color: 'var(--fg-dim)', marginLeft: 'auto', fontSize: 11 }}>
                    {'email' in item ? (item as { email: string }).email : ''}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 6 }}>
              {resolvedRecipients.length} Empfänger ausgewählt
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
            {saving ? 'Erstelle…' : `Kampagne erstellen (${resolvedRecipients.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
