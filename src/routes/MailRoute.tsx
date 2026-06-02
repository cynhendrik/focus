import { useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Reply, Forward, Plus, Focus, Inbox as InboxIcon, ListTodo } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useToastStore } from '@/store/toast.store'
import { ComposeModal } from '@/components/mail/ComposeModal'
import { FolderTree } from '@/components/mail/FolderTree'
import { CampaignsTab }        from '@/components/mail/CampaignsTab'
import { CampaignDetail }      from '@/components/mail/CampaignDetail'
import { CreateCampaignModal } from '@/components/mail/CreateCampaignModal'
import { useCampaignStore }    from '@/store/campaign.store'
import type { SyncProgress, MailFolder } from '@/types/mail.types'

export function MailRoute() {
  // Selectoren statt destrukturierter Store: vermeidet Re-Renders bei
  // jedem syncProgress-Tick und bei Field-Updates, die wir hier nicht lesen.
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
  const expandedFolders     = useMailStore(s => s.expandedFolders)
  const foldersLastFetched  = useMailStore(s => s.foldersLastFetched)
  const isFolderLoading     = useMailStore(s => s.isFolderLoading)
  const loadAccounts        = useMailStore(s => s.loadAccounts)
  const selectAccount       = useMailStore(s => s.selectAccount)
  const selectFolder        = useMailStore(s => s.selectFolder)
  const selectEmail         = useMailStore(s => s.selectEmail)
  const setSearch           = useMailStore(s => s.setSearch)
  const sync                = useMailStore(s => s.sync)
  const removeAccount       = useMailStore(s => s.removeAccount)
  const setSyncProgress     = useMailStore(s => s.setSyncProgress)
  const assignCustomer      = useMailStore(s => s.assignCustomer)
  const deleteEmail         = useMailStore(s => s.deleteEmail)
  const downloadAttachment  = useMailStore(s => s.downloadAttachment)
  const loadFolders         = useMailStore(s => s.loadFolders)
  const toggleFolder        = useMailStore(s => s.toggleFolder)
  const loadEmails          = useMailStore(s => s.loadEmails)

  const customers = useCustomersStore(s => s.customers)
  const [showSetup, setShowSetup] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'forward'>('new')
  const [mailTab,         setMailTab]         = useState<'inbox' | 'campaigns'>('inbox')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const setActiveCampaign = useCampaignStore(s => s.setActive)
  const activeCampaignId  = useCampaignStore(s => s.activeCampaignId)

  const upsertTodo  = useTodosStore(s => s.upsert)
  const showToast   = useToastStore(s => s.show)
  const [showTodoPicker, setShowTodoPicker] = useState(false)
  const todoPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTodoPicker) return
    const handler = (e: MouseEvent) => {
      if (todoPickerRef.current && !todoPickerRef.current.contains(e.target as Node)) {
        setShowTodoPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTodoPicker])

  const createMailTodo = async (when: 'today' | 'tomorrow' | 'in3days') => {
    if (!selectedEmail) return
    setShowTodoPicker(false)

    const today = new Date()
    const scheduledDate = when === 'today'
      ? today
      : when === 'tomorrow'
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 9, 0)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 9, 0)

    const todayStr = today.toISOString().slice(0, 10)
    const scheduledStr = scheduledDate.toISOString()

    await upsertTodo({
      title:       `${selectedEmail.subject ?? '(Mail)'} beantworten`,
      customerId:  selectedEmail.customerId ?? undefined,
      priority:    'p2',
      bucket:      scheduledStr.slice(0, 10) === todayStr ? 'today' : 'backlog',
      scheduledAt: scheduledStr,
      actionType:  'reply_mail',
      source:      'manual',
      notes:       `Von: ${selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromAddr}>` : selectedEmail.fromAddr}`,
      checklist:   [],
      tags:        [],
    }).catch(() => {})

    showToast({ message: 'Mail als Aufgabe angelegt.', variant: 'success' })
  }

  // ── Focus-Inbox: default-on, zeigt nur Mails mit Kunden-Bezug ──────────────
  const [mailFocus, setMailFocus] = useState<boolean>(() => {
    try { return localStorage.getItem('cynera:mail:focus-v1') !== 'all' }
    catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('cynera:mail:focus-v1', mailFocus ? 'focus' : 'all') } catch {}
  }, [mailFocus])

  // Free-Mail-Provider: bei diesen Domains identifiziert die Adresse einen
  // einzelnen Privatkunden, nicht ein Unternehmen — also auf exakte
  // E-Mail-Adresse matchen statt auf Domain (sonst wuerde z.B. info@gmail.com
  // als Kundenadresse die gesamte Gmail-Welt in die Fokus-Inbox spuelen).
  const PUBLIC_MAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com',
    'web.de', 't-online.de', 'freenet.de', 'arcor.de', 'mailbox.org', 'posteo.de',
    'yahoo.com', 'yahoo.de', 'ymail.com',
    'hotmail.com', 'hotmail.de', 'outlook.com', 'outlook.de', 'live.com', 'live.de', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'protonmail.com', 'proton.me', 'pm.me',
  ])

  const { customerEmailAddresses, customerEmailDomains } = useMemo(() => {
    const addresses = new Set<string>()
    const domains   = new Set<string>()
    for (const c of customers) {
      if (!c.email) continue
      const email = c.email.trim().toLowerCase()
      if (!email) continue
      addresses.add(email)
      const at = email.lastIndexOf('@')
      if (at === -1) continue
      const domain = email.slice(at + 1)
      if (domain && !PUBLIC_MAIL_DOMAINS.has(domain)) {
        domains.add(domain)
      }
    }
    return { customerEmailAddresses: addresses, customerEmailDomains: domains }
  }, [customers])

  const visibleEmails = useMemo(() => {
    if (!mailFocus) return emails
    return emails.filter(e => {
      if (e.customerId) return true
      if (!e.fromAddr) return false
      const addr = e.fromAddr.trim().toLowerCase()
      if (!addr) return false
      if (customerEmailAddresses.has(addr)) return true
      const at = addr.lastIndexOf('@')
      if (at === -1) return false
      return customerEmailDomains.has(addr.slice(at + 1))
    })
  }, [emails, mailFocus, customerEmailAddresses, customerEmailDomains])

  const hiddenCount = mailFocus ? emails.length - visibleEmails.length : 0

  useEffect(() => {
    loadAccounts()
    const unlisten = listen<SyncProgress>('email-sync-progress', e => setSyncProgress(e.payload))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  useEffect(() => {
    if (!selectedAccountId) return
    loadFolders(selectedAccountId)
    const interval = setInterval(() => {
      loadFolders(selectedAccountId)
    }, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [selectedAccountId])

  useEffect(() => {
    if (!selectedAccountId) return
    const timer = setTimeout(() => loadEmails(), 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleSync = () => {
    const customersJson = JSON.stringify(customers.map(c => ({ id: c.id, email: c.email ?? null })))
    sync(customersJson)
  }

  if (accounts.length === 0 && !showSetup) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-[var(--text2)] text-sm">Kein E-Mail-Konto verbunden</p>
        <button onClick={() => setShowSetup(true)} className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">
          Konto hinzufügen
        </button>
      </div>
    )
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  return (
    <div className="main-inner" style={{ paddingBottom: 24 }}>
      <div className="greeting" style={{ marginBottom: 18 }}>
        <h1 className="greeting-title">Mail<em>.</em></h1>
        <div className="greeting-sub">
          <span>{mailFocus ? 'Fokus-Inbox' : 'Posteingang'}</span>
          {mailFocus && hiddenCount > 0 && (
            <span>{hiddenCount} weitere ausgeblendet</span>
          )}
          <span>Sync aktiv</span>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
      {/* Left panel: accounts + folders */}
      <div className="card" style={{ width: 192, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '8px', gap: 4, marginRight: 0, borderRadius: '12px 0 0 12px' }}>
        {/* Tab Toggle — Inbox / Kampagnen */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <button
            onClick={() => { setMailTab('inbox'); setActiveCampaign(null) }}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: mailTab === 'inbox' ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: mailTab === 'inbox' ? 'var(--fg)' : 'var(--fg-dim)',
              border: 'none',
            }}
          >
            Inbox
          </button>
          <button
            onClick={() => { setMailTab('campaigns'); setActiveCampaign(null) }}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: mailTab === 'campaigns' ? 'rgba(45,212,191,0.12)' : 'transparent',
              color: mailTab === 'campaigns' ? '#2dd4bf' : 'var(--fg-dim)',
              border: 'none',
            }}
          >
            Kampagnen
          </button>
        </div>
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider px-2 py-1">Konten</p>
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => selectAccount(a.id)}
            className={`text-left text-xs px-2 py-1.5 rounded-lg truncate transition-colors
              ${selectedAccountId === a.id ? 'bg-primary text-white' : 'text-[var(--text)] hover:bg-[var(--bg1)]'}`}
          >
            {a.displayName || a.email}
          </button>
        ))}
        <button onClick={() => setShowSetup(s => !s)} className="text-xs px-2 py-1 text-[var(--text2)] hover:text-[var(--text)] text-left">+ Konto</button>

        <div className="h-px bg-[var(--border)] my-1" />
        {/* Pinned virtual filter */}
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider px-2 py-1">Filter</p>
        <button
          onClick={() => selectFolder('UNASSIGNED')}
          className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors
            ${selectedFolder === 'UNASSIGNED' ? 'bg-primary text-white' : 'text-[var(--text)] hover:bg-[var(--bg1)]'}`}
        >
          🔍 Nicht zugeordnet
        </button>

        <div className="h-px bg-[var(--border)] my-1" />
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider px-2 py-1">Ordner</p>
        {isFolderLoading && folders.length === 0 && (
          <p className="text-xs text-[var(--text2)] px-2">Lädt…</p>
        )}
        {folders.length > 0 && (
          <FolderTree
            folders={folders}
            selectedPath={selectedFolder}
            expandedPaths={expandedFolders}
            onSelect={(folder: MailFolder) => selectFolder(folder.path)}
            onToggle={toggleFolder}
          />
        )}
        {folders.length === 0 && !isFolderLoading && (
          <p className="text-xs text-[var(--text2)] px-2">Keine Ordner</p>
        )}

        <div className="mt-auto">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="w-full text-xs px-2 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text2)] hover:text-[var(--text)] disabled:opacity-50"
          >
            {isSyncing ? 'Synchronisiert…' : 'Synchronisieren'}
          </button>
          {syncProgress && syncProgress.phase !== 'done' && (
            <div className="mt-1 h-1 rounded-full bg-[var(--bg1)] overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: syncProgress.total ? `${(syncProgress.done / syncProgress.total) * 100}%` : '0%' }}
              />
            </div>
          )}
          {foldersLastFetched > 0 && (
            <p className="text-center" style={{ fontSize: 10, color: 'var(--text2)', padding: '2px 0' }}>
              {formatLastFetched(foldersLastFetched)}
            </p>
          )}
        </div>
      </div>

      {mailTab === 'inbox' ? (
      <>
      {/* Middle panel: email list */}
      <div className="card" style={{ width: 288, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, borderRadius: 0 }}>
        <div style={{ padding: '8px 8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          {/* Focus toggle */}
          <div style={{
            display: 'inline-flex', padding: 2,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8,
          }}>
            <button
              onClick={() => setMailFocus(true)}
              title="Nur Mails von Kunden oder Kunden-Domains"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 9px', border: 'none', borderRadius: 6,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: mailFocus ? 'var(--surface)' : 'transparent',
                color: mailFocus ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: mailFocus ? 'var(--shadow-1)' : 'none',
                transition: 'background 140ms, color 140ms',
              }}
            >
              <Focus size={11} /> Fokus
            </button>
            <button
              onClick={() => setMailFocus(false)}
              title="Alle Mails anzeigen"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 9px', border: 'none', borderRadius: 6,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: !mailFocus ? 'var(--surface)' : 'transparent',
                color: !mailFocus ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: !mailFocus ? 'var(--shadow-1)' : 'none',
                transition: 'background 140ms, color 140ms',
              }}
            >
              <InboxIcon size={11} /> Alle
            </button>
          </div>
          <button
            onClick={() => { setComposeMode('new'); setShowCompose(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none',
            }}
          >
            <Plus size={13} /> Neu verfassen
          </button>
        </div>
        <div className="p-2 border-b border-[var(--border)]">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="w-full text-xs px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {isLoading && <p className="text-xs text-[var(--text2)] p-3">Lädt…</p>}
          {!isLoading && visibleEmails.length === 0 && emails.length === 0 && (
            <p className="text-xs text-[var(--text2)] p-3 text-center">Keine E-Mails</p>
          )}
          {!isLoading && visibleEmails.length === 0 && emails.length > 0 && mailFocus && (
            <div style={{ padding: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
                Keine Kunden-Mails in diesem Ordner.
              </p>
              <button
                onClick={() => setMailFocus(false)}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--fg)', cursor: 'pointer', alignSelf: 'center',
                }}
              >
                {emails.length} weitere Mails zeigen
              </button>
            </div>
          )}
          {visibleEmails.map(email => {
            const senderName = email.fromName || email.fromAddr
            const senderInitial = senderName ? senderName.charAt(0).toUpperCase() : '?'
            const subject = email.subject || '(kein Betreff)'
            const time = email.sentAt ? new Date(email.sentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''
            return (
              <div
                key={email.id}
                className="mail-item"
                data-unread={String(!email.isRead)}
                onClick={() => selectEmail(email)}
                style={{ cursor: 'pointer' }}
              >
                <span className="mail-dot" />
                <div className="avatar">{senderInitial}</div>
                <div className="mail-body">
                  <div className="mail-from">{senderName}</div>
                  <div className="mail-subj">{subject}</div>
                </div>
                {email.customerId && (() => {
                  const cust = customers.find(c => c.id === email.customerId)
                  if (!cust) return null
                  return (
                    <span style={{
                      fontSize: 9.5, padding: '1px 7px', borderRadius: 99,
                      background: 'var(--surface-3)', color: 'var(--fg-dim)',
                      fontWeight: 600, flexShrink: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80,
                      whiteSpace: 'nowrap', display: 'inline-block',
                    }}>
                      {cust.name}
                    </span>
                  )
                })()}
                <span className="mail-time">{time}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel: detail */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 24, minHeight: 0, borderRadius: '0 12px 12px 0' }}>
        {!selectedEmail ? (
          <p className="text-sm text-[var(--text2)] text-center py-12">E-Mail auswählen</p>
        ) : (
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">{selectedEmail.subject || '(kein Betreff)'}</h2>
                <p className="text-xs text-[var(--text2)] mt-0.5">
                  Von: {selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromAddr}>` : selectedEmail.fromAddr}
                </p>
                <p className="text-xs text-[var(--text2)]">
                  {selectedEmail.sentAt ? new Date(selectedEmail.sentAt).toLocaleString('de-DE') : '—'}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => { setComposeMode('reply'); setShowCompose(true) }}
                  disabled={!emailBody}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--fg)', cursor: 'pointer', opacity: emailBody ? 1 : 0.4 }}
                >
                  <Reply size={13} /> Antworten
                </button>
                <button
                  onClick={() => { setComposeMode('forward'); setShowCompose(true) }}
                  disabled={!emailBody}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--fg)', cursor: 'pointer', opacity: emailBody ? 1 : 0.4 }}
                >
                  <Forward size={13} /> Weiterleiten
                </button>

                {/* → Aufgabe Button with date picker */}
                <div style={{ position: 'relative' }} ref={todoPickerRef}>
                  <button
                    onClick={() => setShowTodoPicker(v => !v)}
                    title="Als Aufgabe in den Fokus-Modus bringen"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 12, padding: '4px 10px', borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: showTodoPicker ? 'var(--accent-soft)' : 'none',
                      color: showTodoPicker ? 'var(--accent)' : 'var(--fg)',
                      cursor: 'pointer',
                    }}
                  >
                    <ListTodo size={13} /> Aufgabe
                  </button>
                  {showTodoPicker && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 4,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '6px 0', zIndex: 100,
                      boxShadow: '0 8px 24px -4px oklch(0% 0 0 / 0.3)',
                      minWidth: 140,
                    }}>
                      {([
                        ['today',    '📌 Heute'],
                        ['tomorrow', '📅 Morgen'],
                        ['in3days',  '🗓 In 3 Tagen'],
                      ] as const).map(([when, label]) => (
                        <button
                          key={when}
                          onClick={() => { createMailTodo(when).catch(() => {}) }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '7px 14px', fontSize: 12, color: 'var(--fg)',
                            background: 'none', border: 'none', cursor: 'pointer',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <select
                  value={selectedEmail.customerId ?? ''}
                  onChange={e => assignCustomer(selectedEmail.id, e.target.value || null)}
                  className="text-xs px-2 py-1 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none"
                >
                  <option value="">— Nicht zugeordnet —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteEmail(selectedEmail.id)}
                  className="text-xs px-2 py-1 rounded-lg text-[var(--text2)] hover:text-red-400 border border-[var(--border)]"
                >
                  Löschen
                </button>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              {emailBody ? (
                emailBody.bodyHtml ? (
                  <iframe
                    title="E-Mail Inhalt"
                    srcDoc={emailBody.bodyHtml}
                    sandbox="allow-same-origin"
                    style={{
                      border: 'none',
                      width: '100%',
                      minHeight: 400,
                      flex: 1,
                      borderRadius: 8,
                      background: '#fff',
                    }}
                  />
                ) : (
                  <pre className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
                    {emailBody.bodyText || '(kein Inhalt)'}
                  </pre>
                )
              ) : (
                <p className="text-xs text-[var(--text2)]">Lädt…</p>
              )}
            </div>
            {attachments.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Anhänge ({attachments.length})
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {attachments.map(att => {
                    const kb = att.sizeBytes < 1024 ? `${att.sizeBytes} B`
                      : att.sizeBytes < 1024 * 1024 ? `${(att.sizeBytes / 1024).toFixed(0)} KB`
                      : `${(att.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                    return (
                      <button
                        key={att.id}
                        onClick={() => downloadAttachment(att.id).catch(e => alert(String(e)))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                          background: 'var(--surface-2)', border: '1px solid var(--border)',
                          color: 'var(--fg)', fontSize: 12,
                        }}
                      >
                        📄 {att.filename} · {kb} ↓
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      ) : activeCampaignId ? (
        <CampaignDetail
          campaignId={activeCampaignId}
          onBack={() => setActiveCampaign(null)}
        />
      ) : (
        <CampaignsTab
          onNew={() => setShowNewCampaign(true)}
          onSelect={(id) => setActiveCampaign(id)}
        />
      )}

      {showSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg)] rounded-xl p-6 w-96 shadow-xl">
            <AccountSetupForm onAdd={() => { setShowSetup(false); loadAccounts() }} onCancel={() => setShowSetup(false)} />
          </div>
        </div>
      )}

      {showCompose && selectedAccountId && (
        <ComposeModal
          mode={composeMode}
          replyTo={composeMode !== 'new' ? selectedEmail ?? undefined : undefined}
          replyBody={composeMode !== 'new' ? emailBody?.bodyText : undefined}
          accountId={selectedAccountId}
          onClose={() => setShowCompose(false)}
          onSent={() => {}}
        />
      )}
      {showNewCampaign && (
        <CreateCampaignModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={(_id) => {
            setShowNewCampaign(false)
          }}
        />
      )}
      </div>
    </div>
  )
}

function formatLastFetched(ts: number): string {
  if (!ts) return ''
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Zuletzt: gerade eben'
  if (diffMin === 1) return 'Zuletzt: vor 1 Min.'
  return `Zuletzt: vor ${diffMin} Min.`
}

function AccountSetupForm({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
  const addAccount = useMailStore(s => s.addAccount)
  const [form, setForm] = useState({
    email: '', password: '', displayName: '', imapHost: '', imapPort: '993',
  })
  const [smtpForm, setSmtpForm] = useState({ smtpHost: '', smtpPort: '587', smtpStarttls: true })
  const [showSmtpFields, setShowSmtpFields] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  const handleAdd = async () => {
    if (!form.email || !form.password || !form.imapHost) {
      setError('E-Mail, Passwort und IMAP-Host sind Pflichtfelder')
      return
    }
    setTesting(true); setError('')
    try {
      const payload = {
        ...form,
        imapPort: parseInt(form.imapPort) || 993,
        ...(showSmtpFields ? {
          smtpHost: smtpForm.smtpHost,
          smtpPort: parseInt(smtpForm.smtpPort) || 587,
          smtpStarttls: smtpForm.smtpStarttls,
        } : {}),
      }
      await addAccount(payload)
      onAdd()
    } catch (e) {
      const errorStr = String(e)
      if (errorStr.startsWith('SMTP_AUTODETECT_FAILED:')) {
        try {
          const json = errorStr.slice('SMTP_AUTODETECT_FAILED:'.length)
          const parsed = JSON.parse(json) as { smtpHost?: string; smtpPort?: number }
          if (typeof parsed?.smtpHost === 'string') {
            setSmtpForm(prev => ({ ...prev, smtpHost: parsed.smtpHost!, smtpPort: String(parsed.smtpPort ?? 587) }))
          }
        } catch { /* ignore parse error */ }
        setShowSmtpFields(true)
        setError('SMTP konnte nicht automatisch erkannt werden. Bitte SMTP-Einstellungen prüfen und erneut versuchen.')
      } else {
        setError(errorStr)
      }
    } finally {
      setTesting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 13,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--fg)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>E-Mail-Konto hinzufügen</p>

      <div>
        <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>E-Mail-Adresse *</label>
        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Passwort *</label>
        <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Anzeigename</label>
        <input type="text" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} style={inputStyle} placeholder="Max Mustermann" />
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>IMAP-Host *</label>
        <input type="text" value={form.imapHost} onChange={e => setForm(f => ({ ...f, imapHost: e.target.value }))} style={inputStyle} placeholder="imap.example.de" />
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>IMAP-Port</label>
        <input type="text" value={form.imapPort} onChange={e => setForm(f => ({ ...f, imapPort: e.target.value }))} style={inputStyle} placeholder="993" />
      </div>

      {showSmtpFields && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>SMTP-Einstellungen</p>
          <div>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>SMTP-Host</label>
            <input
              type="text"
              value={smtpForm.smtpHost}
              onChange={e => setSmtpForm(f => ({ ...f, smtpHost: e.target.value }))}
              style={{ ...inputStyle, background: 'var(--bg)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Port</label>
              <input
                type="text"
                value={smtpForm.smtpPort}
                onChange={e => setSmtpForm(f => ({ ...f, smtpPort: e.target.value }))}
                style={{ ...inputStyle, background: 'var(--bg)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>STARTTLS</label>
              <input
                type="checkbox"
                checked={smtpForm.smtpStarttls}
                onChange={e => setSmtpForm(f => ({ ...f, smtpStarttls: e.target.checked }))}
              />
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger, #f87171)', fontSize: 12, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--fg)' }}
        >
          Abbrechen
        </button>
        <button
          onClick={handleAdd}
          disabled={testing}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--accent, oklch(65% 0.18 250))', color: 'var(--accent-ink, white)', border: 'none', opacity: testing ? 0.6 : 1 }}
        >
          {testing
            ? (showSmtpFields ? 'Erneut testen…' : 'Verbinde…')
            : (showSmtpFields ? 'Erneut testen' : 'Verbinden')}
        </button>
      </div>
    </div>
  )
}
