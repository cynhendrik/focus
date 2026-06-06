# Wiederkehrende Verträge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wiederkehrende Rechnungsvorlagen ("Verträge") als neuer Tab in Finanzen — mit frei wählbarem Intervall, automatischer Entwurfserstellung beim App-Start und vollständiger CRUD-Verwaltung.

**Architecture:** Verträge leben in einem Zustand-Store mit localStorage-Persistenz (gleiche Pattern wie `auftraege.store.ts`). Die Auto-Erstellung ruft `FinanceService.createInvoice()` direkt auf und wird beim Mount von `FinanceRoute` ausgelöst. Neuer Tab "Verträge" neben "Übersicht" und "Mahnwesen" in der bestehenden `FinanceRoute`.

**Tech Stack:** React 18, TypeScript, Zustand, localStorage, `FinanceService.createInvoice()`, `useAccountsStore`, `useCompanyStore`, `useToastStore`, Lucide icons, inline styles.

---

## File Map

| File | Action | Zweck |
|------|--------|-------|
| `src/types/vertrag.types.ts` | Create | Typen: `Vertrag`, `VertragItem`, `CreateVertragPayload` |
| `src/store/vertraege.store.ts` | Create | Zustand + localStorage, CRUD, `checkAndCreateDueInvoices` |
| `src/store/vertraege.store.test.ts` | Create | TDD: CRUD + Auto-Erstellung |
| `src/components/finance/VertragForm.tsx` | Create | Modal: Vertrag anlegen/bearbeiten |
| `src/components/finance/VertraegeTab.tsx` | Create | Tab-Inhalt: Karten-Liste + Verwaltung |
| `src/routes/FinanceRoute.tsx` | Modify | Tab "Verträge" + `checkAndCreateDueInvoices` beim Mount |

---

## Task 1: Typen

**Files:**
- Create: `src/types/vertrag.types.ts`

- [ ] **Step 1: Datei anlegen**

```ts
// src/types/vertrag.types.ts
import type { TaxMode } from '@/types/finance.types'

export type VertragStatus = 'active' | 'paused' | 'ended'
export type IntervalUnit  = 'days' | 'weeks' | 'months' | 'years'

export interface VertragItem {
  title:     string
  quantity:  number
  unitPrice: number  // netto
  taxRate:   number  // 0 | 7 | 19
}

export interface Vertrag {
  id:              string
  accountId:       string
  title:           string
  intervalValue:   number        // z.B. 1, 3, 6
  intervalUnit:    IntervalUnit
  startDate:       string        // ISO date YYYY-MM-DD
  nextBillingDate: string        // ISO date — wann nächste Rechnung fällig
  endDate:         string | null
  status:          VertragStatus
  taxMode:         TaxMode
  notes:           string
  items:           VertragItem[]
  createdAt:       string
}

export interface CreateVertragPayload {
  accountId:     string
  title:         string
  intervalValue: number
  intervalUnit:  IntervalUnit
  startDate:     string
  endDate:       string | null
  taxMode:       TaxMode
  notes:         string
  items:         VertragItem[]
}

export function addInterval(dateISO: string, value: number, unit: IntervalUnit): string {
  const d = new Date(dateISO)
  if (unit === 'days')   d.setDate(d.getDate() + value)
  if (unit === 'weeks')  d.setDate(d.getDate() + value * 7)
  if (unit === 'months') d.setMonth(d.getMonth() + value)
  if (unit === 'years')  d.setFullYear(d.getFullYear() + value)
  return d.toLocaleDateString('sv')
}

export function intervalLabel(value: number, unit: IntervalUnit): string {
  const units: Record<IntervalUnit, [string, string]> = {
    days:   ['Tag',   'Tage'],
    weeks:  ['Woche', 'Wochen'],
    months: ['Monat', 'Monate'],
    years:  ['Jahr',  'Jahre'],
  }
  const [sg, pl] = units[unit]
  return `alle ${value} ${value === 1 ? sg : pl}`
}

export function calcVertragTotals(items: VertragItem[], taxMode: TaxMode) {
  const kleinunternehmer = taxMode === 'kleinunternehmer'
  const subtotal  = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice * 100) / 100, 0)
  const taxAmount = kleinunternehmer
    ? 0
    : items.reduce((s, i) => {
        const net = Math.round(i.quantity * i.unitPrice * 100) / 100
        return s + Math.round(net * (i.taxRate / 100) * 100) / 100
      }, 0)
  return { subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxAmount * 100) / 100, total: Math.round((subtotal + taxAmount) * 100) / 100 }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep vertrag.types
```

Expected: keine Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add src/types/vertrag.types.ts
git commit -m "feat(vertraege): Typen — Vertrag, VertragItem, Hilfsfunktionen"
```

---

## Task 2: Store mit TDD

**Files:**
- Create: `src/store/vertraege.store.ts`
- Create: `src/store/vertraege.store.test.ts`

**Kontext:** `FinanceService.createInvoice()` wird direkt importiert. Der Store braucht `workspaceId` und `userId` als Parameter für `checkAndCreateDueInvoices`.

- [ ] **Step 1: Test schreiben**

```ts
// src/store/vertraege.store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CreateVertragPayload } from '@/types/vertrag.types'

const storage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem:  (k: string) => storage[k] ?? null,
  setItem:  (k: string, v: string) => { storage[k] = v },
  removeItem: (k: string) => { delete storage[k] },
})

// Mock FinanceService
vi.mock('@/services/finance.service', () => ({
  FinanceService: {
    createInvoice: vi.fn().mockResolvedValue({ invoice: { id: 'inv_mock' }, items: [] }),
  },
}))

const base: CreateVertragPayload = {
  accountId: 'acc1', title: 'Retainer', intervalValue: 1, intervalUnit: 'months',
  startDate: '2026-06-01', endDate: null, taxMode: 'standard', notes: '',
  items: [{ title: 'Beratung', quantity: 1, unitPrice: 2000, taxRate: 19 }],
}

describe('vertraege store', () => {
  beforeEach(async () => {
    Object.keys(storage).forEach(k => delete storage[k])
    vi.clearAllMocks()
    const { useVertraege } = await import('./vertraege.store')
    useVertraege.setState({ vertraege: [] })
  })

  it('createVertrag legt Vertrag an mit nextBillingDate = startDate', async () => {
    const { useVertraege } = await import('./vertraege.store')
    useVertraege.getState().createVertrag(base)
    const { vertraege } = useVertraege.getState()
    expect(vertraege).toHaveLength(1)
    expect(vertraege[0].nextBillingDate).toBe('2026-06-01')
    expect(vertraege[0].status).toBe('active')
  })

  it('checkAndCreateDueInvoices erstellt Rechnung wenn fällig', async () => {
    const { useVertraege } = await import('./vertraege.store')
    const { FinanceService } = await import('@/services/finance.service')
    useVertraege.getState().createVertrag({ ...base, startDate: '2026-05-01' })
    // nextBillingDate = '2026-05-01' which is in the past
    const count = await useVertraege.getState().checkAndCreateDueInvoices('ws1', 'u1')
    expect(count).toBeGreaterThan(0)
    expect(FinanceService.createInvoice).toHaveBeenCalled()
  })

  it('checkAndCreateDueInvoices überspringt nicht-fällige Verträge', async () => {
    const { useVertraege } = await import('./vertraege.store')
    const { FinanceService } = await import('@/services/finance.service')
    useVertraege.getState().createVertrag({ ...base, startDate: '2099-01-01' })
    const count = await useVertraege.getState().checkAndCreateDueInvoices('ws1', 'u1')
    expect(count).toBe(0)
    expect(FinanceService.createInvoice).not.toHaveBeenCalled()
  })

  it('checkAndCreateDueInvoices aktualisiert nextBillingDate nach Erstellung', async () => {
    const { useVertraege } = await import('./vertraege.store')
    useVertraege.getState().createVertrag({ ...base, startDate: '2026-05-01' })
    await useVertraege.getState().checkAndCreateDueInvoices('ws1', 'u1')
    const { vertraege } = useVertraege.getState()
    // nextBillingDate muss in der Zukunft liegen
    expect(vertraege[0].nextBillingDate > new Date().toLocaleDateString('sv')).toBe(true)
  })
})
```

- [ ] **Step 2: Tests fehlschlagen lassen**

```bash
npx vitest run src/store/vertraege.store.test.ts 2>&1 | tail -5
```

Expected: "Cannot find module './vertraege.store'"

- [ ] **Step 3: Store implementieren**

```ts
// src/store/vertraege.store.ts
import { create } from 'zustand'
import { FinanceService } from '@/services/finance.service'
import { addInterval, calcVertragTotals } from '@/types/vertrag.types'
import type { Vertrag, VertragStatus, CreateVertragPayload } from '@/types/vertrag.types'

const KEY = 'cynera-vertraege-v1'

function load(): Vertrag[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function save(data: Vertrag[]) { localStorage.setItem(KEY, JSON.stringify(data)) }
function uid() { return `vtg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
function todayISO() { return new Date().toLocaleDateString('sv') }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv')
}

interface VertraegeState {
  vertraege: Vertrag[]
  createVertrag:   (payload: CreateVertragPayload) => void
  updateVertrag:   (id: string, partial: Partial<Pick<Vertrag, 'title' | 'accountId' | 'intervalValue' | 'intervalUnit' | 'startDate' | 'endDate' | 'status' | 'taxMode' | 'notes' | 'items' | 'nextBillingDate'>>) => void
  deleteVertrag:   (id: string) => void
  checkAndCreateDueInvoices: (workspaceId: string, userId: string) => Promise<number>
}

export const useVertraege = create<VertraegeState>()((set, get) => ({
  vertraege: load(),

  createVertrag(payload) {
    const v: Vertrag = {
      id: uid(), ...payload,
      nextBillingDate: payload.startDate,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const next = [v, ...get().vertraege]
    save(next); set({ vertraege: next })
  },

  updateVertrag(id, partial) {
    const next = get().vertraege.map(v => v.id === id ? { ...v, ...partial } : v)
    save(next); set({ vertraege: next })
  },

  deleteVertrag(id) {
    const next = get().vertraege.filter(v => v.id !== id)
    save(next); set({ vertraege: next })
  },

  async checkAndCreateDueInvoices(workspaceId, userId) {
    const today = todayISO()
    const active = get().vertraege.filter(v => {
      if (v.status !== 'active') return false
      if (v.endDate && v.endDate < today) return false
      return v.nextBillingDate <= today
    })

    let count = 0
    for (const vertrag of active) {
      let next = vertrag.nextBillingDate
      while (next <= today) {
        const totals = calcVertragTotals(vertrag.items, vertrag.taxMode)
        await FinanceService.createInvoice({
          workspaceId,
          createdBy: userId,
          accountId: vertrag.accountId,
          date: next,
          dueDate: addDays(next, 14),
          status: 'draft',
          taxMode: vertrag.taxMode,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          notes: vertrag.notes || undefined,
          items: vertrag.items.map((item, i) => ({
            title:     item.title,
            quantity:  item.quantity,
            unitPrice: item.unitPrice,
            taxRate:   item.taxRate,
            total:     Math.round(item.quantity * item.unitPrice * (1 + item.taxRate / 100) * 100) / 100,
            sortOrder: i,
          })),
        })
        count++
        next = addInterval(next, vertrag.intervalValue, vertrag.intervalUnit)
        // Sicherheitsstopp: max 24 Iterationen pro Vertrag
        if (count > 24) break
      }
      get().updateVertrag(vertrag.id, { nextBillingDate: next })
    }
    return count
  },
}))
```

- [ ] **Step 4: Tests bestehen**

```bash
npx vitest run src/store/vertraege.store.test.ts 2>&1 | tail -10
```

Expected: 4 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add src/store/vertraege.store.ts src/store/vertraege.store.test.ts
git commit -m "feat(vertraege): Store — CRUD, checkAndCreateDueInvoices, addInterval"
```

---

## Task 3: VertragForm Modal

**Files:**
- Create: `src/components/finance/VertragForm.tsx`

**Kontext:**
- `useAccountsStore(s => s.accounts)` — Account hat `id`, `name`, `isPrivate`
- `useCompanyStore(s => s.profile).kleinunternehmer` — Default-Steuermodus
- `TaxMode` aus `@/types/finance.types`: `'standard' | 'reduced' | 'reverse_charge' | 'kleinunternehmer'`
- `IntervalUnit`: `'days' | 'weeks' | 'months' | 'years'`

- [ ] **Step 1: Komponente anlegen**

```tsx
// src/components/finance/VertragForm.tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useVertraege } from '@/store/vertraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import type { Vertrag, VertragItem, IntervalUnit } from '@/types/vertrag.types'
import type { TaxMode } from '@/types/finance.types'

interface Props {
  vertrag?: Vertrag
  onClose: () => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
  color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
  display: 'block', marginBottom: 4,
}

function defaultDueDate() {
  const d = new Date(); d.setDate(d.getDate() + 14); return d.toLocaleDateString('sv')
}

export function VertragForm({ vertrag, onClose }: Props) {
  const createVertrag = useVertraege(s => s.createVertrag)
  const updateVertrag = useVertraege(s => s.updateVertrag)
  const accounts      = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const profile       = useCompanyStore(s => s.profile)
  const defaultTax: TaxMode = profile.kleinunternehmer ? 'kleinunternehmer' : 'standard'

  const [accountId,     setAccountId]     = useState(vertrag?.accountId     ?? '')
  const [title,         setTitle]         = useState(vertrag?.title          ?? '')
  const [intervalValue, setIntervalValue] = useState(vertrag?.intervalValue  ?? 1)
  const [intervalUnit,  setIntervalUnit]  = useState<IntervalUnit>(vertrag?.intervalUnit ?? 'months')
  const [startDate,     setStartDate]     = useState(vertrag?.startDate      ?? defaultDueDate())
  const [endDate,       setEndDate]       = useState(vertrag?.endDate        ?? '')
  const [hasEndDate,    setHasEndDate]    = useState(!!vertrag?.endDate)
  const [taxMode,       setTaxMode]       = useState<TaxMode>(vertrag?.taxMode ?? defaultTax)
  const [notes,         setNotes]         = useState(vertrag?.notes          ?? '')
  const [items,         setItems]         = useState<VertragItem[]>(
    vertrag?.items ?? [{ title: '', quantity: 1, unitPrice: 0, taxRate: taxMode === 'kleinunternehmer' ? 0 : 19 }]
  )

  const canSave = title.trim() && accountId && intervalValue > 0 && items.some(i => i.title.trim())

  const addItem = () =>
    setItems(prev => [...prev, { title: '', quantity: 1, unitPrice: 0, taxRate: taxMode === 'kleinunternehmer' ? 0 : 19 }])

  const updateItem = (idx: number, patch: Partial<VertragItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))

  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    if (!canSave) return
    const payload = {
      accountId, title: title.trim(), intervalValue, intervalUnit,
      startDate, endDate: hasEndDate && endDate ? endDate : null,
      taxMode, notes: notes.trim(),
      items: items.filter(i => i.title.trim()),
    }
    if (vertrag) {
      updateVertrag(vertrag.id, payload)
    } else {
      createVertrag(payload)
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 28, width: 520,
        display: 'flex', flexDirection: 'column', gap: 18,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {vertrag ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}
        </h2>

        {/* Kunde + Titel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Kunde</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inp}>
              <option value="">Kunden wählen…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Bezeichnung</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Retainer SEO" style={inp} />
          </div>
        </div>

        {/* Intervall */}
        <div>
          <label style={lbl}>Abrechnungsintervall</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0 }}>alle</span>
            <input
              type="number" value={intervalValue} min={1}
              onChange={e => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ ...inp, width: 72 }}
            />
            <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value as IntervalUnit)} style={inp}>
              <option value="days">Tage</option>
              <option value="weeks">Wochen</option>
              <option value="months">Monate</option>
              <option value="years">Jahre</option>
            </select>
          </div>
        </div>

        {/* Datum */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Erste Abrechnung</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Enddatum</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={hasEndDate} onChange={e => setHasEndDate(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Festlegen</span>
              {hasEndDate && (
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  style={{ ...inp, flex: 1 }} />
              )}
            </div>
          </div>
        </div>

        {/* Positionen */}
        <div>
          <label style={lbl}>Positionen</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 60px auto', gap: 6 }}>
                <input value={item.title} onChange={e => updateItem(idx, { title: e.target.value })}
                  placeholder="Leistung" style={inp} />
                <input type="number" value={item.quantity} min={0.01} step={0.01}
                  onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 1 })}
                  style={{ ...inp, textAlign: 'center' }} placeholder="Mge" />
                <div style={{ position: 'relative' }}>
                  <input type="number" value={item.unitPrice || ''} min={0}
                    onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                    style={{ ...inp, paddingRight: 22 }} placeholder="Preis" />
                  <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--fg-dim)', pointerEvents: 'none' }}>€</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input type="number" value={item.taxRate} min={0} max={100}
                    onChange={e => updateItem(idx, { taxRate: parseInt(e.target.value) || 0 })}
                    style={{ ...inp, paddingRight: 18 }} placeholder="MwSt" />
                  <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--fg-dim)', pointerEvents: 'none' }}>%</span>
                </div>
                <button onClick={() => removeItem(idx)} style={{
                  width: 32, height: 32, borderRadius: 7, border: 'none',
                  background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button onClick={addItem} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
              borderRadius: 8, border: '1px dashed var(--border)',
              background: 'transparent', color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer',
            }}>
              <Plus size={12} /> Position hinzufügen
            </button>
          </div>
        </div>

        {/* Notizen */}
        <div>
          <label style={lbl}>Notizen (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Interne Notizen…" style={inp} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 99, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer',
          }}>Abbrechen</button>
          <button onClick={handleSave} disabled={!canSave} style={{
            padding: '9px 24px', borderRadius: 99, border: 'none',
            background: canSave ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            color: canSave ? 'var(--accent-ink)' : 'var(--fg-dim)',
            fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed',
          }}>
            {vertrag ? 'Speichern' : 'Vertrag anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep VertragForm
```

Expected: keine Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/VertragForm.tsx
git commit -m "feat(vertraege): VertragForm Modal — Intervall, Positionen, Enddatum"
```

---

## Task 4: VertraegeTab

**Files:**
- Create: `src/components/finance/VertraegeTab.tsx`

**Kontext:**
- `useVertraege` aus `@/store/vertraege.store`
- `useAccountsStore(s => s.accounts)` für Kundennamen
- `intervalLabel` und `calcVertragTotals` aus `@/types/vertrag.types`
- Status-Farben: `active` = lime, `paused` = grau, `ended` = grau

- [ ] **Step 1: Komponente anlegen**

```tsx
// src/components/finance/VertraegeTab.tsx
import { useState } from 'react'
import { Plus, Edit2, Trash2, Pause, Play } from 'lucide-react'
import { useVertraege } from '@/store/vertraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import { intervalLabel, calcVertragTotals } from '@/types/vertrag.types'
import { VertragForm } from './VertragForm'
import type { Vertrag } from '@/types/vertrag.types'

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function VertraegeTab() {
  const vertraege    = useVertraege(s => s.vertraege)
  const deleteVertrag = useVertraege(s => s.deleteVertrag)
  const updateVertrag = useVertraege(s => s.updateVertrag)
  const accounts     = useAccountsStore(s => s.accounts)

  const [showForm,    setShowForm]    = useState(false)
  const [editVertrag, setEditVertrag] = useState<Vertrag | null>(null)

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  const statusColor = (s: Vertrag['status']) =>
    s === 'active' ? 'var(--accent)' : 'var(--fg-dim)'

  const statusLabel = (s: Vertrag['status']) =>
    s === 'active' ? 'AKTIV' : s === 'paused' ? 'PAUSIERT' : 'BEENDET'

  return (
    <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Verträge</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
            Wiederkehrende Rechnungen werden automatisch als Entwurf erstellt.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
          borderRadius: 10, border: 'none', background: 'var(--accent)',
          color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} /> Neuer Vertrag
        </button>
      </div>

      {/* Liste */}
      {vertraege.length === 0 ? (
        <div style={{
          padding: '64px 0', textAlign: 'center', color: 'var(--fg-dim)',
          border: '1px dashed var(--border)', borderRadius: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6 }}>
            Noch keine Verträge
          </div>
          <div style={{ fontSize: 12 }}>
            Lege einen Vertrag an — Rechnungen werden automatisch erstellt.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vertraege.map(v => {
            const totals = calcVertragTotals(v.items, v.taxMode)
            return (
              <div key={v.id} style={{
                padding: '16px 20px', borderRadius: 14,
                border: '1px solid var(--border)', background: 'var(--bg-2)',
                display: 'flex', alignItems: 'center', gap: 16,
                opacity: v.status === 'ended' ? 0.5 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{v.title}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 99,
                      background: `${statusColor(v.status)}18`,
                      color: statusColor(v.status),
                      fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em',
                    }}>
                      {statusLabel(v.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'flex', gap: 10 }}>
                    <span>{accountName(v.accountId)}</span>
                    <span>·</span>
                    <span>{intervalLabel(v.intervalValue, v.intervalUnit)}</span>
                    {v.status === 'active' && (
                      <>
                        <span>·</span>
                        <span>nächste: {relDate(v.nextBillingDate)}</span>
                      </>
                    )}
                    {v.endDate && (
                      <>
                        <span>·</span>
                        <span>bis {relDate(v.endDate)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
                    {fmtEur(totals.total)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>brutto</div>
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setEditVertrag(v)} style={{
                    width: 30, height: 30, borderRadius: 7, border: 'none',
                    background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Edit2 size={13} />
                  </button>
                  {v.status !== 'ended' && (
                    <button
                      onClick={() => updateVertrag(v.id, { status: v.status === 'active' ? 'paused' : 'active' })}
                      title={v.status === 'active' ? 'Pausieren' : 'Fortsetzen'}
                      style={{
                        width: 30, height: 30, borderRadius: 7, border: 'none',
                        background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {v.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                  )}
                  <button onClick={() => {
                    if (confirm(`Vertrag "${v.title}" löschen?`)) deleteVertrag(v.id)
                  }} style={{
                    width: 30, height: 30, borderRadius: 7, border: 'none',
                    background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm    && <VertragForm onClose={() => setShowForm(false)} />}
      {editVertrag && <VertragForm vertrag={editVertrag} onClose={() => setEditVertrag(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep VertraegeTab
```

Expected: keine Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/VertraegeTab.tsx
git commit -m "feat(vertraege): VertraegeTab — Karten, Pause/Fortsetzen, Edit, Delete"
```

---

## Task 5: FinanceRoute — Tab + Auto-Erstellung

**Files:**
- Modify: `src/routes/FinanceRoute.tsx`

**Kontext:**
- Aktuelle Tab-Typen: `'uebersicht' | 'mahnwesen'` (lokaler State, Zeile ~347)
- Tab-Bar bei Zeile ~471
- Tab-Content bei Zeile ~504
- `useAuthStore(s => s.user?.id)` für `userId`
- `useToastStore(s => s.show)` für Benachrichtigungen
- `useVertraege` aus `@/store/vertraege.store`

- [ ] **Step 1: Imports hinzufügen**

Am Anfang der Datei nach den bestehenden Imports:

```ts
import { useVertraege } from '@/store/vertraege.store'
import { useToastStore } from '@/store/toast.store'
import { VertraegeTab } from '@/components/finance/VertraegeTab'
```

- [ ] **Step 2: Tab-Typ + State + Auto-Check einbauen**

In `FinanceRoute()` — den bestehenden Tab-State:

```ts
const [financeTab, setFinanceTab] = useState<'uebersicht' | 'mahnwesen'>('uebersicht')
```

ersetzen durch:

```ts
const [financeTab, setFinanceTab] = useState<'uebersicht' | 'mahnwesen' | 'vertraege'>('uebersicht')
const checkAndCreate = useVertraege(s => s.checkAndCreateDueInvoices)
const showToast      = useToastStore(s => s.show)
const userId         = useAuthStore(s => s.user?.id) ?? ''
```

Und nach `useEffect(() => { if (workspaceId) loadAll(workspaceId) }, ...)` einen weiteren useEffect:

```ts
useEffect(() => {
  if (!workspaceId || !userId) return
  checkAndCreate(workspaceId, userId).then(count => {
    if (count > 0) {
      showToast({
        message: `${count} Rechnung${count > 1 ? 'en' : ''} aus Vertrag${count > 1 ? 'rägen' : ''} erstellt (Entwurf).`,
        variant: 'success',
      })
      loadAll(workspaceId)
    }
  }).catch(() => {})
}, [workspaceId, userId])
```

- [ ] **Step 3: Tab-Button hinzufügen**

Den bestehenden Tab-Array (bei Zeile ~471) von:

```ts
{ key: 'uebersicht', label: 'Übersicht' },
{ key: 'mahnwesen',  label: 'Mahnwesen', badge: overdueInvoices.length || undefined },
```

auf:

```ts
{ key: 'uebersicht', label: 'Übersicht' },
{ key: 'mahnwesen',  label: 'Mahnwesen', badge: overdueInvoices.length || undefined },
{ key: 'vertraege',  label: 'Verträge', badge: vertraege.filter(v => v.status === 'active').length || undefined },
```

Und `vertraege` aus dem Store holen — nach den anderen Store-Selektoren:

```ts
const vertraege = useVertraege(s => s.vertraege)
```

- [ ] **Step 4: Tab-Content hinzufügen**

Direkt nach `{financeTab === 'mahnwesen' && <MahnwesenPanel />}`:

```tsx
{financeTab === 'vertraege' && <VertraegeTab />}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "slashMenu\|ArbeitsraumPane" | grep "error TS"
```

Expected: 0 Fehler.

- [ ] **Step 6: Alle Tests bestehen**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: alle Tests grün.

- [ ] **Step 7: Commit**

```bash
git add src/routes/FinanceRoute.tsx
git commit -m "feat(vertraege): FinanceRoute — Verträge-Tab + Auto-Erstellung beim Mount"
```

---

## Selbst-Review

**Spec-Abdeckung:**
- ✅ Kein PDF/Vertragsdokument — nur Vorlage
- ✅ Auto-Erstellung beim App-Start (FinanceRoute Mount)
- ✅ Frei wählbares Intervall (Zahl + Einheit)
- ✅ Mehrfach-übersprungene Perioden (while-Loop in `checkAndCreateDueInvoices`)
- ✅ localStorage-Persistenz (gleiche Pattern wie Aufträge)
- ✅ Tab in Finanzen (nicht eigener Nav-Eintrag)
- ✅ Pause/Fortsetzen und Löschen
- ✅ Enddatum optional
- ✅ Toast-Benachrichtigung bei Auto-Erstellung

**Type-Konsistenz:**
- `Vertrag`, `VertragItem`, `CreateVertragPayload`, `addInterval`, `intervalLabel`, `calcVertragTotals` — alle in Task 1 definiert und konsistent in Tasks 2-5 verwendet.
- `IntervalUnit` als `'days' | 'weeks' | 'months' | 'years'` durchgängig.
