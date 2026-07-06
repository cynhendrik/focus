import { useMemo, useState, useEffect } from 'react'
import { Inbox, UserPlus, ChevronRight, ChevronDown, EyeOff, Eye, AtSign, Ban } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useLeadsStore } from '@/store/leads.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { classifyMails, matchesIgnoredSender } from '@/lib/mail/newcomer'
import { log } from '@/lib/logger'
import type { EmailHeader, IgnoredSender } from '@/types/mail.types'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Gestern'
  if (diffDays < 7)  return d.toLocaleDateString('de-DE', { weekday: 'short' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

/** Rohes HTML grob in lesbaren Text wandeln — nur Fallback, wenn kein bodyText da ist. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function senderDomain(addr: string): string {
  const at = addr.indexOf('@')
  return at >= 0 ? addr.slice(at + 1).toLowerCase() : ''
}

// ── Read-only Lead-Zeile (bekannte Absender) ──────────────────────────────────

function LeadMailRow({ mail }: { mail: EmailHeader }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '10px 1fr auto',
      alignItems: 'center', gap: 12,
      padding: '11px 16px', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 99, flexShrink: 0,
        background: mail.isRead ? 'transparent' : 'var(--accent)',
        border: mail.isRead ? '1.5px solid var(--border-strong)' : 'none',
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: mail.isRead ? 500 : 700, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45%',
          }}>
            {mail.fromName || mail.fromAddr}
          </span>
          <span style={{
            fontSize: 12.5, color: mail.isRead ? 'var(--fg-muted)' : 'var(--fg)',
            fontWeight: mail.isRead ? 400 : 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {mail.subject || '(ohne Betreff)'}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
          {mail.fromAddr}
          <span style={{
            marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 6px',
            borderRadius: 99, background: 'rgba(59,109,244,0.12)', color: 'var(--accent-text)',
          }}>
            Lead
          </span>
        </span>
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
        {fmtDate(mail.sentAt)}
      </span>
    </div>
  )
}

// ── Unbekannte Absender — ausklappbar mit Inhalt + Lead-Formular ───────────────

function UnknownMailRow({ mail, expanded, onToggle, onCreateLead, onIgnore, selected, onToggleSelect }: {
  mail: EmailHeader
  expanded: boolean
  onToggle: () => void
  onCreateLead: (payload: { name: string; email: string; phone?: string }) => Promise<void>
  onIgnore: (pattern: string, scope: IgnoredSender['scope']) => void
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const [body, setBody]             = useState<string | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [name, setName]             = useState(mail.fromName || mail.fromAddr)
  const [phone, setPhone]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [ignoreMenuOpen, setIgnoreMenuOpen] = useState(false)

  const domain = senderDomain(mail.fromAddr)

  // Mailtext erst beim Aufklappen nachladen (mit IMAP-Fallback bei leerem Cache).
  useEffect(() => {
    if (!expanded || body !== null || bodyLoading) return
    let cancelled = false
    setBodyLoading(true)
    ;(async () => {
      try {
        let b = await MailService.getBody(mail.id)
        if (b && !b.bodyText && !b.bodyHtml) {
          try { b = await MailService.fetchBodyFromImap(mail.id) } catch { /* Cache bleibt */ }
        }
        const text = b?.bodyText?.trim() || (b?.bodyHtml ? stripHtml(b.bodyHtml) : '') || '(Kein Textinhalt)'
        if (!cancelled) setBody(text)
      } catch {
        if (!cancelled) setBody('(Inhalt konnte nicht geladen werden)')
      } finally {
        if (!cancelled) setBodyLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [expanded, mail.id, body, bodyLoading])

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      await onCreateLead({ name: name.trim(), email: mail.fromAddr, phone: phone.trim() || undefined })
      // Bei Erfolg matcht die Lead-E-Mail → Zeile wandert automatisch zu „Bekannte Leads".
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Fehler beim Anlegen')
      setSaving(false)
    }
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Header-Zeile */}
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '20px 16px 1fr auto auto auto',
          alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
          background: expanded ? 'var(--surface-2)' : 'transparent',
        }}
      >
        {onToggleSelect
          ? (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect()}
              onClick={e => e.stopPropagation()}
            />
          )
          : <span />}
        <span style={{ color: 'var(--fg-dim)', display: 'flex' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontSize: 13, fontWeight: mail.isRead ? 500 : 700, color: 'var(--fg)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45%',
            }}>
              {mail.fromName || mail.fromAddr}
            </span>
            <span style={{
              fontSize: 12.5, color: mail.isRead ? 'var(--fg-muted)' : 'var(--fg)',
              fontWeight: mail.isRead ? 400 : 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {mail.subject || '(ohne Betreff)'}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {mail.fromAddr}
          </span>
        </div>

        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
          {fmtDate(mail.sentAt)}
        </span>

        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setIgnoreMenuOpen(v => !v) }}
            title="Kein Lead — Absender dauerhaft ignorieren"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: ignoreMenuOpen ? 'var(--surface-2)' : 'transparent',
              color: 'var(--fg-dim)', fontFamily: 'inherit',
            }}
          >
            <EyeOff size={11} /> Kein Lead
          </button>

          {ignoreMenuOpen && (
            <>
              {/* Unsichtbarer Backdrop zum Schließen */}
              <div
                onClick={e => { e.stopPropagation(); setIgnoreMenuOpen(false) }}
                style={{ position: 'fixed', inset: 0, zIndex: 10 }}
              />
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 11,
                minWidth: 230, borderRadius: 9, overflow: 'hidden',
                background: 'var(--surface)', border: '1px solid var(--border-strong)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              }}>
                <button
                  onClick={e => { e.stopPropagation(); setIgnoreMenuOpen(false); onIgnore(mail.fromAddr, 'address') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: 'transparent', color: 'var(--fg)', fontFamily: 'inherit',
                  }}
                >
                  <AtSign size={12} style={{ flexShrink: 0, color: 'var(--fg-dim)' }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Absender ignorieren</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mail.fromAddr}
                    </span>
                  </span>
                </button>
                {domain && (
                  <button
                    onClick={e => { e.stopPropagation(); setIgnoreMenuOpen(false); onIgnore(domain, 'domain') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '9px 12px', border: 'none', borderTop: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                      background: 'transparent', color: 'var(--fg)', fontFamily: 'inherit',
                    }}
                  >
                    <Ban size={12} style={{ flexShrink: 0, color: 'var(--fg-dim)' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Ganze Domain ignorieren</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
                        @{domain}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={e => { e.stopPropagation(); if (!expanded) onToggle(); setShowForm(true) }}
          title="Als Lead anlegen"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
            border: '1px solid var(--border)', cursor: 'pointer',
            background: 'var(--surface-2)', color: 'var(--fg-muted)', fontFamily: 'inherit',
          }}
        >
          <UserPlus size={11} /> Lead
        </button>
      </div>

      {/* Ausgeklappter Bereich */}
      {expanded && (
        <div style={{ padding: '4px 16px 16px 44px', background: 'var(--surface-2)' }}>
          {/* Mailtext */}
          <div style={{
            fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap',
            userSelect: 'text', maxHeight: 220, overflowY: 'auto',
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)', lineHeight: 1.5,
          }}>
            {bodyLoading ? 'Lade Inhalt…' : body}
          </div>

          {/* Lead-Formular */}
          {showForm ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-dim)' }}>Name</label>
                <input className="mock-input" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 12 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-dim)' }}>E-Mail</label>
                <input className="mock-input" value={mail.fromAddr} readOnly disabled style={{ fontSize: 12, opacity: 0.7 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-dim)' }}>Telefon (aus Mail kopieren)</label>
                <input
                  className="mock-input" type="tel" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+49 151 1234567" autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={{ fontSize: 12 }}
                />
              </div>
              {saveError && <div style={{ fontSize: 11, color: '#f87171' }}>{saveError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button className="btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving} style={{ fontSize: 12, padding: '6px 12px' }}>
                  {saving ? 'Anlegen…' : 'Lead anlegen'}
                </button>
                <button className="btn-ghost" onClick={() => setShowForm(false)} disabled={saving} style={{ fontSize: 12, padding: '6px 10px' }}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary"
              style={{ marginTop: 12, fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <UserPlus size={12} /> Lead anlegen →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      padding: '10px 16px 8px', display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: '1px solid var(--border)', background: 'var(--bg-2)',
      position: 'sticky', top: 0, zIndex: 1,
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)' }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 7px',
        borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: 'var(--fg-dim)',
      }}>
        {count}
      </span>
    </div>
  )
}

export function LeverageMailRoute() {
  const emails             = useMailStore(s => s.emails)
  const setNotALead        = useMailStore(s => s.setNotALead)
  const ignoredSenders     = useMailStore(s => s.ignoredSenders)
  const loadIgnoredSenders = useMailStore(s => s.loadIgnoredSenders)
  const ignoreSender       = useMailStore(s => s.ignoreSender)
  const unignoreSender     = useMailStore(s => s.unignoreSender)
  const leads       = useLeadsStore(s => s.leads)
  const upsert      = useLeadsStore(s => s.upsert)
  const stages      = useLeadStagesStore(s => s.stages)
  const customers   = useCustomersStore(s => s.customers)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAutoSorted, setShowAutoSorted] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCreating, setBulkCreating] = useState(false)
  const showToast = useToastStore(s => s.show)

  useEffect(() => { loadIgnoredSenders() }, [loadIgnoredSenders])

  const openStages = useMemo(
    () => stages.filter(s => !s.isQualified && !s.isDisqualified),
    [stages],
  )

  const leadEmailSet = useMemo(
    () => new Set(leads.flatMap(l => l.email ? [l.email.toLowerCase()] : [])),
    [leads],
  )
  // Mails bestehender Kunden sind keine Newcomer — sie gehören ins CRM.
  const customerEmailSet = useMemo(
    () => new Set(customers.flatMap(c => c.email ? [c.email.toLowerCase()] : [])),
    [customers],
  )

  const { leadMails, candidates, autoSorted, hidden } = useMemo(
    () => classifyMails(emails, leadEmailSet, customerEmailSet),
    [emails, leadEmailSet, customerEmailSet],
  )

  // Einzeln ausgeblendete Mails (Alt-Flags ohne Ignorier-Eintrag) — Mails
  // ignorierter Absender werden über die Einträge selbst verwaltet.
  const hiddenSingles = useMemo(
    () => hidden.filter(m => !matchesIgnoredSender(m.fromAddr, ignoredSenders)),
    [hidden, ignoredSenders],
  )

  const handleCreateLead = async (payload: { name: string; email: string; phone?: string }) => {
    await upsert({
      workspaceId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      leadSource: 'inbox',
      leadStatus: openStages[0]?.name || 'neu',
    })
  }

  const handleIgnore = (pattern: string, scope: IgnoredSender['scope']) => {
    ignoreSender(pattern, scope).catch(err => log.error('Failed to ignore sender', { err }))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    const ids = candidates.map(m => m.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (allSelected) { ids.forEach(id => n.delete(id)) }
      else { ids.forEach(id => n.add(id)) }
      return n
    })
  }

  async function handleBulkCreateLeads() {
    const targets = candidates.filter(m => selectedIds.has(m.id))
    if (targets.length === 0) return
    setBulkCreating(true)
    const results = await Promise.allSettled(
      targets.map(m => handleCreateLead({ name: m.fromName || m.fromAddr, email: m.fromAddr })),
    )
    const succeededIds = targets
      .filter((_, i) => results[i].status === 'fulfilled')
      .map(m => m.id)
    const failedCount = results.length - succeededIds.length
    setSelectedIds(prev => {
      const next = new Set(prev)
      succeededIds.forEach(id => next.delete(id))
      return next
    })
    setBulkCreating(false)
    showToast({
      message: failedCount === 0
        ? `${succeededIds.length} Lead${succeededIds.length === 1 ? '' : 's'} angelegt.`
        : `${succeededIds.length} von ${targets.length} Leads angelegt, ${failedCount} fehlgeschlagen.`,
      variant: failedCount === 0 ? 'success' : 'error',
    })
  }

  const totalCount = leadMails.length + candidates.length

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>

      <div className="greeting" style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
        <h1 className="greeting-title">Newcomer<em>.</em></h1>
        <div className="greeting-sub">
          <span>
            {candidates.length} mögliche Leads
            {autoSorted.length > 0 && ` · ${autoSorted.length} automatisch aussortiert`}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, borderTop: '1px solid var(--border)' }}>

        {candidates.length > 0 && (
          <>
            <SectionHeader label="Unbekannte Absender — mögliche Leads" count={candidates.length} />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '6px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)',
              }}>
                <input
                  type="checkbox"
                  checked={candidates.length > 0 && candidates.every(m => selectedIds.has(m.id))}
                  onChange={toggleAll}
                />
                Alle auswählen ({candidates.length})
              </label>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkCreateLeads}
                  disabled={bulkCreating}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    border: '1px solid var(--accent)', cursor: bulkCreating ? 'default' : 'pointer',
                    background: 'var(--accent-soft)', color: 'var(--accent-text)',
                    fontFamily: 'inherit', opacity: bulkCreating ? 0.6 : 1,
                  }}
                >
                  {bulkCreating ? 'Wird angelegt…' : `${selectedIds.size} Lead${selectedIds.size === 1 ? '' : 's'} anlegen`}
                </button>
              )}
            </div>
            {candidates.map(m => (
              <UnknownMailRow
                key={m.id}
                mail={m}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(id => id === m.id ? null : m.id)}
                onCreateLead={handleCreateLead}
                onIgnore={handleIgnore}
                selected={selectedIds.has(m.id)}
                onToggleSelect={() => toggleSelect(m.id)}
              />
            ))}
          </>
        )}

        {leadMails.length > 0 && (
          <>
            <SectionHeader label="Bekannte Leads" count={leadMails.length} />
            {leadMails.map(m => (
              <LeadMailRow key={m.id} mail={m} />
            ))}
          </>
        )}

        {/* Automatisch aussortiert: noreply-, Newsletter- und System-Absender.
            Falls die Heuristik danebenliegt, geht „Lead anlegen" auch hier. */}
        {autoSorted.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setShowAutoSorted(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', background: 'transparent', border: 'none',
                cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {showAutoSorted ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Ban size={12} />
              {autoSorted.length} automatisch aussortiert (Newsletter & System-Mails)
            </button>
            {showAutoSorted && autoSorted.map(m => (
              <UnknownMailRow
                key={m.id}
                mail={m}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(id => id === m.id ? null : m.id)}
                onCreateLead={handleCreateLead}
                onIgnore={handleIgnore}
              />
            ))}
          </div>
        )}

        {(ignoredSenders.length > 0 || hiddenSingles.length > 0) && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setShowHidden(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', background: 'transparent', border: 'none',
                cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {showHidden ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <EyeOff size={12} />
              Ignoriert & ausgeblendet
              {' '}({ignoredSenders.length > 0 ? `${ignoredSenders.length} Absender` : ''}
              {ignoredSenders.length > 0 && hiddenSingles.length > 0 ? ' · ' : ''}
              {hiddenSingles.length > 0 ? `${hiddenSingles.length} Mails` : ''})
            </button>

            {showHidden && (
              <>
                {/* Ignorierte Absender — Verwaltung */}
                {ignoredSenders.map(entry => (
                  <div key={entry.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto',
                    alignItems: 'center', gap: 12, padding: '9px 16px 9px 36px',
                    borderTop: '1px solid var(--border)', opacity: 0.8,
                  }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.scope === 'domain' ? `@${entry.pattern}` : entry.pattern}
                      </span>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {entry.scope === 'domain' ? 'Domain' : 'Absender'}
                      </span>
                    </div>
                    <button
                      onClick={() => { unignoreSender(entry.id).catch(err => log.error('Failed to unignore sender', { err })) }}
                      title="Ignorieren aufheben — Mails erscheinen wieder als Newcomer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 9px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                        border: '1px solid var(--border)', cursor: 'pointer',
                        background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit',
                      }}
                    >
                      <Eye size={11} /> Aufheben
                    </button>
                  </div>
                ))}

                {/* Einzeln ausgeblendete Mails (alte „kein Lead"-Klicks) */}
                {hiddenSingles.map(m => (
                  <div key={m.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto',
                    alignItems: 'center', gap: 12, padding: '9px 16px 9px 36px',
                    borderTop: '1px solid var(--border)', opacity: 0.7,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mailLabel(m)}
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{m.fromAddr}</div>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                      {fmtDate(m.sentAt)}
                    </span>
                    <button
                      onClick={() => setNotALead(m.id, false)}
                      title="Wieder als möglichen Lead einblenden"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 9px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                        border: '1px solid var(--border)', cursor: 'pointer',
                        background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit',
                      }}
                    >
                      <Eye size={11} /> Einblenden
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {totalCount === 0 && autoSorted.length === 0 && ignoredSenders.length === 0 && hiddenSingles.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '50%', gap: 12, color: 'var(--fg-dim)',
          }}>
            <Inbox size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 13 }}>Keine Mails</span>
          </div>
        )}

      </div>
    </div>
  )
}

function mailLabel(m: EmailHeader): string {
  const who = m.fromName || m.fromAddr
  return m.subject ? `${who} · ${m.subject}` : who
}
