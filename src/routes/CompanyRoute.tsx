import { useEffect, useState } from 'react'
import { useCompanyStore } from '@/store/company.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FinanceService } from '@/services/finance.service'
import type { CompanyProfile } from '@/types/company.types'

export function CompanyRoute() {
  const profile      = useCompanyStore(s => s.profile)
  const load         = useCompanyStore(s => s.load)
  const saveProfile  = useCompanyStore(s => s.saveProfile)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const [form, setForm] = useState<CompanyProfile>({})
  const [saved, setSaved] = useState(false)

  // Invoice sequence state
  const [nextNumber,  setNextNumber]  = useState(0)
  const [startNumber, setStartNumber] = useState(1)
  const [startInput,  setStartInput]  = useState('1')
  const [seqSaved,    setSeqSaved]    = useState(false)
  const [seqError,    setSeqError]    = useState<string | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => { setForm(profile) }, [profile])

  useEffect(() => {
    if (!workspaceId) return
    FinanceService.getInvoiceSequence(workspaceId).then(([next, start]) => {
      setNextNumber(next)
      setStartNumber(start)
      setStartInput(String(start))
    }).catch(() => {})
  }, [workspaceId])

  const handleSaveProfile = async () => {
    await saveProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveStartNumber = async () => {
    const n = parseInt(startInput, 10)
    if (!n || n < 1) { setSeqError('Muss eine positive Zahl sein.'); return }
    if (n <= nextNumber) {
      setSeqError(`Bereits ${nextNumber} Rechnungen ausgestellt. Start muss > ${nextNumber} sein.`)
      return
    }
    setSeqError(null)
    await FinanceService.setInvoiceStartNumber(workspaceId, n)
    const [next, start] = await FinanceService.getInvoiceSequence(workspaceId)
    setNextNumber(next); setStartNumber(start); setStartInput(String(start))
    setSeqSaved(true)
    setTimeout(() => setSeqSaved(false), 2000)
  }

  const year = new Date().getFullYear()
  const previewNext = parseInt(startInput, 10) > 0
    ? `${year}-${String(parseInt(startInput, 10)).padStart(5, '0')}`
    : '—'

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">Mein Unternehmen</h1>

      {/* Profile */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Unternehmensprofil</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['name', 'address', 'phone', 'email', 'website', 'taxId'] as (keyof CompanyProfile)[]).map(field => (
            <input
              key={field}
              placeholder={fieldLabel(field)}
              value={(form[field] as string) ?? ''}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveProfile}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            Speichern
          </button>
          {saved && <span className="text-sm text-green-500">Gespeichert ✓</span>}
        </div>
      </section>

      {/* Invoice number start */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Rechnungsnummern</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          Lege fest, bei welcher Nummer die erste Rechnung beginnt. Das Format ist immer <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{year}-00001</code>.{' '}
          Wenn du z.&nbsp;B. bereits 499 Rechnungen außerhalb dieser App ausgestellt hast, starte hier bei <strong>500</strong>.
        </p>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Startnummer
            </label>
            <input
              type="number"
              min={1}
              value={startInput}
              onChange={e => { setStartInput(e.target.value); setSeqError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSaveStartNumber()}
              style={{
                width: 120, padding: '8px 12px', borderRadius: 8,
                border: seqError ? '1px solid var(--danger)' : '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--fg)',
                fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Nächste Rechnung
            </label>
            <div style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--fg-muted)',
              fontSize: 14, fontFamily: 'var(--font-mono)', minWidth: 140,
            }}>
              {previewNext}
            </div>
          </div>

          <button
            onClick={handleSaveStartNumber}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 0,
            }}
          >
            Übernehmen
          </button>

          {seqSaved && (
            <span style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 600 }}>✓ Gespeichert</span>
          )}
        </div>

        {seqError && (
          <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{seqError}</p>
        )}

        {nextNumber > 0 && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: 0 }}>
            Bisher ausgestellte Rechnungen: <strong style={{ color: 'var(--fg-muted)' }}>{nextNumber}</strong>
          </p>
        )}
      </section>
    </div>
  )
}

function fieldLabel(field: keyof CompanyProfile): string {
  const labels: Partial<Record<keyof CompanyProfile, string>> = {
    name: 'Firmenname', address: 'Adresse', phone: 'Telefon',
    email: 'E-Mail', website: 'Website', taxId: 'USt-IdNr.',
    iban: 'IBAN', bic: 'BIC', bankName: 'Bank',
  }
  return labels[field] ?? String(field)
}
