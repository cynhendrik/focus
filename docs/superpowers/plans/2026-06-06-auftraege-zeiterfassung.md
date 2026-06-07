# Aufträge & Zeiterfassung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufträge (Projekte) pro Kunde anlegen, Zeit darauf buchen, und per Knopfdruck als Rechnung abrechnen — mit klarem "nicht abgerechnet"-Status.

**Architecture:** Aufträge und Zeiteinträge leben in einem Zustand-Store mit localStorage-Persistenz (gleiche Pattern wie bisherige Zeiterfassung). Invoice-Erstellung nutzt den bestehenden `FinanceService.createInvoice()`. ZeitmanagementRoute wird komplett neu gebaut: Aufträge als primäre Entität, Zeiteinträge hängen dran.

**Tech Stack:** React 18, TypeScript, Zustand, localStorage, `FinanceService.createInvoice()`, `useWorkspaceStore`, `useAuthStore`, `useAccountsStore`, Lucide icons, inline styles (Codebase-Pattern).

---

## File Map

| File | Action | Verantwortlichkeit |
|------|--------|--------------------|
| `src/types/auftrag.types.ts` | Create | Alle Typen: Auftrag, Zeiteintrag, Payloads |
| `src/store/auftraege.store.ts` | Create | Zustand-Store mit localStorage, CRUD für Aufträge + Zeiteinträge |
| `src/components/zeitmanagement/AuftragForm.tsx` | Create | Modal: Auftrag anlegen/bearbeiten |
| `src/components/zeitmanagement/ZeiterfassungForm.tsx` | Create | Inline-Formular: Zeit auf Auftrag buchen |
| `src/components/zeitmanagement/AuftragAbrechnen.tsx` | Create | Modal: Auftrag → Rechnung, zeigt Zeiteinträge + Summe |
| `src/routes/ZeitmanagementRoute.tsx` | Modify | Komplett neu: Auftragsliste + Zeiteinträge je Auftrag |

---

## Task 1: Typen

**Files:**
- Create: `src/types/auftrag.types.ts`

- [ ] **Step 1: Datei anlegen**

```ts
// src/types/auftrag.types.ts

export type AuftragStatus = 'active' | 'completed' | 'billed'
export type AuftragType   = 'hourly' | 'fixed'

export interface Auftrag {
  id:          string
  accountId:   string         // Kundenzuordnung
  title:       string
  type:        AuftragType
  hourlyRate:  number | null  // nur wenn type === 'hourly'
  fixedAmount: number | null  // nur wenn type === 'fixed'
  status:      AuftragStatus
  notes:       string
  createdAt:   string         // ISO
}

export interface Zeiteintrag {
  id:          string
  auftragId:   string
  date:        string    // ISO date YYYY-MM-DD
  minutes:     number
  description: string
  billed:      boolean
  invoiceId:   string | null  // gesetzt nach Abrechnung
}

export interface CreateAuftragPayload {
  accountId:   string
  title:       string
  type:        AuftragType
  hourlyRate:  number | null
  fixedAmount: number | null
  notes:       string
}

export interface AddZeiteintragPayload {
  auftragId:   string
  date:        string
  minutes:     number
  description: string
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep auftrag.types
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/types/auftrag.types.ts
git commit -m "feat(auftraege): Typen — Auftrag, Zeiteintrag, Payloads"
```

---

## Task 2: Store

**Files:**
- Create: `src/store/auftraege.store.ts`
- Test: `src/store/auftraege.store.test.ts`

- [ ] **Step 1: Test schreiben (wird zuerst fehlschlagen)**

```ts
// src/store/auftraege.store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'

// localStorage mocken
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem:  (k: string) => store[k] ?? null,
  setItem:  (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

describe('auftraege store', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    // Store-State zurücksetzen
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.setState({ auftraege: [], zeiteintraege: [] })
  })

  it('createAuftrag legt Auftrag an', () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({
      accountId: 'acc1', title: 'Website', type: 'hourly',
      hourlyRate: 90, fixedAmount: null, notes: '',
    })
    const { auftraege } = useAuftraege.getState()
    expect(auftraege).toHaveLength(1)
    expect(auftraege[0].title).toBe('Website')
    expect(auftraege[0].status).toBe('active')
  })

  it('addZeiteintrag bucht Zeit auf Auftrag', () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({
      accountId: 'acc1', title: 'Test', type: 'hourly',
      hourlyRate: 100, fixedAmount: null, notes: '',
    })
    const { auftraege } = useAuftraege.getState()
    useAuftraege.getState().addZeiteintrag({
      auftragId: auftraege[0].id, date: '2026-06-06',
      minutes: 90, description: 'Setup',
    })
    const { zeiteintraege } = useAuftraege.getState()
    expect(zeiteintraege).toHaveLength(1)
    expect(zeiteintraege[0].billed).toBe(false)
    expect(zeiteintraege[0].minutes).toBe(90)
  })

  it('markBilled setzt alle Einträge des Auftrags auf billed', () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({
      accountId: 'acc1', title: 'Test', type: 'hourly',
      hourlyRate: 100, fixedAmount: null, notes: '',
    })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, date: '2026-06-06', minutes: 60, description: 'A' })
    useAuftraege.getState().addZeiteintrag({ auftragId: id, date: '2026-06-06', minutes: 30, description: 'B' })
    useAuftraege.getState().markBilled(id, 'inv_123')
    const { auftraege, zeiteintraege } = useAuftraege.getState()
    expect(auftraege[0].status).toBe('billed')
    expect(zeiteintraege.every(e => e.billed && e.invoiceId === 'inv_123')).toBe(true)
  })

  it('unbilledMinutes berechnet nur nicht-abgerechnete Minuten', () => {
    const { useAuftraege } = await import('./auftraege.store')
    useAuftraege.getState().createAuftrag({
      accountId: 'acc1', title: 'Test', type: 'hourly',
      hourlyRate: 100, fixedAmount: null, notes: '',
    })
    const id = useAuftraege.getState().auftraege[0].id
    useAuftraege.getState().addZeiteintrag({ auftragId: id, date: '2026-06-06', minutes: 60, description: 'A' })
    useAuftraege.getState().addZeiteintrag({ auftragId: id, date: '2026-06-06', minutes: 30, description: 'B' })
    expect(useAuftraege.getState().unbilledMinutes(id)).toBe(90)
    useAuftraege.getState().markBilled(id, 'inv_1')
    expect(useAuftraege.getState().unbilledMinutes(id)).toBe(0)
  })
})
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

```bash
npx vitest run src/store/auftraege.store.test.ts
```

Expected: Fehler "Cannot find module './auftraege.store'".

- [ ] **Step 3: Store implementieren**

```ts
// src/store/auftraege.store.ts
import { create } from 'zustand'
import type { Auftrag, Zeiteintrag, CreateAuftragPayload, AddZeiteintragPayload, AuftragStatus } from '@/types/auftrag.types'

const KEY_AUFTRAEGE    = 'cynera-auftraege-v1'
const KEY_ZEITEINTRAEGE = 'cynera-zeiteintraege-v1'

function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

interface AuftraegeState {
  auftraege:    Auftrag[]
  zeiteintraege: Zeiteintrag[]

  createAuftrag:    (payload: CreateAuftragPayload) => void
  updateAuftrag:    (id: string, partial: Partial<Pick<Auftrag, 'title' | 'type' | 'hourlyRate' | 'fixedAmount' | 'notes' | 'status'>>) => void
  deleteAuftrag:    (id: string) => void
  addZeiteintrag:   (payload: AddZeiteintragPayload) => void
  removeZeiteintrag: (id: string) => void
  markBilled:       (auftragId: string, invoiceId: string) => void

  // Selektoren
  unbilledMinutes:  (auftragId: string) => number
  unbilledAmount:   (auftragId: string) => number
}

export const useAuftraege = create<AuftraegeState>()((set, get) => ({
  auftraege:     load<Auftrag>(KEY_AUFTRAEGE),
  zeiteintraege: load<Zeiteintrag>(KEY_ZEITEINTRAEGE),

  createAuftrag(payload) {
    const auftrag: Auftrag = {
      id: `auf_${uid()}`, ...payload,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const next = [auftrag, ...get().auftraege]
    save(KEY_AUFTRAEGE, next)
    set({ auftraege: next })
  },

  updateAuftrag(id, partial) {
    const next = get().auftraege.map(a => a.id === id ? { ...a, ...partial } : a)
    save(KEY_AUFTRAEGE, next)
    set({ auftraege: next })
  },

  deleteAuftrag(id) {
    const auftraege    = get().auftraege.filter(a => a.id !== id)
    const zeiteintraege = get().zeiteintraege.filter(z => z.auftragId !== id)
    save(KEY_AUFTRAEGE, auftraege)
    save(KEY_ZEITEINTRAEGE, zeiteintraege)
    set({ auftraege, zeiteintraege })
  },

  addZeiteintrag(payload) {
    const entry: Zeiteintrag = {
      id: `ze_${uid()}`, ...payload,
      billed: false, invoiceId: null,
    }
    const next = [entry, ...get().zeiteintraege]
    save(KEY_ZEITEINTRAEGE, next)
    set({ zeiteintraege: next })
  },

  removeZeiteintrag(id) {
    const next = get().zeiteintraege.filter(z => z.id !== id)
    save(KEY_ZEITEINTRAEGE, next)
    set({ zeiteintraege: next })
  },

  markBilled(auftragId, invoiceId) {
    const zeiteintraege = get().zeiteintraege.map(z =>
      z.auftragId === auftragId && !z.billed
        ? { ...z, billed: true, invoiceId }
        : z
    )
    const auftraege = get().auftraege.map(a =>
      a.id === auftragId ? { ...a, status: 'billed' as AuftragStatus } : a
    )
    save(KEY_ZEITEINTRAEGE, zeiteintraege)
    save(KEY_AUFTRAEGE, auftraege)
    set({ zeiteintraege, auftraege })
  },

  unbilledMinutes(auftragId) {
    return get().zeiteintraege
      .filter(z => z.auftragId === auftragId && !z.billed)
      .reduce((s, z) => s + z.minutes, 0)
  },

  unbilledAmount(auftragId) {
    const auftrag = get().auftraege.find(a => a.id === auftragId)
    if (!auftrag) return 0
    if (auftrag.type === 'fixed') return auftrag.fixedAmount ?? 0
    const hours = get().unbilledMinutes(auftragId) / 60
    return Math.round(hours * (auftrag.hourlyRate ?? 0) * 100) / 100
  },
}))
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

```bash
npx vitest run src/store/auftraege.store.test.ts
```

Expected: 4 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add src/store/auftraege.store.ts src/store/auftraege.store.test.ts
git commit -m "feat(auftraege): Store — CRUD, Zeiteinträge, markBilled, unbilledMinutes"
```

---

## Task 3: AuftragForm Modal

**Files:**
- Create: `src/components/zeitmanagement/AuftragForm.tsx`

- [ ] **Step 1: Komponente anlegen**

```tsx
// src/components/zeitmanagement/AuftragForm.tsx
import { useState } from 'react'
import { useAuftraege } from '@/store/auftraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Auftrag, AuftragType } from '@/types/auftrag.types'

interface Props {
  auftrag?: Auftrag   // wenn gesetzt: Bearbeiten, sonst: Neu
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
  color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
  display: 'block', marginBottom: 5,
}

export function AuftragForm({ auftrag, onClose }: Props) {
  const accounts       = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const createAuftrag  = useAuftraege(s => s.createAuftrag)
  const updateAuftrag  = useAuftraege(s => s.updateAuftrag)

  const [accountId,   setAccountId]   = useState(auftrag?.accountId   ?? '')
  const [title,       setTitle]       = useState(auftrag?.title        ?? '')
  const [type,        setType]        = useState<AuftragType>(auftrag?.type ?? 'hourly')
  const [hourlyRate,  setHourlyRate]  = useState(auftrag?.hourlyRate  != null ? String(auftrag.hourlyRate)  : '')
  const [fixedAmount, setFixedAmount] = useState(auftrag?.fixedAmount != null ? String(auftrag.fixedAmount) : '')
  const [notes,       setNotes]       = useState(auftrag?.notes        ?? '')

  const canSave = title.trim() && accountId &&
    (type === 'hourly' ? parseFloat(hourlyRate) > 0 : parseFloat(fixedAmount) > 0)

  const handleSave = () => {
    if (!canSave) return
    const payload = {
      accountId, title: title.trim(), type, notes: notes.trim(),
      hourlyRate:  type === 'hourly'  ? parseFloat(hourlyRate)  : null,
      fixedAmount: type === 'fixed'   ? parseFloat(fixedAmount) : null,
    }
    if (auftrag) {
      updateAuftrag(auftrag.id, payload)
    } else {
      createAuftrag(payload)
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {auftrag ? 'Auftrag bearbeiten' : 'Neuer Auftrag'}
        </h2>

        <div>
          <label style={labelStyle}>Kunde</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
            <option value="">Kunden wählen…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Bezeichnung</label>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="z.B. Website Redesign Q2"
            style={inputStyle}
          />
        </div>

        {/* Typ-Toggle */}
        <div>
          <label style={labelStyle}>Abrechnungsart</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['hourly', 'fixed'] as AuftragType[]).map(t => (
              <button key={t} type="button" onClick={() => setType(t)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer',
                border: `1px solid ${type === t ? 'var(--accent)' : 'rgba(255,255,255,0.09)'}`,
                background: type === t ? 'oklch(92% 0.2 125 / 0.1)' : 'transparent',
                color: type === t ? 'var(--accent)' : 'var(--fg-dim)',
                fontSize: 12, fontWeight: 700,
              }}>
                {t === 'hourly' ? 'Nach Stunden' : 'Pauschal'}
              </button>
            ))}
          </div>
        </div>

        {type === 'hourly' ? (
          <div>
            <label style={labelStyle}>Stundensatz (€)</label>
            <input
              type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
              placeholder="90" min="1" style={inputStyle}
            />
          </div>
        ) : (
          <div>
            <label style={labelStyle}>Pauschalbetrag (€)</label>
            <input
              type="number" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)}
              placeholder="2500" min="1" style={inputStyle}
            />
          </div>
        )}

        <div>
          <label style={labelStyle}>Notizen (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Interne Notizen zum Auftrag…" style={inputStyle} />
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
            {auftrag ? 'Speichern' : 'Auftrag anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep AuftragForm
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/zeitmanagement/AuftragForm.tsx
git commit -m "feat(auftraege): AuftragForm Modal — neu/bearbeiten, hourly/fixed"
```

---

## Task 4: ZeiterfassungForm

**Files:**
- Create: `src/components/zeitmanagement/ZeiterfassungForm.tsx`

- [ ] **Step 1: Komponente anlegen**

```tsx
// src/components/zeitmanagement/ZeiterfassungForm.tsx
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
import type { Auftrag } from '@/types/auftrag.types'

interface Props {
  auftraege: Auftrag[]  // nur aktive Aufträge
}

function todayISO() { return new Date().toLocaleDateString('sv') }

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
  color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
}

export function ZeiterfassungForm({ auftraege }: Props) {
  const addZeiteintrag = useAuftraege(s => s.addZeiteintrag)

  const [auftragId,   setAuftragId]   = useState('')
  const [date,        setDate]        = useState(todayISO())
  const [description, setDescription] = useState('')
  const [hours,       setHours]       = useState('')
  const [mins,        setMins]        = useState('')

  const totalMins = (parseInt(hours || '0', 10) * 60) + parseInt(mins || '0', 10)
  const canAdd    = auftragId && description.trim() && totalMins > 0

  const handleAdd = () => {
    if (!canAdd) return
    addZeiteintrag({ auftragId, date, minutes: totalMins, description: description.trim() })
    setDescription('')
    setHours('')
    setMins('')
  }

  if (auftraege.length === 0) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center',
      }}>
        Lege zuerst einen Auftrag an, um Zeit zu erfassen.
      </div>
    )
  }

  return (
    <div style={{
      padding: '18px 20px', borderRadius: 14,
      border: '1px solid rgba(181,240,35,0.2)',
      background: 'rgba(181,240,35,0.03)',
    }}>
      <div style={{
        fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, marginBottom: 12,
      }}>
        Zeit erfassen
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8, marginBottom: 8 }}>
        <select value={auftragId} onChange={e => setAuftragId(e.target.value)} style={inputStyle}>
          <option value="">Auftrag wählen…</option>
          {auftraege.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px auto', gap: 8 }}>
        <input
          value={description} onChange={e => setDescription(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Was wurde gemacht?"
          style={inputStyle}
        />
        <input
          type="number" value={hours} onChange={e => setHours(e.target.value)}
          placeholder="Std" min="0" max="23"
          style={{ ...inputStyle, textAlign: 'center' }}
        />
        <input
          type="number" value={mins} onChange={e => setMins(e.target.value)}
          placeholder="Min" min="0" max="59" step="15"
          style={{ ...inputStyle, textAlign: 'center' }}
        />
        <button
          onClick={handleAdd} disabled={!canAdd}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: canAdd ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            color: canAdd ? 'var(--accent-ink)' : 'var(--fg-dim)',
            fontSize: 12, fontWeight: 700, cursor: canAdd ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={13} /> Erfassen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep ZeiterfassungForm
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/zeitmanagement/ZeiterfassungForm.tsx
git commit -m "feat(auftraege): ZeiterfassungForm — Zeit auf Auftrag buchen"
```

---

## Task 5: AuftragAbrechnen Modal

**Files:**
- Create: `src/components/zeitmanagement/AuftragAbrechnen.tsx`

- [ ] **Step 1: Komponente anlegen**

```tsx
// src/components/zeitmanagement/AuftragAbrechnen.tsx
import { useState } from 'react'
import { useAuftraege } from '@/store/auftraege.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import type { Auftrag, Zeiteintrag } from '@/types/auftrag.types'

interface Props {
  auftrag: Auftrag
  onClose: () => void
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} Min`
  if (min === 0) return `${h} Std`
  return `${h} Std ${min} Min`
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function todayISO() { return new Date().toLocaleDateString('sv') }
function dueDateISO() {
  const d = new Date(); d.setDate(d.getDate() + 14)
  return d.toLocaleDateString('sv')
}

export function AuftragAbrechnen({ auftrag, onClose }: Props) {
  const zeiteintraege   = useAuftraege(s => s.zeiteintraege.filter(z => z.auftragId === auftrag.id && !z.billed))
  const unbilledMinutes = useAuftraege(s => s.unbilledMinutes(auftrag.id))
  const unbilledAmount  = useAuftraege(s => s.unbilledAmount(auftrag.id))
  const markBilled      = useAuftraege(s => s.markBilled)
  const createInvoice   = useFinanceStore(s => s.createInvoice)
  const workspaceId     = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId          = useAuthStore(s => s.user?.id) ?? ''
  const showToast       = useToastStore(s => s.show)

  const [dueDate, setDueDate] = useState(dueDateISO())
  const [saving,  setSaving]  = useState(false)

  const hours = Math.round((unbilledMinutes / 60) * 100) / 100

  const lineTitle = auftrag.type === 'hourly'
    ? `${auftrag.title} — ${hours.toLocaleString('de-DE')} Std à ${fmtEur(auftrag.hourlyRate ?? 0)}`
    : auftrag.title

  const handleAbrechnen = async () => {
    if (zeiteintraege.length === 0 && auftrag.type === 'hourly') {
      showToast({ message: 'Keine nicht-abgerechneten Einträge vorhanden.', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      const result = await createInvoice({
        workspaceId, createdBy: userId,
        accountId: auftrag.accountId,
        date: todayISO(), dueDate,
        status: 'draft', taxMode: 'standard',
        subtotal: unbilledAmount, taxAmount: 0, total: unbilledAmount,
        items: [{
          title: lineTitle,
          quantity: 1,
          unitPrice: unbilledAmount,
          taxRate: 0, total: unbilledAmount, sortOrder: 0,
        }],
      })
      markBilled(auftrag.id, result.invoice.id)
      showToast({ message: 'Rechnung erstellt und Auftrag als abgerechnet markiert.', variant: 'success' })
      onClose()
    } catch {
      showToast({ message: 'Rechnung konnte nicht erstellt werden.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 28, width: 480, display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Auftrag abrechnen
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
            {auftrag.title}
          </p>
        </div>

        {/* Zeiteinträge */}
        {auftrag.type === 'hourly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
            }}>
              Nicht abgerechnete Einträge ({zeiteintraege.length})
            </div>
            {zeiteintraege.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '8px 0' }}>
                Keine offenen Einträge.
              </div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {zeiteintraege.map((z: Zeiteintrag) => (
                  <div key={z.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{z.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{z.date}</div>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                      {fmtMinutes(z.minutes)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summe */}
        <div style={{
          padding: '16px 18px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--surface-1)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {auftrag.type === 'hourly' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--fg-dim)' }}>
              <span>Gesamt: {fmtMinutes(unbilledMinutes)} × {fmtEur(auftrag.hourlyRate ?? 0)}/Std</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Rechnungsbetrag</span>
            <span style={{
              fontSize: 22, fontWeight: 700, color: 'var(--accent)',
              fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
            }}>
              {fmtEur(unbilledAmount)}
            </span>
          </div>
        </div>

        {/* Fälligkeit */}
        <div>
          <label style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600,
            display: 'block', marginBottom: 5,
          }}>
            Fälligkeitsdatum
          </label>
          <input
            type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.09)', background: '#141419',
              color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 99, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer',
          }}>
            Abbrechen
          </button>
          <button
            onClick={handleAbrechnen}
            disabled={saving || (auftrag.type === 'hourly' && zeiteintraege.length === 0)}
            style={{
              padding: '9px 24px', borderRadius: 99, border: 'none',
              background: saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
              color: saving ? 'var(--fg-dim)' : 'var(--accent-ink)',
              fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Wird erstellt…' : '→ Rechnung erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep AuftragAbrechnen
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/zeitmanagement/AuftragAbrechnen.tsx
git commit -m "feat(auftraege): AuftragAbrechnen Modal — Zeit → Rechnung, markBilled"
```

---

## Task 6: ZeitmanagementRoute neu bauen

**Files:**
- Modify: `src/routes/ZeitmanagementRoute.tsx`

- [ ] **Step 1: Route komplett ersetzen**

```tsx
// src/routes/ZeitmanagementRoute.tsx
import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Receipt, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import { AuftragForm } from '@/components/zeitmanagement/AuftragForm'
import { ZeiterfassungForm } from '@/components/zeitmanagement/ZeiterfassungForm'
import { AuftragAbrechnen } from '@/components/zeitmanagement/AuftragAbrechnen'
import type { Auftrag } from '@/types/auftrag.types'

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} Min`
  if (min === 0) return `${h} Std`
  return `${h} Std ${min} Min`
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function AuftragRow({ auftrag, onEdit, onAbrechnen }: {
  auftrag: Auftrag
  onEdit: () => void
  onAbrechnen: () => void
}) {
  const [open, setOpen] = useState(false)
  const zeiteintraege   = useAuftraege(s => s.zeiteintraege.filter(z => z.auftragId === auftrag.id))
  const unbilledMins    = useAuftraege(s => s.unbilledMinutes(auftrag.id))
  const unbilledAmount  = useAuftraege(s => s.unbilledAmount(auftrag.id))
  const removeZeiteintrag = useAuftraege(s => s.removeZeiteintrag)
  const deleteAuftrag   = useAuftraege(s => s.deleteAuftrag)
  const accounts        = useAccountsStore(s => s.accounts)
  const account         = accounts.find(a => a.id === auftrag.accountId)

  const hasUnbilled = unbilledMins > 0 || (auftrag.type === 'fixed' && auftrag.status !== 'billed')
  const totalMins   = zeiteintraege.reduce((s, z) => s + z.minutes, 0)

  const statusColor =
    auftrag.status === 'billed'    ? 'oklch(60% 0.01 0)' :
    auftrag.status === 'completed' ? 'oklch(72% 0.18 180)' :
    'var(--accent)'

  const statusLabel =
    auftrag.status === 'billed'    ? 'Abgerechnet' :
    auftrag.status === 'completed' ? 'Fertig' : 'Aktiv'

  return (
    <div style={{
      borderRadius: 14, border: '1px solid var(--border)',
      background: 'var(--bg-2)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
              {auftrag.title}
            </span>
            {hasUnbilled && auftrag.status !== 'billed' && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: 'oklch(92% 0.2 125 / 0.15)', color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
              }}>
                NICHT ABGERECHNET
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--fg-dim)' }}>
            <span>{account?.name ?? '—'}</span>
            <span>·</span>
            <span>{auftrag.type === 'hourly'
              ? `${fmtEur(auftrag.hourlyRate ?? 0)}/Std`
              : `Pauschal ${fmtEur(auftrag.fixedAmount ?? 0)}`}
            </span>
            {totalMins > 0 && <><span>·</span><span>{fmtMinutes(totalMins)} gesamt</span></>}
          </div>
        </div>

        {/* Rechts: Betrag + Aktionen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {hasUnbilled && auftrag.status !== 'billed' && (
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 18, fontWeight: 700, color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
              }}>
                {fmtEur(unbilledAmount)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
                offen
              </div>
            </div>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
            background: `${statusColor}18`, color: statusColor,
            fontFamily: 'var(--font-mono)',
          }}>
            {statusLabel}
          </span>
          {auftrag.status !== 'billed' && (
            <button onClick={onAbrechnen} title="Abrechnen" style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Receipt size={13} /> Abrechnen
            </button>
          )}
          <button onClick={onEdit} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Edit2 size={13} />
          </button>
          <button onClick={() => {
            if (confirm(`Auftrag "${auftrag.title}" und alle Zeiteinträge löschen?`)) deleteAuftrag(auftrag.id)
          }} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trash2 size={13} />
          </button>
          <button onClick={() => setOpen(o => !o)} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Aufgeklappte Zeiteinträge */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zeiteintraege.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '4px 0' }}>
              Noch keine Zeiteinträge.
            </div>
          ) : zeiteintraege.map(z => (
            <div key={z.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', borderRadius: 8,
              background: z.billed ? 'transparent' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${z.billed ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
              opacity: z.billed ? 0.5 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{z.description}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{z.date}{z.billed ? ' · abgerechnet' : ''}</div>
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                {fmtMinutes(z.minutes)}
              </div>
              {!z.billed && (
                <button onClick={() => removeZeiteintrag(z.id)} style={{
                  width: 24, height: 24, borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ZeitmanagementRoute() {
  const auftraege     = useAuftraege(s => s.auftraege)
  const zeiteintraege = useAuftraege(s => s.zeiteintraege)

  const [showForm,       setShowForm]       = useState(false)
  const [editAuftrag,    setEditAuftrag]    = useState<Auftrag | null>(null)
  const [abrechnAuftrag, setAbrechnAuftrag] = useState<Auftrag | null>(null)

  const aktiveAuftraege = useMemo(
    () => auftraege.filter(a => a.status !== 'billed'),
    [auftraege]
  )

  // KPIs
  const unbilledTotal = useMemo(() => {
    const store = useAuftraege.getState()
    return auftraege
      .filter(a => a.status !== 'billed')
      .reduce((s, a) => s + store.unbilledAmount(a.id), 0)
  }, [auftraege, zeiteintraege])

  const weekMins = useMemo(() => {
    const mon = new Date()
    const day = mon.getDay()
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1))
    mon.setHours(0, 0, 0, 0)
    return zeiteintraege
      .filter(z => new Date(z.date) >= mon)
      .reduce((s, z) => s + z.minutes, 0)
  }, [zeiteintraege])

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 28px 64px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 6,
          }}>Zeitmanagement</div>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--fg)', margin: 0 }}>
            Aufträge
          </h1>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
          borderRadius: 10, border: 'none', background: 'var(--accent)',
          color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={15} /> Neuer Auftrag
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Nicht abgerechnet', value: fmtEur(unbilledTotal), accent: unbilledTotal > 0 },
          { label: 'Diese Woche', value: fmtMinutes(weekMins), accent: false },
        ].map(k => (
          <div key={k.label} style={{
            padding: '16px 20px', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 6,
            }}>{k.label}</div>
            <div style={{
              fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
              color: k.accent ? 'var(--accent)' : 'var(--fg)',
            }}>{weekMins === 0 && !k.accent ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      {/* Zeiterfassung Form */}
      <div style={{ marginBottom: 28 }}>
        <ZeiterfassungForm auftraege={aktiveAuftraege} />
      </div>

      {/* Auftragsliste */}
      {auftraege.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--fg-dim)' }}>
          <Clock size={36} style={{ opacity: 0.18, marginBottom: 14, display: 'block', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6 }}>
            Noch keine Aufträge
          </div>
          <div style={{ fontSize: 13 }}>
            Lege einen Auftrag an um Zeit zu erfassen und abzurechnen.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {auftraege.map(a => (
            <AuftragRow
              key={a.id}
              auftrag={a}
              onEdit={() => setEditAuftrag(a)}
              onAbrechnen={() => setAbrechnAuftrag(a)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && <AuftragForm onClose={() => setShowForm(false)} />}
      {editAuftrag && <AuftragForm auftrag={editAuftrag} onClose={() => setEditAuftrag(null)} />}
      {abrechnAuftrag && <AuftragAbrechnen auftrag={abrechnAuftrag} onClose={() => setAbrechnAuftrag(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check — keine neuen Fehler**

```bash
npx tsc --noEmit 2>&1 | grep -v "slashMenu\|ArbeitsraumPane" | grep "error TS"
```

Expected: 0 Fehler.

- [ ] **Step 3: Tests laufen lassen**

```bash
npx vitest run
```

Expected: alle Tests grün.

- [ ] **Step 4: Commit**

```bash
git add src/routes/ZeitmanagementRoute.tsx src/components/zeitmanagement/
git commit -m "feat(auftraege): ZeitmanagementRoute neu — Aufträge, Zeiterfassung, Abrechnen"
```

---

## Selbst-Review

**Spec-Abdeckung:**
- ✅ Aufträge anlegen mit Kundenzuordnung
- ✅ Stundenbasiert (Stundensatz) und Pauschal
- ✅ Zeit auf Auftrag buchen (Datum, Stunden, Beschreibung)
- ✅ "Nicht abgerechnet"-Status klar sichtbar
- ✅ Auftrag → Rechnung (nutzt `FinanceService.createInvoice`)
- ✅ Zeiteinträge werden nach Abrechnung als `billed` markiert
- ✅ Auftrag-Status wird auf `billed` gesetzt

**Kein Placeholder:** Vollständiger Code in jedem Schritt.

**Type-Konsistenz:** `Auftrag`, `Zeiteintrag`, `CreateAuftragPayload`, `AddZeiteintragPayload` sind in Task 1 definiert und konsistent in allen folgenden Tasks verwendet.
