import { useEffect, useState } from 'react'
import { useMailStore } from '@/store/mail.store'
import type { EmailBody } from '@/types/mail.types'
import { MailService } from '@/services/mail.service'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ── WhatsApp Scaffold ─────────────────────────────────────────────────────────

function WhatsAppSection() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg1)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#25D366' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.522 5.845L0 24l6.335-1.502A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.892 0-3.668-.497-5.208-1.37l-.374-.216-3.762.892.942-3.665-.236-.385A9.952 9.952 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">WhatsApp Business</p>
          <p className="text-xs text-[var(--text2)]">API-Integration</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full border font-medium"
          style={{ background: 'rgba(234,179,8,0.1)', color: '#CA8A04', borderColor: 'rgba(234,179,8,0.3)' }}>
          In Vorbereitung
        </span>
      </div>

      <div className="px-5 py-8 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.1)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--text)]">WhatsApp-Konversationen</p>
        <p className="text-xs text-[var(--text2)] max-w-xs leading-relaxed">
          Sobald der API-Key hinterlegt ist, werden Nachrichten dieses Kunden hier angezeigt und können direkt beantwortet werden.
        </p>
        <button
          disabled
          className="mt-1 px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text2)] border border-[var(--border)] opacity-50 cursor-not-allowed"
        >
          API-Key einrichten
        </button>
      </div>
    </div>
  )
}

// ── Email List ────────────────────────────────────────────────────────────────

interface Props { customerId: string }

export function KommunikationPane({ customerId }: Props) {
  const allEmails     = useMailStore(s => s.emails)
  const loadEmails    = useMailStore(s => s.loadEmails)
  const selectEmail   = useMailStore(s => s.selectEmail)
  const selectedEmail = useMailStore(s => s.selectedEmail)
  const emailBody     = useMailStore(s => s.emailBody)
  const isLoading     = useMailStore(s => s.isLoading)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bodyCache, setBodyCache] = useState<Record<string, EmailBody>>({})

  useEffect(() => {
    loadEmails()
  }, [])

  const emails = allEmails
    .filter(e => e.customerId === customerId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))

  const toggleExpand = async (emailId: string) => {
    if (expandedId === emailId) {
      setExpandedId(null)
      return
    }
    setExpandedId(emailId)
    if (!bodyCache[emailId]) {
      try {
        const body = await MailService.getBody(emailId)
        setBodyCache(c => ({ ...c, [emailId]: body }))
      } catch {}
    }
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">

      <WhatsAppSection />

      {/* E-Mails */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)]">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <p className="text-sm font-semibold text-[var(--text)]">E-Mails</p>
          {emails.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg1)] border border-[var(--border)] text-[var(--text2)]">
              {emails.length}
            </span>
          )}
        </div>

        {isLoading && emails.length === 0 && (
          <p className="text-sm text-[var(--text2)] py-4">Laden…</p>
        )}

        {!isLoading && emails.length === 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg1)] px-5 py-8 flex flex-col items-center gap-2 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text2)] opacity-40">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <p className="text-sm text-[var(--text2)]">Keine zugeordneten E-Mails</p>
            <p className="text-xs text-[var(--text2)] opacity-60">E-Mails können im Mail-Modul diesem Kunden zugeordnet werden.</p>
          </div>
        )}

        {emails.map(email => {
          const isExpanded = expandedId === email.id
          const body = bodyCache[email.id]

          return (
            <div key={email.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg1)] overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(email.id)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-[var(--bg2)] transition-colors"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${email.isRead ? 'bg-transparent' : 'bg-primary'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm truncate ${email.isRead ? 'text-[var(--text2)]' : 'text-[var(--text)] font-semibold'}`}>
                      {email.subject || '(Kein Betreff)'}
                    </p>
                    <p className="text-xs text-[var(--text2)] flex-shrink-0">
                      {formatDate(email.sentAt)} · {formatTime(email.sentAt)}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text2)] truncate mt-0.5">{email.fromName || email.fromAddr}</p>
                </div>
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={`text-[var(--text2)] flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 pt-1 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--text2)] mb-3">Von: {email.fromAddr}</p>
                  {body ? (
                    <div className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                      {body.bodyText || body.bodyHtml.replace(/<[^>]*>/g, ' ').trim()}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text2)]">Laden…</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
