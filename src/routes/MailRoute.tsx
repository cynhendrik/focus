import { useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  Reply, Forward, Plus, ListTodo, Trash2, Paperclip,
  ChevronDown, Mail, Search, Send, Flag, FileText,
  Archive, ShieldAlert, Inbox, Star, MoreHorizontal,
} from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useToastStore } from '@/store/toast.store'
import { ComposeModal } from '@/components/mail/ComposeModal'
import { CampaignsTab }        from '@/components/mail/CampaignsTab'
import { CampaignDetail }      from '@/components/mail/CampaignDetail'
import { CreateCampaignModal } from '@/components/mail/CreateCampaignModal'
import { useCampaignStore }    from '@/store/campaign.store'
import { useUiStore }          from '@/store/ui.store'
import type { SyncProgress } from '@/types/mail.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
}

const AVATAR_COLORS: [string, string][] = [
  ['#dbeafe','#2563eb'], ['#fce7f3','#be185d'], ['#d1fae5','#059669'],
  ['#fef3c7','#d97706'], ['#ede9fe','#7c3aed'], ['#fee2e2','#dc2626'],
  ['#e0f2fe','#0284c7'], ['#fdf4ff','#9333ea'], ['#fff7ed','#c2410c'],
  ['#f0fdf4','#16a34a'],
]
function avatarColor(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso); const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'Gestern'
  if (Date.now() - d.getTime() < 6 * 86400000)
    return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()]
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function formatLastFetched(ts: number) {
  if (!ts) return ''
  const min = Math.floor((Date.now() - ts) / 60_000)
  if (min < 1) return 'gerade eben'
  if (min === 1) return 'vor 1 Min.'
  return `vor ${min} Min.`
}

function folderIcon(path: string) {
  const p = path.toLowerCase()
  if (p === 'inbox' || p === 'posteingang') return <Inbox size={15} />
  if (p.includes('sent') || p.includes('gesend')) return <Send size={15} />
  if (p.includes('draft') || p.includes('entwurf')) return <FileText size={15} />
  if (p.includes('trash') || p.includes('papierkorb') || p.includes('deleted')) return <Trash2 size={15} />
  if (p.includes('spam') || p.includes('junk')) return <ShieldAlert size={15} />
  if (p.includes('archiv') || p.includes('archive')) return <Archive size={15} />
  if (p.includes('flagged') || p.includes('markiert') || p.includes('starred')) return <Flag size={15} />
  return <Mail size={15} />
}

function folderLabel(path: string): string {
  const map: Record<string, string> = {
    'inbox': 'Posteingang', 'sent': 'Gesendet', 'sent messages': 'Gesendet',
    'drafts': 'Entwürfe', 'draft': 'Entwürfe', 'trash': 'Papierkorb',
    'deleted messages': 'Papierkorb', 'spam': 'Spam', 'junk': 'Spam',
    'junk e-mail': 'Spam', 'archive': 'Archiv', 'archiv': 'Archiv',
    'flagged': 'Markiert', 'starred': 'Markiert',
  }
  return map[path.toLowerCase()] ?? path.split('/').pop() ?? path
}

function isSystemFolder(f: { path: string; flags: string[] }): boolean {
  const p = f.path.toLowerCase()
  const last = p.split('/').pop()?.split('.').pop() ?? p
  const SYSTEM_NAMES = ['inbox','sent','sent messages','drafts','draft','trash',
    'deleted messages','deleted','spam','junk','junk e-mail','archive','archiv']
  if (p === 'inbox' || SYSTEM_NAMES.includes(last)) return true
  const flagsLc = f.flags.map(fl => fl.toLowerCase())
  return flagsLc.some(fl => ['\\sent','\\drafts','\\trash','\\junk','\\all','\\archive'].includes(fl))
}

// ── Email HTML normalizer ─────────────────────────────────────────────────────

function normalizeEmailHtml(html: string, dark: boolean): string {
  // Strip inline color / background props so our stylesheet wins
  let out = html
    .replace(/style="([^"]*)"/gi, (_m, styles: string) => {
      const cleaned = styles.split(';').filter(s => {
        const prop = s.split(':')[0].trim().toLowerCase()
        return !['color','background','background-color','background-image','font-color','border-color'].includes(prop)
      }).join(';').trim().replace(/;+$/, '')
      return cleaned ? `style="${cleaned}"` : ''
    })
    .replace(/\s(bgcolor|text|color)="[^"]*"/gi, '')
    .replace(/\s(bgcolor|text|color)='[^']*'/gi, '')

  const fg      = dark ? '#d4d4d8' : '#18181b'
  const bg      = dark ? '#1e1e24' : '#ffffff'
  const fgMuted = dark ? '#a1a1aa' : '#52525b'
  const link    = dark ? '#7dd3fc' : '#2563eb'
  const border  = dark ? '#3f3f46' : '#e4e4e7'

  const css = `<style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:16px;background:${bg}!important;color:${fg}!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.6}
    *{color:${fg}!important;background-color:transparent!important;border-color:${border}!important}
    a,a *{color:${link}!important}
    img{max-width:100%;height:auto;opacity:${dark ? 0.9 : 1}}
    table{border-collapse:collapse;width:100%}
    td,th{padding:6px 8px;vertical-align:top}
    p,div,span,li,td,th,h1,h2,h3,h4{color:${fg}!important}
    small,.muted{color:${fgMuted}!important}
    hr{border-color:${border}!important}
  </style>`

  return out.includes('</head>')
    ? out.replace('</head>', css + '</head>')
    : css + out
}

type MailFilter = 'all' | 'unread' | 'marked'
type MailTab = 'inbox' | 'campaigns'

// ── Avatar ────────────────────────────────────────────────────────────────────

function MailAvatar({ name, size = 38 }: { name: string; size?: number }) {
  const [bg, fg] = avatarColor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 700, letterSpacing: '-0.01em',
    }}>
      {initials(name)}
    </div>
  )
}

// ── Account Setup Form ────────────────────────────────────────────────────────

function AccountSetupForm({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
  const addAccount = useMailStore(s => s.addAccount)
  const [form, setForm] = useState({ email: '', password: '', displayName: '', imapHost: '', imapPort: '993' })
  const [smtpForm, setSmtpForm] = useState({ smtpHost: '', smtpPort: '587', smtpStarttls: true })
  const [showSmtpFields, setShowSmtpFields] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  const handleAdd = async () => {
    if (!form.email || !form.password || !form.imapHost) { setError('E-Mail, Passwort und IMAP-Host sind Pflichtfelder'); return }
    setTesting(true); setError('')
    try {
      await addAccount({ ...form, imapPort: parseInt(form.imapPort) || 993, ...(showSmtpFields ? { smtpHost: smtpForm.smtpHost, smtpPort: parseInt(smtpForm.smtpPort) || 587, smtpStarttls: smtpForm.smtpStarttls } : {}) })
      onAdd()
    } catch (e) {
      const err = String(e)
      if (err.startsWith('SMTP_AUTODETECT_FAILED:')) {
        try { const p = JSON.parse(err.slice('SMTP_AUTODETECT_FAILED:'.length)) as { smtpHost?: string; smtpPort?: number }; if (p?.smtpHost) setSmtpForm(prev => ({ ...prev, smtpHost: p.smtpHost!, smtpPort: String(p.smtpPort ?? 587) })) } catch { /* ignore */ }
        setShowSmtpFields(true); setError('SMTP konnte nicht automatisch erkannt werden.')
      } else { setError(err) }
    } finally { setTesting(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mail size={16} style={{ color: 'var(--fg-muted)' }} />
        </div>
        <div><div style={{ fontSize: 14, fontWeight: 600 }}>Konto verbinden</div><div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>IMAP / SMTP</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {([['1/-1','E-Mail *','email','name@domain.de'],['1/-1','Passwort *','password',''],['1/-1','Anzeigename','displayName','Max Mustermann'],['1','IMAP-Host *','imapHost','imap.ionos.de'],['2','Port','imapPort','993']] as const).map(([col, label, key, ph]) => (
          <div key={key} style={{ gridColumn: col }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</label>
            <input type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="mock-input" style={{ width: '100%' }} placeholder={ph} />
          </div>
        ))}
      </div>
      {showSmtpFields && (
        <div style={{ padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>SMTP</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'flex-end' }}>
            <div><label style={{ display: 'block', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>Host</label><input type="text" value={smtpForm.smtpHost} onChange={e => setSmtpForm(f => ({ ...f, smtpHost: e.target.value }))} className="mock-input" style={{ width: '100%' }} placeholder="smtp.ionos.de" /></div>
            <div><label style={{ display: 'block', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>Port</label><input type="text" value={smtpForm.smtpPort} onChange={e => setSmtpForm(f => ({ ...f, smtpPort: e.target.value }))} className="mock-input" style={{ width: '100%' }} /></div>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 6, cursor: 'pointer' }}><span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>TLS</span><input type="checkbox" checked={smtpForm.smtpStarttls} onChange={e => setSmtpForm(f => ({ ...f, smtpStarttls: e.target.checked }))} /></label>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', background: 'oklch(from var(--danger) l c h / 0.08)', padding: '8px 12px', borderRadius: 'var(--radius-xs)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="btn-ghost" style={{ fontSize: 12 }}>Abbrechen</button>
        <button onClick={handleAdd} disabled={testing} className="btn-primary" style={{ fontSize: 12 }}>{testing ? 'Verbinde…' : 'Verbinden'}</button>
      </div>
    </div>
  )
}

// ── MailRoute ─────────────────────────────────────────────────────────────────

export function MailRoute() {
  const accounts            = useMailStore(s => s.accounts)
  const selectedAccountId   = useMailStore(s => s.selectedAccountId)
  const selectedFolder      = useMailStore(s => s.selectedFolder)
  const emails              = useMailStore(s => s.emails)
  const selectedEmail       = useMailStore(s => s.selectedEmail)
  const emailBody           = useMailStore(s => s.emailBody)
  const attachments         = useMailStore(s => s.attachments)
  const search              = useMailStore(s => s.search)
  const syncProgress        = useMailStore(s => s.syncProgress)
  const isSyncing           = useMailStore(s => s.isSyncing)
  const isLoading           = useMailStore(s => s.isLoading)
  const folders             = useMailStore(s => s.folders)
  const foldersLastFetched  = useMailStore(s => s.foldersLastFetched)
  const isFolderLoading     = useMailStore(s => s.isFolderLoading)
  const loadAccounts        = useMailStore(s => s.loadAccounts)
  const selectAccount       = useMailStore(s => s.selectAccount)
  const selectFolder        = useMailStore(s => s.selectFolder)
  const selectEmail         = useMailStore(s => s.selectEmail)
  const setSearch           = useMailStore(s => s.setSearch)
  const sync                = useMailStore(s => s.sync)
  const setSyncProgress     = useMailStore(s => s.setSyncProgress)
  const assignCustomer      = useMailStore(s => s.assignCustomer)
  const deleteEmail         = useMailStore(s => s.deleteEmail)
  const downloadAttachment  = useMailStore(s => s.downloadAttachment)
  const loadFolders         = useMailStore(s => s.loadFolders)
  const loadEmails          = useMailStore(s => s.loadEmails)
  const createFolder    = useMailStore(s => s.createFolder)
  const deleteFolder    = useMailStore(s => s.deleteFolder)
  const moveToFolder    = useMailStore(s => s.moveToFolder)

  const theme     = useUiStore(s => s.theme)
  const customers = useCustomersStore(s => s.customers)
  const [showSetup,       setShowSetup]       = useState(false)
  const [showCompose,     setShowCompose]     = useState(false)
  const [composeMode,     setComposeMode]     = useState<'new' | 'reply' | 'forward'>('new')
  const [mailTab,         setMailTab]         = useState<MailTab>('inbox')
  const [mailFilter,      setMailFilter]      = useState<MailFilter>('all')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const setActiveCampaign = useCampaignStore(s => s.setActive)
  const activeCampaignId  = useCampaignStore(s => s.activeCampaignId)

  const upsertTodo = useTodosStore(s => s.upsert)
  const showToast  = useToastStore(s => s.show)
  const [showTodoPicker, setShowTodoPicker] = useState(false)
  const todoPickerRef = useRef<HTMLDivElement>(null)
  const [dragOverFolder,    setDragOverFolder]    = useState<string | null>(null)
  const [isCreatingFolder,  setIsCreatingFolder]  = useState(false)
  const [newFolderName,     setNewFolderName]      = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showTodoPicker) return
    const h = (e: MouseEvent) => { if (todoPickerRef.current && !todoPickerRef.current.contains(e.target as Node)) setShowTodoPicker(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showTodoPicker])

  const createMailTodo = async (when: 'today' | 'tomorrow' | 'in3days') => {
    if (!selectedEmail) return; setShowTodoPicker(false)
    const today = new Date()
    const d = when === 'today' ? today : when === 'tomorrow' ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 9, 0) : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 9, 0)
    try {
      await upsertTodo({ title: `${selectedEmail.subject ?? '(Mail)'} beantworten`, customerId: selectedEmail.customerId ?? undefined, priority: 'p2', bucket: d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10) ? 'today' : 'backlog', scheduledAt: d.toISOString(), actionType: 'reply_mail', source: 'manual', sourceRef: selectedEmail.id, notes: '', checklist: [], tags: [] })
      showToast({ message: 'Mail als Aufgabe angelegt.', variant: 'success' })
    } catch { showToast({ message: 'Fehler.', variant: 'error' }) }
  }

  const { customerEmailAddresses, customerEmailDomains } = useMemo(() => {
    const PUBLIC = new Set(['gmail.com','googlemail.com','gmx.de','gmx.net','web.de','t-online.de','yahoo.com','hotmail.com','outlook.com','icloud.com','protonmail.com','proton.me'])
    const addresses = new Set<string>(); const domains = new Set<string>()
    for (const c of customers) {
      if (!c.email) continue; const email = c.email.trim().toLowerCase(); addresses.add(email)
      const at = email.lastIndexOf('@'); if (at !== -1) { const d = email.slice(at + 1); if (d && !PUBLIC.has(d)) domains.add(d) }
    }
    return { customerEmailAddresses: addresses, customerEmailDomains: domains }
  }, [customers])

  const isCustomer = (addr: string) => {
    const a = addr.trim().toLowerCase(); if (customerEmailAddresses.has(a)) return true
    const at = a.lastIndexOf('@'); return at !== -1 && customerEmailDomains.has(a.slice(at + 1))
  }

  const filteredEmails = useMemo(() => {
    let list = emails
    if (mailFilter === 'unread') list = list.filter(e => !e.isRead)
    // 'marked' = with customer tag (closest equivalent)
    if (mailFilter === 'marked') list = list.filter(e => e.customerId || (e.fromAddr && isCustomer(e.fromAddr)))
    return list
  }, [emails, mailFilter, customerEmailAddresses, customerEmailDomains])

  const unreadCount  = useMemo(() => emails.filter(e => !e.isRead).length, [emails])
  const markedCount  = useMemo(() => emails.filter(e => e.customerId || (e.fromAddr && isCustomer(e.fromAddr))).length, [emails, customerEmailAddresses, customerEmailDomains])

  // Flat folder lists split into system and custom
  const { systemFolders, customFolders } = useMemo(() => {
    const flat: typeof folders = []
    const seen = new Set<string>()
    function flatten(list: typeof folders) {
      for (const f of list) {
        if (!seen.has(f.path)) { seen.add(f.path); flat.push(f) }
        if (f.children?.length) flatten(f.children)
      }
    }
    flatten(folders)
    return {
      systemFolders: flat.filter(f => isSystemFolder(f)),
      customFolders: flat.filter(f => !isSystemFolder(f) && f.isSelectable),
    }
  }, [folders])

  useEffect(() => { loadAccounts(); const u = listen<SyncProgress>('email-sync-progress', e => setSyncProgress(e.payload)); return () => { u.then(fn => fn()) } }, [])
  useEffect(() => { if (!selectedAccountId) return; loadFolders(selectedAccountId); const t = setInterval(() => loadFolders(selectedAccountId), 15 * 60 * 1000); return () => clearInterval(t) }, [selectedAccountId])
  useEffect(() => { if (!selectedAccountId) return; const t = setTimeout(() => loadEmails(), 300); return () => clearTimeout(t) }, [search])

  const handleSync = () => sync(JSON.stringify(customers.map(c => ({ id: c.id, email: c.email ?? null }))))

  const TABS: { id: MailTab; label: string }[] = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'campaigns', label: 'Kampagnen' },
  ]

  const activeAccount = accounts.find(a => a.id === selectedAccountId)
  const currentFolderLabel = selectedFolder === 'UNASSIGNED' ? 'Nicht zugeordnet' : folderLabel(selectedFolder ?? 'INBOX')

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (accounts.length === 0 && !showSetup) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0 }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={26} style={{ color: 'var(--fg-dim)' }} />
          </div>
          <div><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Kein E-Mail-Konto</div><div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Verbinde dein erstes Konto um loszulegen.</div></div>
          <button onClick={() => setShowSetup(true)} className="btn-primary">Konto hinzufügen</button>
        </div>
        {showSetup && (
          <div style={{ position: 'fixed', inset: 0, background: 'oklch(0% 0 0 / 0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) setShowSetup(false) }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, width: 440, maxWidth: '94vw', boxShadow: 'var(--shadow-2)' }}>
              <AccountSetupForm onAdd={() => { setShowSetup(false); loadAccounts() }} onCancel={() => setShowSetup(false)} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 48px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
        {TABS.map(t => {
          const active = mailTab === t.id
          return (
            <button key={t.id} onClick={() => { setMailTab(t.id); setActiveCampaign(null) }}
              style={{ display: 'flex', alignItems: 'center', padding: '18px 18px 16px', marginRight: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: active ? 'var(--fg)' : 'var(--fg-dim)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 600 : 500, letterSpacing: '-0.01em', position: 'relative', transition: 'color 140ms' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-dim)' }}>
              {t.label}
              {active && <span style={{ position: 'absolute', left: 18, right: 18, bottom: -1, height: 2, borderRadius: 2, background: 'oklch(92% 0.2 245)', boxShadow: '0 0 12px oklch(92% 0.2 245 / 0.5)' }} />}
            </button>
          )
        })}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {mailTab === 'inbox' ? (
          <>
            {/* ── SIDEBAR ─────────────────────────────────────────────── */}
            <div style={{ width: 228, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRight: '1px solid var(--border)' }}>

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 8px 0' }}>
                {/* POSTFÄCHER label */}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 10px 8px' }}>Postfächer</div>

                {/* Folders */}
                {isFolderLoading && folders.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '6px 10px' }}>Lädt…</div>
                )}
                {systemFolders.map(f => {
                  const active = selectedFolder === f.path
                  const label = folderLabel(f.path)
                  // Count unread in this folder (approximate — filter by folder path)
                  const count = emails.filter(e => !e.isRead && e.folder === f.path).length
                  return (
                    <button key={f.path} onClick={() => selectFolder(f.path)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: active ? '#dbeafe' : 'transparent', color: active ? '#1d4ed8' : 'var(--fg-2)', fontSize: 13.5, fontWeight: active ? 600 : 400, transition: 'background 100ms' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'oklch(100% 0 0 / 0.05)' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                      <span style={{ color: active ? '#1d4ed8' : 'var(--fg-dim)', flexShrink: 0 }}>{folderIcon(f.path)}</span>
                      <span style={{ flex: 1 }}>{label}</span>
                      {count > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 99, background: active ? '#1d4ed8' : 'var(--surface-3)', color: active ? '#fff' : 'var(--fg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', fontFamily: 'var(--font-mono)' }}>{count}</span>
                      )}
                    </button>
                  )
                })}

                {/* Separator + ORDNER */}
                <div style={{ height: 1, background: 'var(--border)', margin: '10px 8px' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 10px 8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ordner</span>
                  <button
                    onClick={() => { setIsCreatingFolder(true); setTimeout(() => newFolderInputRef.current?.focus(), 50) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', padding: 2 }}
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Inline-Eingabe neuer Ordner */}
                {isCreatingFolder && (
                  <div style={{ padding: '4px 10px 6px' }}>
                    <input
                      ref={newFolderInputRef}
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && newFolderName.trim()) {
                          try {
                            await createFolder(newFolderName.trim(), 'INBOX')
                            setNewFolderName(''); setIsCreatingFolder(false)
                          } catch (err) {
                            showToast({ message: String(err), variant: 'error' })
                          }
                        }
                        if (e.key === 'Escape') { setNewFolderName(''); setIsCreatingFolder(false) }
                      }}
                      onBlur={() => { if (!newFolderName.trim()) setIsCreatingFolder(false) }}
                      placeholder="Ordnername…"
                      style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                )}

                {/* Custom-Ordner-Liste */}
                {customFolders.map(f => {
                  const active = selectedFolder === f.path
                  const isDragTarget = dragOverFolder === f.path
                  return (
                    <div
                      key={f.path}
                      style={{ position: 'relative' }}
                      onDragOver={e => { e.preventDefault(); setDragOverFolder(f.path) }}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={async e => {
                        e.preventDefault()
                        const emailId = e.dataTransfer.getData('emailId')
                        if (emailId) {
                          try { await moveToFolder(emailId, f.path) } catch (err) {
                            showToast({ message: String(err), variant: 'error' })
                          }
                        }
                        setDragOverFolder(null)
                      }}
                    >
                      <button
                        onClick={() => selectFolder(f.path)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '7px 10px', borderRadius: 8, border: isDragTarget ? '1px dashed var(--accent)' : 'none',
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                          background: active ? '#dbeafe' : isDragTarget ? 'oklch(60% 0.15 250 / 0.12)' : 'transparent',
                          color: active ? '#1d4ed8' : 'var(--fg-2)', fontSize: 13.5,
                          fontWeight: active ? 600 : 400, transition: 'background 100ms',
                        }}
                        onMouseEnter={e => {
                          if (!active) e.currentTarget.style.background = 'oklch(100% 0 0 / 0.05)'
                          const del = e.currentTarget.querySelector<HTMLElement>('.folder-del')
                          if (del) del.style.opacity = '1'
                        }}
                        onMouseLeave={e => {
                          if (!active && dragOverFolder !== f.path) e.currentTarget.style.background = 'transparent'
                          const del = e.currentTarget.querySelector<HTMLElement>('.folder-del')
                          if (del) del.style.opacity = '0'
                        }}
                      >
                        <Mail size={15} style={{ color: active ? '#1d4ed8' : 'var(--fg-dim)', flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.displayName}</span>
                        <span
                          className="folder-del"
                          style={{ opacity: 0, transition: 'opacity 120ms', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', padding: '1px 2px', borderRadius: 4 }}
                          onClick={async e => {
                            e.stopPropagation()
                            if (!confirm(`Ordner "${f.displayName}" wirklich löschen?`)) return
                            try { await deleteFolder(f.path) } catch (err) { alert(String(err)) }
                          }}
                        >
                          <Trash2 size={12} />
                        </span>
                      </button>
                    </div>
                  )
                })}

                {/* Add account */}
                <div style={{ height: 1, background: 'var(--border)', margin: '10px 8px' }} />
                <button onClick={() => setShowSetup(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 13, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, width: '100%', fontFamily: 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-dim)' }}>
                  <Plus size={14} /> Konto hinzufügen
                </button>
              </div>

              {/* Storage / Sync footer */}
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Speicher</span>
                  <button onClick={handleSync} disabled={isSyncing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{activeAccount?.email?.split('@')[1] ?? ''}</span>
                  </button>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ height: '100%', width: isSyncing && syncProgress?.total ? `${(syncProgress.done / syncProgress.total) * 100}%` : '40%', background: 'oklch(92% 0.2 245)', borderRadius: 99, transition: 'width 300ms' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                  {isSyncing ? 'Synchronisiert…' : foldersLastFetched > 0 ? `Synchronisiert · ${formatLastFetched(foldersLastFetched)}` : 'Bereit'}
                </div>
              </div>
            </div>

            {/* ── EMAIL LIST ───────────────────────────────────────────── */}
            <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRight: '1px solid var(--border)', minHeight: 0 }}>

              {/* List header */}
              <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.035em' }}>{currentFolderLabel}</h2>
                    <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontWeight: 400 }}>{filteredEmails.length} Nachrichten</span>
                  </div>
                  <button onClick={() => { setComposeMode('new'); setShowCompose(true) }} className="btn-primary" style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={13} /> Neue Mail
                  </button>
                </div>

                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', marginBottom: 14 }}>
                  <Search size={14} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="In Mails suchen…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13.5, color: 'var(--fg)', fontFamily: 'inherit' }} />
                </div>

                {/* Filter chips */}
                <div style={{ display: 'flex', gap: 4, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                  {([
                    { id: 'all', label: 'Alle' },
                    { id: 'unread', label: unreadCount > 0 ? `Ungelesen ${unreadCount}` : 'Ungelesen' },
                    { id: 'marked', label: markedCount > 0 ? `Markiert ${markedCount}` : 'Markiert' },
                  ] as const).map(f => {
                    const active = mailFilter === f.id
                    return (
                      <button key={f.id} onClick={() => setMailFilter(f.id)} style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: active ? 700 : 500, border: 'none', background: active ? 'var(--surface-3)' : 'transparent', color: active ? 'var(--fg)' : 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: active ? '0.01em' : '0', transition: 'all 120ms' }}>
                        {f.label.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Rows */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {isLoading && <div style={{ padding: 28, fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>Lädt…</div>}
                {!isLoading && filteredEmails.length === 0 && <div style={{ padding: 40, fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>Keine E-Mails</div>}

                {filteredEmails.map((email, i) => {
                  const sender  = email.fromName || email.fromAddr || '?'
                  const cust    = email.customerId ? customers.find(c => c.id === email.customerId) : null
                  const isKunde = cust || (email.fromAddr && isCustomer(email.fromAddr))
                  const active  = selectedEmail?.id === email.id

                  return (
                    <div key={email.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('emailId', email.id)}
                      onClick={() => selectEmail(email)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', cursor: 'pointer', background: active ? 'oklch(100% 0 0 / 0.06)' : 'transparent', borderBottom: '1px solid var(--border)', transition: 'background 100ms' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'oklch(100% 0 0 / 0.03)' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? 'oklch(100% 0 0 / 0.06)' : 'transparent' }}>

                      {/* Unread dot */}
                      <div style={{ width: 8, height: 8, borderRadius: 99, marginTop: 15, flexShrink: 0, background: !email.isRead ? '#3b82f6' : 'transparent' }} />

                      <MailAvatar name={sender} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Row 1: sender + time */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 13.5, fontWeight: !email.isRead ? 700 : 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sender}</span>
                          <span style={{ fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{formatDate(email.sentAt)}</span>
                        </div>
                        {/* Row 2: subject */}
                        <div style={{ fontSize: 13, fontWeight: !email.isRead ? 600 : 400, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                          {email.subject || '(kein Betreff)'}
                        </div>
                        {/* Row 3: flag + chip */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Flag size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0, opacity: 0.5 }} />
                          {cust && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fff3cd', color: '#856404', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {cust.name}
                            </span>
                          )}
                          {!cust && isKunde && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fff3cd', color: '#856404', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              Kunde
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>

            {/* ── DETAIL ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: 0, minWidth: 0 }}>
              {!selectedEmail ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <Mail size={28} style={{ color: 'var(--fg-dim)' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Keine Nachricht ausgewählt</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>Wähle links eine E-Mail aus, um sie hier zu lesen<br />— oder verfasse eine neue.</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
                    <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', letterSpacing: '-0.02em', lineHeight: 1.3 }}>{selectedEmail.subject || '(kein Betreff)'}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <MailAvatar name={selectedEmail.fromName || selectedEmail.fromAddr || '?'} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedEmail.fromName || selectedEmail.fromAddr}</div>
                        {selectedEmail.fromName && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 1 }}>{selectedEmail.fromAddr}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {selectedEmail.sentAt ? new Date(selectedEmail.sentAt).toLocaleString('de-DE') : '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => { setComposeMode('reply'); setShowCompose(true) }} disabled={!emailBody} className="btn-ghost" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, opacity: emailBody ? 1 : 0.4 }}><Reply size={13} /> Antworten</button>
                      <button onClick={() => { setComposeMode('forward'); setShowCompose(true) }} disabled={!emailBody} className="btn-ghost" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, opacity: emailBody ? 1 : 0.4 }}><Forward size={13} /> Weiterleiten</button>
                      <div style={{ position: 'relative' }} ref={todoPickerRef}>
                        <button onClick={() => setShowTodoPicker(v => !v)} className="btn-ghost" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <ListTodo size={13} /> Aufgabe <ChevronDown size={11} style={{ opacity: 0.5 }} />
                        </button>
                        {showTodoPicker && (
                          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 0', minWidth: 152, boxShadow: 'var(--shadow-2)' }}>
                            {(['today','tomorrow','in3days'] as const).map((w, i) => {
                              const labels = ['📌 Heute','📅 Morgen','🗓 In 3 Tagen']
                              return <button key={w} onClick={() => createMailTodo(w).catch(() => {})} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 13, color: 'var(--fg)', background: 'none', border: 'none', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>{labels[i]}</button>
                            })}
                          </div>
                        )}
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <select value={selectedEmail.customerId ?? ''} onChange={e => assignCustomer(selectedEmail.id, e.target.value || null)} className="mock-input" style={{ fontSize: 12, padding: '4px 8px' }}>
                          <option value="">— Nicht zugeordnet —</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={() => deleteEmail(selectedEmail.id)} className="btn-ghost" style={{ padding: '6px 8px', color: 'var(--fg-dim)' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                  {attachments.length > 0 && (
                    <div style={{ padding: '8px 28px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Anhänge</span>
                      {attachments.map(att => {
                        const size = att.sizeBytes < 1024 ? `${att.sizeBytes} B` : att.sizeBytes < 1048576 ? `${(att.sizeBytes / 1024).toFixed(0)} KB` : `${(att.sizeBytes / 1048576).toFixed(1)} MB`
                        return <button key={att.id} onClick={() => downloadAttachment(att.id).catch(e => alert(String(e)))} className="btn-ghost" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={11} />{att.filename}<span style={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{size}</span></button>
                      })}
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {emailBody ? (
                      emailBody.bodyHtml
                        ? <iframe
                            title="E-Mail"
                            srcDoc={normalizeEmailHtml(emailBody.bodyHtml, theme === 'dark')}
                            sandbox="allow-same-origin"
                            style={{ flex: 1, border: 'none', width: '100%', display: 'block', background: theme === 'dark' ? '#1e1e24' : '#ffffff' }}
                          />
                        : <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                            <pre style={{ fontSize: 14, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'inherit', margin: 0 }}>{emailBody.bodyText || '(kein Inhalt)'}</pre>
                          </div>
                    ) : <div style={{ padding: '24px 28px', fontSize: 13, color: 'var(--fg-muted)' }}>Lädt…</div>}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeCampaignId ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <CampaignDetail campaignId={activeCampaignId} onBack={() => setActiveCampaign(null)} />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <CampaignsTab onNew={() => setShowNewCampaign(true)} onSelect={id => setActiveCampaign(id)} />
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showSetup && (
        <div style={{ position: 'fixed', inset: 0, background: 'oklch(0% 0 0 / 0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) setShowSetup(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, width: 440, maxWidth: '94vw', boxShadow: 'var(--shadow-2)', animation: 'pop-in 240ms cubic-bezier(.2,.7,.1,1)' }}>
            <AccountSetupForm onAdd={() => { setShowSetup(false); loadAccounts() }} onCancel={() => setShowSetup(false)} />
          </div>
        </div>
      )}
      {showCompose && selectedAccountId && (
        <ComposeModal mode={composeMode} replyTo={composeMode !== 'new' ? selectedEmail ?? undefined : undefined} replyBody={composeMode !== 'new' ? emailBody?.bodyText : undefined} accountId={selectedAccountId} onClose={() => setShowCompose(false)} onSent={() => {}} />
      )}
      {showNewCampaign && (
        <CreateCampaignModal onClose={() => setShowNewCampaign(false)} onCreated={() => setShowNewCampaign(false)} />
      )}
    </div>
  )
}
