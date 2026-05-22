import { useState, useMemo, useRef, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useFinanceStore } from '@/store/finance.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { CompanyProfile } from '@/types/company.types'
import type { InvoiceWithItems, UpsertInvoicePayload } from '@/types/finance.types'
import {
  todayStr, generateLeistungsdatum, generateZahlungsziel, formatDateDE,
  getTaxMode, calcItemTotal, calcTotals, defaultItem, toUpsertItems,
  type InvoiceItemDraft,
} from '@/lib/invoice-engine'

interface Props {
  initial?: InvoiceWithItems
  initialAccountId?: string
  onClose: () => void
  onSaved: () => void
}

export function InvoiceForm({ initial, initialAccountId, onClose, onSaved }: Props) {
  const createInvoice = useFinanceStore(s => s.createInvoice)
  const updateInvoice = useFinanceStore(s => s.updateInvoice)
  const accounts      = useAccountsStore(s => s.accounts)
  const profile       = useCompanyStore(s => s.profile)
  const isAdmin       = useCompanyStore(s => s.isAdmin)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user          = useAuthStore(s => s.user)

  const kleinunternehmer = profile.kleinunternehmer ?? false
  const zahlungszielTage = profile.zahlungszielTage ?? 14

  const [accountId, setAccountId] = useState(initial?.invoice.accountId ?? initialAccountId ?? '')
  const [date,      setDate]      = useState(initial?.invoice.date ?? todayStr())
  const [dueDate,   setDueDate]   = useState(
    initial?.invoice.dueDate ?? generateZahlungsziel(todayStr(), zahlungszielTage)
  )
  const [notes, setNotes] = useState(initial?.invoice.notes ?? '')
  const [items, setItems] = useState<InvoiceItemDraft[]>(
    initial?.items.length
      ? initial.items.map(i => ({ ...i }))
      : [defaultItem(kleinunternehmer, 0)]
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const dueDateAutoRef = useRef(true)
  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    if (dueDateAutoRef.current) setDueDate(generateZahlungsziel(newDate, zahlungszielTage))
  }

  const leistungsdatum = useMemo(
    () => generateLeistungsdatum(date, profile.leistungszeitpunkt),
    [date, profile.leistungszeitpunkt]
  )
  const taxMode = getTaxMode(profile)
  const totals  = useMemo(() => calcTotals(items, kleinunternehmer), [items, kleinunternehmer])
  const account = accounts.find(a => a.id === accountId)

  const addItem = () => setItems(prev => [...prev, defaultItem(kleinunternehmer, prev.length, date)])
  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sortOrder: i })))
  const updateItem = (idx: number, patch: Partial<InvoiceItemDraft>) =>
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const next = { ...item, ...patch }
      next.taxRate = kleinunternehmer ? 0 : (next.taxRate || 19)
      next.total   = calcItemTotal(next, kleinunternehmer)
      return next
    }))

  const handleSave = async (asDraft: boolean) => {
    if (!accountId) { setError('Bitte Kunden auswählen'); return }
    if (items.length === 0 || items.every(i => !i.title)) { setError('Mindestens eine Position erforderlich'); return }
    setIsSaving(true); setError(null)
    try {
      const bankInfo = JSON.stringify({ iban: profile.iban ?? '' })
      const payload: UpsertInvoicePayload = {
        workspaceId, createdBy: user?.id ?? '', accountId, date, dueDate,
        status: asDraft ? 'draft' : 'open',
        taxMode, subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total,
        bankInfo, notes: notes || undefined,
        items: toUpsertItems(items),
      }
      if (initial) await updateInvoice(initial.invoice.id, payload)
      else         await createInvoice(payload)
      onSaved()
    } catch (e) { setError(String(e)) }
    finally { setIsSaving(false) }
  }

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

  const previewWrapRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(0.6)
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0]?.contentRect ?? { width: 600, height: 800 }
      setPreviewScale(Math.min((w - 48) / 794, (h - 48) / 1123, 1))
    })
    if (previewWrapRef.current) obs.observe(previewWrapRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'oklch(0% 0 0 / 0.55)',
      backdropFilter: 'blur(14px)',
      display: 'flex',
    }}>

      {/* ── LEFT: Form Panel ─────────────────────────────────────────────── */}
      <div style={{
        width: 'min(620px, 44vw)', flexShrink: 0, height: '100vh',
        background: '#f6f6f6', display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #e8e8e8',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '24px 28px 22px', background: '#fff',
          borderBottom: '1px solid #ebebeb', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
              {initial ? 'Bearbeiten' : 'Neue Rechnung'}
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: '#111', lineHeight: 1 }}>
              {account?.name ?? <span style={{ color: '#ccc', fontWeight: 400, fontStyle: 'italic' }}>Kunden wählen…</span>}
            </h2>
            {kleinunternehmer && (
              <span style={{
                display: 'inline-flex', marginTop: 8, fontSize: 10,
                color: 'oklch(38% 0.15 125)', background: 'oklch(92% 0.2 125 / 0.2)',
                padding: '3px 9px', borderRadius: 99,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                §19 UStG · Kleinunternehmer
              </span>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: '#f0f0f0', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#888', marginTop: 2,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Kunde */}
          <FieldBlock label="Kunde">
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="inv-input">
              <option value="">Kunden wählen…</option>
              {accounts.filter(a => !a.isPrivate).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </FieldBlock>

          {/* Datum */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldBlock label="Rechnungsdatum">
              <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} className="inv-input" />
            </FieldBlock>
            <FieldBlock label={`Zahlungsziel · ${zahlungszielTage}T`}>
              <input type="date" value={dueDate}
                onChange={e => { dueDateAutoRef.current = false; setDueDate(e.target.value) }}
                className="inv-input" />
            </FieldBlock>
          </div>

          {/* Leistungsdatum strip */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 10,
            background: '#fff', border: '1px solid #ebebeb',
          }}>
            <span style={{ fontSize: 10, color: '#bbb', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              Leistungsdatum
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#111', fontFamily: 'var(--font-mono)' }}>
                {formatDateDE(leistungsdatum)}
              </span>
              <span style={{
                fontSize: 9.5, color: 'oklch(38% 0.15 125)',
                background: 'oklch(92% 0.2 125 / 0.2)',
                padding: '2px 8px', borderRadius: 99,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
              }}>
                {profile.leistungszeitpunkt === 'monatsende' ? 'Monatsende' : 'Rechnungsdatum'}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#e4e4e4', margin: '-2px 0' }} />

          {/* Positionen */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Positionen
              </span>
              <span style={{ fontSize: 10, color: '#ccc', fontFamily: 'var(--font-mono)' }}>
                {items.length} {items.length === 1 ? 'Pos.' : 'Pos.'}
              </span>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 72px 100px 34px',
              gap: 6, padding: '0 14px',
              fontSize: 9.5, color: '#ccc', fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              <span>Bezeichnung</span>
              <span style={{ textAlign: 'right' }}>Menge</span>
              <span style={{ textAlign: 'right' }}>Preis €</span>
              <span />
            </div>

            <datalist id="cynera-units-inv">
              <option value="Stk." />
              <option value="Std." />
              <option value="Tag" />
              <option value="Monat" />
              <option value="Pauschal" />
            </datalist>

            {/* Item cards */}
            {items.map((item, idx) => (
              <div key={idx} style={{
                background: '#fff', borderRadius: 12, padding: '13px 14px',
                border: '1.5px solid #ebebeb',
                display: 'flex', flexDirection: 'column', gap: 9,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 100px 34px', gap: 6, alignItems: 'center' }}>
                  <input
                    value={item.title}
                    onChange={e => updateItem(idx, { title: e.target.value })}
                    placeholder="Bezeichnung"
                    className="inv-item-input"
                  />
                  <input type="number" value={item.quantity} min={0} step={0.5}
                    onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                    className="inv-item-input" style={{ textAlign: 'right' }} />
                  <input type="number" value={item.unitPrice} min={0} step={0.01}
                    onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="inv-item-input" style={{ textAlign: 'right' }} />
                  <button onClick={() => removeItem(idx)} className="inv-delete-btn" title="Entfernen">
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Description + tax + total */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    value={item.description ?? ''}
                    onChange={e => updateItem(idx, { description: e.target.value || undefined })}
                    placeholder="Beschreibung (optional)"
                    className="inv-item-input"
                    style={{ flex: 1, fontSize: 11.5, color: '#999' }}
                  />
                  {!kleinunternehmer && (
                    <select value={item.taxRate}
                      onChange={e => updateItem(idx, { taxRate: parseFloat(e.target.value) })}
                      className="inv-item-input"
                      style={{ width: 62, fontSize: 11.5, flexShrink: 0 }}>
                      <option value={19}>19%</option>
                      <option value={7}>7%</option>
                      <option value={0}>0%</option>
                    </select>
                  )}
                  <span style={{
                    fontSize: 13.5, fontWeight: 700, color: '#111',
                    fontVariantNumeric: 'tabular-nums', minWidth: 90,
                    textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0,
                  }}>
                    {fmt(item.total)}
                  </span>
                </div>
                {/* Date + Unit */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="date"
                    value={item.itemDate ?? date}
                    onChange={e => updateItem(idx, { itemDate: e.target.value || undefined })}
                    className="inv-item-input"
                    style={{ width: 130, fontSize: 11.5, color: '#777' }}
                  />
                  <input
                    value={item.unit ?? ''}
                    onChange={e => updateItem(idx, { unit: e.target.value || undefined })}
                    placeholder="Einheit…"
                    list="cynera-units-inv"
                    className="inv-item-input"
                    style={{ flex: 1, fontSize: 11.5, color: '#777' }}
                  />
                </div>
              </div>
            ))}

            <button onClick={addItem} className="inv-add-btn">
              <Plus size={13} /> Position hinzufügen
            </button>
          </div>

          {/* Totals */}
          <div style={{
            background: '#fff', borderRadius: 12, padding: '16px 18px',
            border: '1.5px solid #ebebeb', display: 'flex', flexDirection: 'column',
          }}>
            <TotalsRow label="Nettobetrag" value={fmt(totals.subtotal)} />
            {kleinunternehmer
              ? <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', padding: '5px 0' }}>
                  Kein USt-Ausweis gem. §19 UStG
                </div>
              : totals.taxBreakdown.map(tb => (
                  <TotalsRow key={tb.rate} label={`MwSt ${tb.rate}%`} value={fmt(tb.tax)} />
                ))
            }
            <div style={{ height: 1, background: '#ebebeb', margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{
                fontSize: 10, color: '#aaa', fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                Rechnungsbetrag
              </span>
              <span style={{
                fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em',
                color: '#111', fontVariantNumeric: 'tabular-nums',
              }}>
                {fmt(totals.total)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <FieldBlock label="Notizen (optional)">
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Zahlungshinweise, Referenzen…"
              className="inv-input" style={{ resize: 'vertical', lineHeight: 1.6 }}
            />
          </FieldBlock>

          {error && (
            <div style={{
              color: '#c0392b', fontSize: 12.5, padding: '10px 14px',
              background: '#fff5f5', borderRadius: 10, border: '1px solid #ffd5d5',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '16px 28px', borderTop: '1px solid #ebebeb',
          background: '#fff', flexShrink: 0,
        }}>
          <button onClick={() => handleSave(true)} disabled={isSaving} className="inv-ghost-btn">
            Als Entwurf
          </button>
          {isAdmin && (
            <button onClick={() => handleSave(false)} disabled={isSaving} className="inv-primary-btn">
              {isSaving ? 'Speichern…' : 'Rechnung erstellen →'}
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT: Live A4 Preview ────────────────────────────────────────── */}
      <div ref={previewWrapRef} style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', padding: '24px',
      }}>
        <div style={{ width: 794 * previewScale, height: 1123 * previewScale, flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, transformOrigin: 'top left', transform: `scale(${previewScale})`, width: 794 }}>
            <InvoiceA4Preview
              profile={profile}
              account={account ?? null}
              date={date}
              dueDate={dueDate}
              leistungsdatum={leistungsdatum}
              items={items}
              totals={totals}
              notes={notes}
              kleinunternehmer={kleinunternehmer}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── A4 Live Preview ───────────────────────────────────────────────────────────

interface PreviewAccount {
  name: string
  street?: string
  zip?: string
  city?: string
  country?: string
}

interface PreviewProps {
  profile: CompanyProfile
  account: PreviewAccount | null
  date: string
  dueDate: string
  leistungsdatum: string
  items: InvoiceItemDraft[]
  totals: ReturnType<typeof calcTotals>
  notes: string
  kleinunternehmer: boolean
}

function InvoiceA4Preview({ profile, account, date, dueDate, leistungsdatum, items, totals, notes, kleinunternehmer }: PreviewProps) {
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
  const address = account
    ? [account.street, `${account.zip ?? ''} ${account.city ?? ''}`.trim(), account.country].filter(Boolean).join(', ')
    : ''

  const legalParts: string[] = []
  if (profile.taxId)            legalParts.push(`USt-IdNr.: ${profile.taxId}`)
  if (profile.steuernummer)     legalParts.push(`StNr.: ${profile.steuernummer}`)
  if (profile.handelsregister && profile.registergericht)
    legalParts.push(`${profile.registergericht} · ${profile.handelsregister}`)
  if (profile.geschaeftsfuehrer) legalParts.push(`GF: ${profile.geschaeftsfuehrer}`)

  return (
    <div style={{
      width: 794, minHeight: 1123, background: '#fff',
      padding: '56px 64px', boxSizing: 'border-box',
      fontFamily: '-apple-system, "Helvetica Neue", Arial, sans-serif',
      fontSize: 13, color: '#111', lineHeight: 1.5,
      boxShadow: '0 4px 40px rgba(0,0,0,0.18)',
      borderRadius: 4, position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 5 }}>
            {profile.name || <span style={{ color: '#ccc' }}>Firmenname</span>}
          </div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7 }}>
            {profile.address && <div>{profile.address}</div>}
            {profile.email   && <div>{profile.email}{profile.phone ? ` · ${profile.phone}` : ''}</div>}
            {(profile.taxId || profile.steuernummer) && (
              <div>
                {profile.taxId        ? `USt-IdNr.: ${profile.taxId}` : ''}
                {profile.taxId && profile.steuernummer ? ' · ' : ''}
                {profile.steuernummer ? `StNr.: ${profile.steuernummer}` : ''}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: '#111' }}>RECHNUNG</div>
          <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', marginTop: 3 }}>Nummer wird automatisch vergeben</div>
        </div>
      </div>

      <div style={{ height: 1, background: '#e0e0e0', margin: '14px 0 22px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, gap: 40 }}>
        <div>
          <div style={{ fontSize: 9, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Rechnungsempfänger</div>
          {account
            ? <>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{account.name}</div>
                {address && <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{address}</div>}
              </>
            : <div style={{ fontSize: 13, color: '#ccc', fontStyle: 'italic' }}>Bitte Kunden wählen…</div>
          }
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 190 }}>
          {[
            { label: 'Rechnungsdatum', value: formatDateDE(date) },
            { label: 'Leistungsdatum', value: formatDateDE(leistungsdatum) },
            { label: 'Zahlbar bis',    value: formatDateDE(dueDate) },
          ].map(m => (
            <div key={m.label}>
              <div style={{ fontSize: 9, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {profile.invoiceIntro && (
        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7, marginBottom: 20, paddingBottom: 16, borderBottom: '0.5px solid #eee' }}>
          {profile.invoiceIntro}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #ddd' }}>
            <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 9.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Pos.</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Bezeichnung</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Menge</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Einzelpreis</th>
            {!kleinunternehmer && <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>MwSt</th>}
            <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 9.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {items.filter(i => i.title || i.unitPrice > 0).map((item, i) => (
            <tr key={i} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
              <td style={{ padding: '9px 0', color: '#bbb', fontSize: 11 }}>{i + 1}</td>
              <td style={{ padding: '9px 8px' }}>
                <div style={{ fontWeight: 500 }}>{item.title || <span style={{ color: '#ddd' }}>Bezeichnung…</span>}</div>
                {item.description && <div style={{ fontSize: 10.5, color: '#888', marginTop: 1 }}>{item.description}</div>}
              </td>
              <td style={{ textAlign: 'right', padding: '9px 8px', color: '#555' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', padding: '9px 8px', color: '#555' }}>{fmt(item.unitPrice)}</td>
              {!kleinunternehmer && <td style={{ textAlign: 'right', padding: '9px 8px', color: '#555' }}>{item.taxRate}%</td>}
              <td style={{ textAlign: 'right', padding: '9px 0', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(item.total)}</td>
            </tr>
          ))}
          {items.filter(i => i.title || i.unitPrice > 0).length === 0 && (
            <tr>
              <td colSpan={kleinunternehmer ? 5 : 6} style={{ padding: '20px 0', color: '#ccc', fontStyle: 'italic', fontSize: 12 }}>
                Noch keine Positionen…
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginBottom: 24 }}>
        <PreviewTotalRow label="Nettobetrag" value={fmt(totals.subtotal)} />
        {kleinunternehmer
          ? <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', padding: '2px 0' }}>
              Kein Umsatzsteuerausweis gem. §19 UStG
            </div>
          : totals.taxBreakdown.map(tb => (
              <PreviewTotalRow key={tb.rate} label={`MwSt ${tb.rate}%`} value={fmt(tb.tax)} />
            ))
        }
        <div style={{ height: 1, background: '#d0d0d0', width: 260, margin: '4px 0' }} />
        <PreviewTotalRow label="Rechnungsbetrag" value={fmt(totals.total)} bold />
      </div>

      {/* Payment section */}
      <div style={{ borderTop: '0.5px solid #eee', paddingTop: 16, marginBottom: 16 }}>
        {kleinunternehmer ? (
          <div style={{
            fontSize: 11, color: '#666', lineHeight: 1.75, fontStyle: 'italic',
            padding: '10px 14px', background: '#f9f9f9', borderRadius: 5,
            borderLeft: '3px solid #e4e4e4',
          }}>
            Gemäß §19 Umsatzsteuergesetz (UStG) wird keine Umsatzsteuer ausgewiesen.
            Diese Rechnung enthält daher keine Mehrwertsteuer.
          </div>
        ) : profile.iban ? (
          <div style={{ lineHeight: 1.8 }}>
            <div style={{ fontSize: 11.5, color: '#333', marginBottom: 5 }}>
              Bitte überweisen Sie den Rechnungsbetrag von{' '}
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.total)}</strong>{' '}
              bis zum <strong>{formatDateDE(dueDate)}</strong> unter Angabe der Rechnungsnummer als Verwendungszweck auf folgendes Konto:
            </div>
            <div style={{ fontSize: 11, color: '#555' }}>
              {profile.bankName && <><strong>{profile.bankName}</strong>{'  ·  '}</>}
              <strong style={{ fontFamily: 'monospace' }}>IBAN: {profile.iban}</strong>
            </div>
          </div>
        ) : null}
      </div>

      {/* Notes */}
      {notes && (
        <div style={{ fontSize: 11, color: '#555', borderTop: '0.5px solid #f0f0f0', paddingTop: 12, marginBottom: 16, lineHeight: 1.7 }}>
          {notes}
        </div>
      )}

      {/* Push footer to the very bottom */}
      <div style={{ flex: 1 }} />

      {/* Footer — centered, all company data, anchored at bottom */}
      <div style={{
        paddingTop: 18,
        borderTop: '0.5px solid #f0f0f0',
        textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        <div style={{ fontSize: 9.5, color: '#aaa' }}>
          {[profile.name, profile.address, profile.email, profile.phone]
            .filter(Boolean).join('  ·  ')}
        </div>
        {(profile.iban || profile.taxId || profile.steuernummer || profile.handelsregister || profile.geschaeftsfuehrer) && (
          <div style={{ fontSize: 8.5, color: '#c8c8c8' }}>
            {[
              profile.iban && `IBAN: ${profile.iban}`,
              profile.bankName || undefined,
              profile.taxId && `USt-IdNr.: ${profile.taxId}`,
              profile.steuernummer && `StNr.: ${profile.steuernummer}`,
              profile.handelsregister && profile.registergericht
                ? `${profile.registergericht} ${profile.handelsregister}`
                : profile.handelsregister || undefined,
              profile.geschaeftsfuehrer && `GF: ${profile.geschaeftsfuehrer}`,
            ].filter(Boolean).join('  ·  ')}
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewTotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 32 }}>
      <span style={{ fontSize: bold ? 13 : 11.5, fontWeight: bold ? 700 : 400, color: bold ? '#111' : '#777', width: 130, textAlign: 'right' }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 11.5, fontWeight: bold ? 700 : 400, fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5 }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ color: '#333', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}
