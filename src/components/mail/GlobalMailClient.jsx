import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { useStore } from '../../store'
import { AccountSetupModal } from './AccountSetupModal'
import { SyncProgressBar } from './SyncProgressBar'

const FOLDERS = [
  { id: 'INBOX',      label: 'Posteingang' },
  { id: 'Sent',       label: 'Gesendet'    },
  { id: 'UNASSIGNED', label: 'Unassigned'  },
]

// ── Mail Row ──────────────────────────────────────────────────────────────────

function MailRow({ mail, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', background: active ? 'var(--p5)' : 'transparent',
        borderLeft: `3px solid ${active ? 'var(--p)' : 'transparent'}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 12, fontWeight: mail.is_read ? 400 : 700, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
          {mail.from_name || mail.from_addr}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text4)', flexShrink: 0 }}>
          {mail.sent_at ? new Date(mail.sent_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit',
          }) : ''}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: mail.is_read ? 400 : 600, color: 'var(--text2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {mail.subject || '(kein Betreff)'}
      </div>
      {!mail.customer_id && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>● Unassigned</div>
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function MailDetail({ mail, customers, onAssign, onMarkRead, onDelete }) {
  const [body, setBody]               = useState(null)
  const [loadingBody, setLoadingBody] = useState(false)

  useEffect(() => {
    if (!mail) { setBody(null); return }
    setLoadingBody(true)
    invoke('email_get_body', { emailId: mail.id })
      .then(b => setBody(b))
      .catch(() => setBody(null))
      .finally(() => setLoadingBody(false))
    if (!mail.is_read) {
      invoke('email_mark_read', { emailId: mail.id, isRead: true }).catch(() => {})
    }
  }, [mail?.id])

  if (!mail) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text4)', fontSize: 13 }}>
      E-Mail auswählen
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, background: 'var(--bg1)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {mail.subject || '(kein Betreff)'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Von: <strong style={{ color: 'var(--text)' }}>{mail.from_name || mail.from_addr}</strong>
          {mail.from_name && <span style={{ color: 'var(--text4)' }}> &lt;{mail.from_addr}&gt;</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 12 }}>
          {mail.sent_at ? new Date(mail.sent_at).toLocaleString('de-DE') : ''}
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={mail.customer_id || ''}
            onChange={e => onAssign(mail.id, e.target.value || null)}
            style={{ padding: '5px 10px', borderRadius: 7, fontSize: 12,
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">— Kunden zuordnen —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => onMarkRead(mail.id, !mail.is_read)} style={actionBtnStyle}>
            {mail.is_read ? 'Als ungelesen' : 'Als gelesen'}
          </button>
          <button onClick={() => onDelete(mail.id)} style={{ ...actionBtnStyle, color: '#ef4444',
            borderColor: 'rgba(239,68,68,0.3)' }}>
            Löschen
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loadingBody && <div style={{ color: 'var(--text4)', fontSize: 13 }}>Lädt…</div>}
        {body?.body_html ? (
          <div
            style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: body.body_html }}
          />
        ) : body?.body_text ? (
          <pre style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {body.body_text}
          </pre>
        ) : !loadingBody ? (
          <div style={{ color: 'var(--text4)', fontSize: 13 }}>Kein Inhalt</div>
        ) : null}
      </div>
    </div>
  )
}

const actionBtnStyle = {
  padding: '5px 12px', borderRadius: 7, fontSize: 12,
  background: 'transparent', border: '1px solid var(--border2)',
  color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit',
}

// ── Local mail adapter (for Zustand emails) ───────────────────────────────────

function useLocalMails(emails, folder, search) {
  const dirMap = { INBOX: 'in', Sent: 'out', UNASSIGNED: null }
  const dir = dirMap[folder]
  let filtered = dir === null
    ? emails.filter(e => !e.customerId)
    : emails.filter(e => e.direction === dir)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(e =>
      (e.subject || '').toLowerCase().includes(q) ||
      (e.from || '').toLowerCase().includes(q)
    )
  }
  return filtered.map(e => ({
    id:          e.id,
    from_addr:   e.from || '',
    from_name:   '',
    subject:     e.subject || '',
    sent_at:     e.createdAt || '',
    is_read:     e.read ?? true,
    customer_id: e.customerId || null,
    _local:      true,
  }))
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GlobalMailClient() {
  const customers          = useStore(s => s.customers)
  const emails             = useStore(s => s.emails)
  const emailAccounts      = useStore(s => s.emailAccounts)
  const removeEmailAccount = useStore(s => s.removeEmailAccount)
  const setEmailSyncStatus = useStore(s => s.setEmailSyncStatus)
  const emailSyncStatus    = useStore(s => s.emailSyncStatus)

  const [activeAccountId, setActiveAccountId] = useState('local')
  const [folder,          setFolder]          = useState('INBOX')
  const [search,          setSearch]          = useState('')
  const [mailList,        setMailList]        = useState([])
  const [selectedMail,    setSelectedMail]    = useState(null)
  const [offset,          setOffset]          = useState(0)
  const [hasMore,         setHasMore]         = useState(false)
  const [loadingList,     setLoadingList]     = useState(false)
  const [setupOpen,       setSetupOpen]       = useState(false)
  const [syncing,         setSyncing]         = useState(false)

  const LIMIT   = 50
  const isLocal = activeAccountId === 'local'

  const localMails = useLocalMails(emails, folder, search)

  // ── Fetch list from SQLite ──────────────────────────────────────────────────
  const fetchList = useCallback(async (reset = false) => {
    if (isLocal) {
      setMailList(localMails)
      setHasMore(false)
      return
    }
    setLoadingList(true)
    try {
      const newOffset    = reset ? 0 : offset
      const actualFolder = folder === 'UNASSIGNED' ? 'INBOX' : folder
      const result       = await invoke('email_list', {
        accountId: activeAccountId,
        folder:    actualFolder,
        limit:     LIMIT,
        offset:    newOffset,
        search,
      })
      let items = result
      if (folder === 'UNASSIGNED') {
        items = items.filter(m => !m.customer_id)
      }
      setMailList(prev => reset ? items : [...prev, ...items])
      setOffset(newOffset + LIMIT)
      setHasMore(result.length === LIMIT)
    } catch (e) {
      console.error('email_list error:', e)
    } finally {
      setLoadingList(false)
    }
  }, [activeAccountId, folder, search, offset, isLocal, localMails])

  useEffect(() => {
    setOffset(0)
    setMailList([])
    setSelectedMail(null)
    fetchList(true)
  }, [activeAccountId, folder, search])

  // ── Sync ────────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (isLocal || syncing) return
    setSyncing(true)
    setEmailSyncStatus(activeAccountId, { phase: 'syncing', progress: 0, error: null })
    try {
      const customersJson = JSON.stringify(
        customers.map(c => ({ id: c.id, email: c.email || null }))
      )
      await invoke('email_sync', { accountId: activeAccountId, customersJson })
      fetchList(true)
    } catch (e) {
      setEmailSyncStatus(activeAccountId, { phase: 'error', progress: 0, error: String(e) })
    } finally {
      setSyncing(false)
    }
  }

  const handleRemoveAccount = async (id) => {
    if (!window.confirm('Konto entfernen? Alle lokalen E-Mails werden gelöscht.')) return
    try {
      await invoke('email_remove_account', { accountId: id })
      removeEmailAccount(id)
      if (activeAccountId === id) setActiveAccountId('local')
    } catch (e) {
      alert(String(e))
    }
  }

  const handleAssign = async (emailId, customerId) => {
    if (isLocal) return
    await invoke('email_assign_customer', { emailId, customerId })
    setMailList(prev => prev.map(m => m.id === emailId ? { ...m, customer_id: customerId } : m))
    if (selectedMail?.id === emailId) setSelectedMail(m => ({ ...m, customer_id: customerId }))
  }

  const handleMarkRead = async (emailId, isRead) => {
    if (isLocal) return
    await invoke('email_mark_read', { emailId, isRead })
    setMailList(prev => prev.map(m => m.id === emailId ? { ...m, is_read: isRead } : m))
  }

  const handleDelete = async (emailId) => {
    if (isLocal) return
    await invoke('email_delete', { emailId })
    setMailList(prev => prev.filter(m => m.id !== emailId))
    if (selectedMail?.id === emailId) setSelectedMail(null)
  }

  const unreadCount = mailList.filter(m => !m.is_read).length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Left Nav ── */}
      <div style={{
        width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--bg1)', borderRight: '1px solid var(--border)',
      }}>
        <div style={{ padding: '16px 14px 10px', fontSize: 11, fontWeight: 800,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>
          Mail
        </div>

        {/* Account selector */}
        <div style={{ padding: '0 10px 10px' }}>
          <select
            value={activeAccountId}
            onChange={e => setActiveAccountId(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
          >
            <option value="local">Lokal</option>
            {emailAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.displayName || a.email}</option>
            ))}
          </select>
        </div>

        {/* Add account */}
        <div style={{ padding: '0 10px 12px' }}>
          <button
            onClick={() => setSetupOpen(true)}
            style={{
              width: '100%', padding: '7px 0', borderRadius: 8,
              background: 'var(--p5)', border: '1px solid var(--border3)',
              color: 'var(--p)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Konto hinzufügen</button>
        </div>

        {/* Folder list */}
        <div style={{ padding: '0 8px' }}>
          {FOLDERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: folder === f.id ? 'var(--p5)' : 'transparent',
                color: folder === f.id ? 'var(--p)' : 'var(--text2)',
                fontSize: 12, fontWeight: folder === f.id ? 700 : 400,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              {f.label}
              {f.id === 'INBOX' && unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--p)',
                  color: '#fff', padding: '1px 6px', borderRadius: 99 }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sync button + last-synced */}
        {!isLocal && (
          <div style={{ padding: '12px 10px', marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                width: '100%', padding: '7px 0', borderRadius: 8, fontSize: 12,
                background: syncing ? 'var(--bg3)' : 'var(--bg2)',
                border: '1px solid var(--border2)',
                color: syncing ? 'var(--text4)' : 'var(--text2)',
                cursor: syncing ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >{syncing ? 'Synchronisiert…' : '↻ Synchronisieren'}</button>
            {emailAccounts.find(a => a.id === activeAccountId)?.lastSyncedAt && (
              <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 5, textAlign: 'center' }}>
                Zuletzt: {new Date(
                  emailAccounts.find(a => a.id === activeAccountId).lastSyncedAt
                ).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}

        {/* Sync progress bar */}
        {syncing && (
          <SyncProgressBar
            accountId={activeAccountId}
            onDone={() => setSyncing(false)}
          />
        )}

        {/* Remove account */}
        {!isLocal && (
          <div style={{ padding: '0 10px 12px' }}>
            <button
              onClick={() => handleRemoveAccount(activeAccountId)}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 8, fontSize: 11,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text4)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Konto entfernen</button>
          </div>
        )}
      </div>

      {/* ── Mail List ── */}
      <div style={{
        width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)', background: 'var(--bg)',
      }}>
        {/* Search */}
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, boxSizing: 'border-box',
              background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)',
              fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {mailList.length === 0 && !loadingList && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text4)', fontSize: 13 }}>
              {isLocal && emailAccounts.length === 0
                ? 'Kein Konto verbunden.\nKlicke "+ Konto hinzufügen".'
                : 'Keine E-Mails'}
            </div>
          )}
          {mailList.map(mail => (
            <MailRow
              key={mail.id}
              mail={mail}
              active={selectedMail?.id === mail.id}
              onClick={() => setSelectedMail(mail)}
            />
          ))}
          {hasMore && (
            <button
              onClick={() => fetchList(false)}
              disabled={loadingList}
              style={{ width: '100%', padding: '10px', border: 'none', background: 'var(--bg2)',
                color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >{loadingList ? 'Lädt…' : 'Mehr laden'}</button>
          )}
        </div>
      </div>

      {/* ── Detail ── */}
      <MailDetail
        mail={selectedMail}
        customers={customers}
        onAssign={handleAssign}
        onMarkRead={handleMarkRead}
        onDelete={handleDelete}
      />

      {/* ── Account Setup Modal ── */}
      <AccountSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
      />
    </div>
  )
}
