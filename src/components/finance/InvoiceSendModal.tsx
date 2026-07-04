import { useEffect, useState } from 'react'
import type { Invoice } from '@/types/finance.types'
import { prepareInvoiceMail, sendInvoiceMail } from '@/services/invoice-send.service'
import { useToastStore } from '@/store/toast.store'

export function InvoiceSendModal({
  invoice, onClose, onSent,
}: {
  invoice: Invoice
  onClose: () => void
  onSent: () => void
}) {
  const [loading,    setLoading]    = useState(true)
  const [prepError,  setPrepError]  = useState<string | null>(null)
  const [to,         setTo]         = useState('')
  const [subject,    setSubject]    = useState('')
  const [body,       setBody]       = useState('')
  const [attachmentPath, setAttachmentPath] = useState('')
  const [sending,    setSending]    = useState(false)
  const [sendError,  setSendError]  = useState<string | null>(null)
  const showToast = useToastStore(s => s.show)

  const nr = invoice.number ?? invoice.id.slice(0, 8)

  useEffect(() => {
    setLoading(true)
    setPrepError(null)
    prepareInvoiceMail(invoice).then(result => {
      setLoading(false)
      if (result.ok) {
        setTo(result.data.to)
        setSubject(result.data.subject)
        setBody(result.data.body)
        setAttachmentPath(result.data.attachmentPath)
      } else {
        setPrepError(result.error)
      }
    })
  }, [invoice.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    setSending(true)
    setSendError(null)
    const result = await sendInvoiceMail(invoice, { to, subject, body, attachmentPath })
    setSending(false)
    if (result.ok) {
      showToast({ message: `Rechnung ${nr} an ${to} versendet ✓` })
      onSent()
      onClose()
    } else {
      setSendError(result.error ?? 'Versand fehlgeschlagen.')
    }
  }

  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'oklch(0% 0 0 / 0.55)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 480, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 24,
        boxShadow: 'var(--card-shadow), 0 20px 60px -10px oklch(0% 0 0 / 0.35)',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Rechnung per E-Mail senden</h2>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 16px' }}>Rechnung {nr}</p>

        {loading && (
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 16 }}>
            Versand wird vorbereitet …
          </p>
        )}

        {!loading && prepError && (
          <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{prepError}</p>
        )}

        {!loading && !prepError && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>An</label>
              <input
                className="mock-input"
                value={to}
                onChange={e => setTo(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Betreff</label>
              <input
                className="mock-input"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Nachricht</label>
              <textarea
                className="mock-input"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={8}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          </>
        )}

        {sendError && (
          <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{sendError}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!loading && !prepError ? (
            <>
              <button className="btn-ghost" onClick={onClose} disabled={sending}>
                Abbrechen
              </button>
              <button className="btn-primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Senden …' : 'Senden'}
              </button>
            </>
          ) : (
            <button className="btn-ghost" onClick={onClose} disabled={sending}>
              Schließen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
