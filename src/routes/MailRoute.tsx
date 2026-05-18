import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useMailStore } from '@/store/mail.store'
import { useCustomersStore } from '@/store/customers.store'
import type { SyncProgress } from '@/types/mail.types'

const FOLDERS = [
  { id: 'INBOX', label: 'Posteingang' },
  { id: 'Sent', label: 'Gesendet' },
  { id: 'UNASSIGNED', label: 'Nicht zugeordnet' },
]

export function MailRoute() {
  const {
    accounts, selectedAccountId, selectedFolder, emails, selectedEmail, emailBody,
    search, syncProgress, isSyncing, isLoading,
    loadAccounts, selectAccount, selectFolder, selectEmail, setSearch, sync,
    removeAccount, setSyncProgress, assignCustomer, deleteEmail,
  } = useMailStore()

  const customers = useCustomersStore(s => s.customers)
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    loadAccounts()
    const unlisten = listen<SyncProgress>('sync-progress', e => setSyncProgress(e.payload))
    return () => { unlisten.then(fn => fn()) }
  }, [])

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
        {showSetup && <AccountSetupForm onAdd={() => { setShowSetup(false); loadAccounts() }} onCancel={() => setShowSetup(false)} />}
      </div>
    )
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const unread = emails.filter(e => !e.isRead).length

  return (
    <div className="main-inner" style={{ paddingBottom: 24 }}>
      <div className="greeting" style={{ marginBottom: 18 }}>
        <h1 className="greeting-title">Mail<em>.</em></h1>
        <div className="greeting-sub">
          <span>Posteingang</span>
          <span>Sync aktiv</span>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
      {/* Left panel: accounts + folders */}
      <div className="card" style={{ width: 192, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '8px', gap: 4, marginRight: 0, borderRadius: '12px 0 0 12px' }}>
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
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider px-2 py-1">Ordner</p>
        {FOLDERS.map(f => (
          <button
            key={f.id}
            onClick={() => selectFolder(f.id)}
            className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors
              ${selectedFolder === f.id ? 'bg-primary text-white' : 'text-[var(--text)] hover:bg-[var(--bg1)]'}`}
          >
            {f.label}
          </button>
        ))}

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
        </div>
      </div>

      {/* Middle panel: email list */}
      <div className="card" style={{ width: 288, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, borderRadius: 0 }}>
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
          {!isLoading && emails.length === 0 && (
            <p className="text-xs text-[var(--text2)] p-3 text-center">Keine E-Mails</p>
          )}
          {emails.map(email => {
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
                  {new Date(selectedEmail.sentAt).toLocaleString('de-DE')}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
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
                <pre className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
                  {emailBody.bodyText || '(kein Inhalt)'}
                </pre>
              ) : (
                <p className="text-xs text-[var(--text2)]">Lädt…</p>
              )}
            </div>
          </div>
        )}
      </div>

      {showSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg)] rounded-xl p-6 w-96 shadow-xl">
            <AccountSetupForm onAdd={() => { setShowSetup(false); loadAccounts() }} onCancel={() => setShowSetup(false)} />
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function AccountSetupForm({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
  const { addAccount } = useMailStore()
  const [form, setForm] = useState({ email: '', password: '', displayName: '', imapHost: '', imapPort: '993' })
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  const handleAdd = async () => {
    if (!form.email || !form.password || !form.imapHost) { setError('E-Mail, Passwort und IMAP-Host sind Pflichtfelder'); return }
    setTesting(true); setError('')
    try {
      await addAccount({ ...form, imapPort: parseInt(form.imapPort) || 993 })
      onAdd()
    } catch (e) {
      setError(String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-[var(--text)]">E-Mail-Konto hinzufügen</p>
      {(['email', 'password', 'displayName', 'imapHost', 'imapPort'] as const).map(field => (
        <input
          key={field}
          type={field === 'password' ? 'password' : 'text'}
          placeholder={fieldLabel(field)}
          value={form[field]}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ))}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={testing} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-50">
          {testing ? 'Verbinde…' : 'Verbinden'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--text2)] hover:text-[var(--text)]">Abbrechen</button>
      </div>
    </div>
  )
}

function fieldLabel(f: string): string {
  const m: Record<string, string> = {
    email: 'E-Mail-Adresse *', password: 'Passwort *', displayName: 'Anzeigename',
    imapHost: 'IMAP-Host *', imapPort: 'Port (Standard: 993)',
  }
  return m[f] ?? f
}
