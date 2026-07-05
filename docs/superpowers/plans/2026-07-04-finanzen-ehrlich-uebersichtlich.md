# Finanzen ehrlich & übersichtlich — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ehrliche, konsistente Finanz-Zahlen: reparierte Rechnungsfilter mit Zählern, deutsches PDF-Zahlenformat, Forderungs-Kachel mit Überfällig-Split, Pipeline-Potenzial-Kachel mit Wert-Erfassung beim Deal-Anlegen.

**Architecture:** Vier pure, TDD-getestete Ableitungs-Funktionen unter `src/lib/finance/` werden die eine Wahrheitsquelle; FinanceRoute, DashboardRoute und die PDFs konsumieren sie nur noch. Dialog-Änderungen (QualifyModal, ConvertLeadChoice) reichen einen optionalen Deal-Wert bis `convertToDeal` durch.

**Tech Stack:** React + TypeScript (Vite), Zustand-Stores, @react-pdf/renderer, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-04-finanzen-ehrlich-uebersichtlich-design.md`

## Global Constraints

- Deutsche UI-Texte; Zahlen im de-DE-Format.
- Inline-Styles im Stil der umgebenden Komponenten (keine neuen CSS-Dateien).
- TDD: Test zuerst, RED beweisen, dann GREEN. Tests laufen mit `npx vitest run <pfad>`.
- Nach jedem Task: Commit mit `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `isOverdue`/`remaining`/`paidAmount` aus `src/lib/invoice-status.ts` wiederverwenden — keine Parallel-Ableitungen.

---

### Task 1: Pure Lib `invoice-filters` (Kategorie + Zähler)

**Files:**
- Create: `src/lib/finance/invoice-filters.ts`
- Test: `src/lib/finance/invoice-filters.test.ts`

**Interfaces:**
- Consumes: `isOverdue(invoice, today?)` aus `@/lib/invoice-status`; `Invoice` aus `@/types/finance.types` (Felder: `status: 'draft'|'open'|'overdue'|'paid'|'cancelled'`, `dueDate`, `total`, `isSuggestion`).
- Produces: `type InvoiceCategory = 'draft'|'open'|'overdue'|'paid'|'cancelled'`; `invoiceCategory(invoice: Invoice, today?: string): InvoiceCategory`; `invoiceFilterCounts(invoices: Invoice[], today?: string): { all: number; open: number; overdue: number; paid: number; cancelled: number }`.

- [ ] **Step 1: Failing Test schreiben**

```ts
// src/lib/finance/invoice-filters.test.ts
import { describe, it, expect } from 'vitest'
import { invoiceCategory, invoiceFilterCounts } from './invoice-filters'
import type { Invoice } from '@/types/finance.types'

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'i1', workspaceId: 'ws', createdBy: 'u', accountId: 'a',
  number: 'R-1', date: '2026-07-01', dueDate: '2026-07-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
} as Invoice)

const TODAY = '2026-07-04'

describe('invoiceCategory', () => {
  it('open + Fälligkeit in der Zukunft → open', () => {
    expect(invoiceCategory(inv({ dueDate: '2026-07-15' }), TODAY)).toBe('open')
  })
  it('heute fällig ist NICHT überfällig', () => {
    expect(invoiceCategory(inv({ dueDate: TODAY }), TODAY)).toBe('open')
  })
  it('open + Fälligkeit überschritten → overdue', () => {
    expect(invoiceCategory(inv({ dueDate: '2026-07-01' }), TODAY)).toBe('overdue')
  })
  it('paid/cancelled/draft kommen direkt aus dem Status — auch wenn das Datum überschritten ist', () => {
    expect(invoiceCategory(inv({ status: 'paid', dueDate: '2026-01-01' }), TODAY)).toBe('paid')
    expect(invoiceCategory(inv({ status: 'cancelled', dueDate: '2026-01-01' }), TODAY)).toBe('cancelled')
    expect(invoiceCategory(inv({ status: 'draft', dueDate: '2026-01-01' }), TODAY)).toBe('draft')
  })
})

describe('invoiceFilterCounts', () => {
  it('zählt je Kategorie; all = ohne Entwürfe und Stornos', () => {
    const c = invoiceFilterCounts([
      inv({ id: '1', dueDate: '2026-07-15' }),                       // open
      inv({ id: '2', dueDate: '2026-07-01' }),                       // overdue
      inv({ id: '3', status: 'paid' }),
      inv({ id: '4', status: 'paid' }),
      inv({ id: '5', status: 'cancelled' }),
      inv({ id: '6', status: 'draft' }),
    ], TODAY)
    expect(c).toEqual({ all: 4, open: 1, overdue: 1, paid: 2, cancelled: 1 })
  })
})
```

- [ ] **Step 2: RED beweisen** — `npx vitest run src/lib/finance/invoice-filters.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```ts
// src/lib/finance/invoice-filters.ts
import type { Invoice } from '@/types/finance.types'
import { isOverdue } from '@/lib/invoice-status'

/** Anzeige-Kategorie einer Rechnung. 'overdue' ist IMMER abgeleitet
 *  (aus dueDate) — der DB-Status wird nie auf overdue gesetzt. Eine
 *  Wahrheitsquelle für Filter-Chips, Cockpit-Kacheln und Forderungen. */
export type InvoiceCategory = 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled'

export function invoiceCategory(invoice: Invoice, today?: string): InvoiceCategory {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'draft') {
    return invoice.status
  }
  return isOverdue(invoice, today) ? 'overdue' : 'open'
}

export interface InvoiceFilterCounts {
  all: number; open: number; overdue: number; paid: number; cancelled: number
}

/** Zähler für die Filter-Chips. 'all' = alles außer Entwürfen und Stornos
 *  (entspricht dem heutigen „Alle"-Verhalten der Liste). */
export function invoiceFilterCounts(invoices: Invoice[], today?: string): InvoiceFilterCounts {
  const c: InvoiceFilterCounts = { all: 0, open: 0, overdue: 0, paid: 0, cancelled: 0 }
  for (const inv of invoices) {
    const cat = invoiceCategory(inv, today)
    if (cat === 'draft') continue
    c[cat] += 1
    if (cat !== 'cancelled') c.all += 1
  }
  return c
}
```

- [ ] **Step 4: GREEN beweisen** — `npx vitest run src/lib/finance/invoice-filters.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/finance/ && git commit -m "feat(finanzen): invoiceCategory + Filter-Zaehler als geteilte Ableitung"`

---

### Task 2: FinanceRoute — Filter reparieren, Zähler anzeigen

**Files:**
- Modify: `src/routes/FinanceRoute.tsx` (Zeilen 29, 452-456, 499-503, 801-815)

**Interfaces:**
- Consumes: `invoiceCategory`, `invoiceFilterCounts` aus Task 1.
- Produces: nichts Neues nach außen; Verhalten der Chips/Kacheln.

- [ ] **Step 1: Filter-Typ + gefilterte Liste auf Kategorie umstellen**

Zeile 29 ersetzen:
```ts
type InvoiceFilter = 'all' | 'open' | 'overdue' | 'paid' | 'cancelled'
```
Import ergänzen: `import { invoiceCategory, invoiceFilterCounts } from '@/lib/finance/invoice-filters'`

`filteredInvoices` (Zeilen 498-503) ersetzen:
```ts
// Filter über die geteilte Kategorie-Ableitung — 'overdue' funktioniert damit
// endlich (Status wird nie auf overdue gesetzt), 'open' zeigt nur nicht-fällige.
const filteredInvoices = useMemo(() => {
  if (invoiceFilter === 'all') {
    return realInvoices.filter(i => {
      const c = invoiceCategory(i)
      return c !== 'cancelled' && c !== 'draft'
    })
  }
  return realInvoices.filter(i => invoiceCategory(i) === invoiceFilter)
}, [realInvoices, invoiceFilter])
```

Cockpit-Memos (Zeilen 452-453) auf dieselbe Quelle:
```ts
const openInvoices    = useMemo(() => realInvoices.filter(i => invoiceCategory(i) === 'open'), [realInvoices])
const overdueInvoices = useMemo(() => realInvoices.filter(i => invoiceCategory(i) === 'overdue'), [realInvoices])
```

- [ ] **Step 2: Zähler an die Chips**

Nach `filteredInvoices` ergänzen:
```ts
const filterCounts = useMemo(() => invoiceFilterCounts(realInvoices), [realInvoices])
```

Im Chip-Render (ab Zeile 801) das Label erweitern — innerhalb des bestehenden Buttons:
```tsx
{INVOICE_FILTERS.map(f => {
  const isActive = invoiceFilter === f.value
  const count = filterCounts[f.value]
  return (
    <button key={f.value} onClick={() => setInvoiceFilter(f.value)}
      className="chip"
      style={{ /* bestehende Styles unverändert */ }}>
      {f.label}{count > 0 ? ` ${count}` : ''}
    </button>
  )
})}
```
(`INVOICE_FILTERS` bleibt unverändert — die value-Union passt jetzt zum neuen Typ.)

- [ ] **Step 3: Verifizieren** — `npx tsc --noEmit` sauber; `npx vitest run` (FinanceRoute-nahe Tests) grün.

- [ ] **Step 4: Commit** — `git commit -am "fix(finanzen): Ueberfaellig-Filter funktioniert, Chips mit Zaehlern, eine Ableitung fuer Liste+Cockpit"`

---

### Task 3: Pure Lib `pdf-format` (de-DE für PDF-Positionen)

**Files:**
- Create: `src/lib/finance/pdf-format.ts`
- Test: `src/lib/finance/pdf-format.test.ts`

**Interfaces:**
- Produces: `fmtEurPdf(n: number): string` („1.200,00 €"); `fmtQty(n: number): string` („2,5", „4").

- [ ] **Step 1: Failing Test**

```ts
// src/lib/finance/pdf-format.test.ts
import { describe, it, expect } from 'vitest'
import { fmtEurPdf, fmtQty } from './pdf-format'

describe('fmtEurPdf', () => {
  it('formatiert deutsch mit Tausenderpunkt und 2 Nachkommastellen', () => {
    expect(fmtEurPdf(1200)).toBe('1.200,00 €')
    expect(fmtEurPdf(297.5)).toBe('297,50 €')
    expect(fmtEurPdf(0)).toBe('0,00 €')
  })
})

describe('fmtQty', () => {
  it('ganze Mengen ohne Nachkommastellen, Brüche mit Komma', () => {
    expect(fmtQty(4)).toBe('4')
    expect(fmtQty(2.5)).toBe('2,5')
    expect(fmtQty(1.25)).toBe('1,25')
    expect(fmtQty(1000)).toBe('1.000')
  })
})
```

- [ ] **Step 2: RED beweisen** — `npx vitest run src/lib/finance/pdf-format.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

```ts
// src/lib/finance/pdf-format.ts
/** Zahlenformat für PDF-Positionszeilen — dasselbe de-DE wie die Summen. */
const eur = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function fmtEurPdf(n: number): string { return `${eur.format(n)} €` }
export function fmtQty(n: number): string { return qty.format(n) }
```

- [ ] **Step 4: GREEN beweisen**, dann **Step 5: Commit** — `git commit -am "feat(finanzen): de-DE-Formatter fuer PDF-Positionen"`

---

### Task 4: PDF-Politur (InvoicePDF + OfferPDF)

**Files:**
- Modify: `src/components/finance/InvoicePDF.tsx` (Zeilen 180-193, 221-226)
- Modify: `src/components/finance/OfferPDF.tsx` (Zeilen ~136-141, gleiche Tabelle)

**Interfaces:**
- Consumes: `fmtEurPdf`, `fmtQty` aus Task 3.

- [ ] **Step 1: InvoicePDF-Positionszeilen umstellen** (Import ergänzen: `import { fmtEurPdf, fmtQty } from '@/lib/finance/pdf-format'`)

Zeilen 222-226:
```tsx
<Text style={s.colQty}>{fmtQty(item.quantity)}</Text>
<Text style={s.colUnit}>{item.unit ?? ''}</Text>
<Text style={s.colPrice}>{fmtEurPdf(item.unitPrice)}</Text>
{!noTax && <Text style={s.colTax}>{item.taxRate}%</Text>}
<Text style={s.colTotal}>{fmtEurPdf(item.total)}</Text>
```

- [ ] **Step 2: Meta-Block entschlacken** (Zeilen 181-186) — Array ersetzen durch:
```tsx
{[
  { label: 'Rechnungsdatum', value: fmtDate(invoice.date) },
  { label: 'Leistungsdatum', value: fmtDate(leistungsdatum) },
  { label: 'Fällig am',      value: fmtDate(invoice.dueDate) },
].map(m => (
```
(„Zahlungsziel" und „Rechnungsnr." entfallen; die Nummer steht weiter unter dem Titel, Zeile 166. Falls `daysBetween` danach unbenutzt ist: Funktion mitentfernen.)

- [ ] **Step 3: OfferPDF gleichziehen** — in `OfferPDF.tsx` Zeilen ~138/140 `item.unitPrice.toFixed(2)` / `item.total.toFixed(2)` durch `fmtEurPdf(...)` ersetzen, Mengen-Spalte durch `fmtQty(item.quantity)` (Import ergänzen). Nur die Positionstabelle — Offer-Meta-Block bleibt unangetastet.

- [ ] **Step 4: Verifizieren** — `npx vitest run src/components/finance` → alle PDF-/Preview-Tests grün; `npx tsc --noEmit` sauber.

- [ ] **Step 5: Commit** — `git commit -am "fix(pdf): deutsches Zahlenformat in Positionen, Meta-Block entschlackt, Nummern-Dublette raus"`

---

### Task 5: Pure Lib `receivables` (offene Forderungen)

**Files:**
- Create: `src/lib/finance/receivables.ts`
- Test: `src/lib/finance/receivables.test.ts`

**Interfaces:**
- Consumes: `invoiceCategory` (Task 1); `paidAmount`, `remaining` aus `@/lib/invoice-status`; `Payment` (`{ invoiceId, amount, paidAt }`).
- Produces: `receivables(invoices: Invoice[], payments: Payment[], today?: string): { open: number; overdue: number }`.

- [ ] **Step 1: Failing Test**

```ts
// src/lib/finance/receivables.test.ts
import { describe, it, expect } from 'vitest'
import { receivables } from './receivables'
import type { Invoice, Payment } from '@/types/finance.types'

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'i1', workspaceId: 'ws', createdBy: 'u', accountId: 'a',
  number: 'R-1', date: '2026-07-01', dueDate: '2026-07-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
} as Invoice)
const pay = (invoiceId: string, amount: number): Payment =>
  ({ id: 'p', invoiceId, amount, paidAt: '2026-07-02', workspaceId: 'ws' } as Payment)

const TODAY = '2026-07-04'

describe('receivables', () => {
  it('teilt Restbeträge in offen und überfällig', () => {
    const r = receivables([
      inv({ id: '1', total: 100, dueDate: '2026-07-15' }),  // offen
      inv({ id: '2', total: 200, dueDate: '2026-07-01' }),  // überfällig
    ], [], TODAY)
    expect(r).toEqual({ open: 100, overdue: 200 })
  })
  it('zieht erfasste Teilzahlungen ab', () => {
    const r = receivables([inv({ id: '1', total: 100, dueDate: '2026-07-15' })], [pay('1', 40)], TODAY)
    expect(r.open).toBe(60)
  })
  it('bezahlt/storniert/Entwurf/Vorschlag zählen nicht', () => {
    const r = receivables([
      inv({ id: '1', status: 'paid' }),
      inv({ id: '2', status: 'cancelled' }),
      inv({ id: '3', status: 'draft' }),
      inv({ id: '4', isSuggestion: true, status: 'draft' }),
    ], [], TODAY)
    expect(r).toEqual({ open: 0, overdue: 0 })
  })
})
```

- [ ] **Step 2: RED beweisen** — `npx vitest run src/lib/finance/receivables.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

```ts
// src/lib/finance/receivables.ts
import type { Invoice, Payment } from '@/types/finance.types'
import { paidAmount, remaining } from '@/lib/invoice-status'
import { invoiceCategory } from './invoice-filters'

export interface Receivables { open: number; overdue: number }

/** Offene Forderungen als Restbeträge (Teilzahlungen abgezogen).
 *  Gesnoozte Rechnungen zählen mit — Snooze vertagt die Mahnung,
 *  nicht die Forderung. Geteilt von Dashboard-Kachel und Finanzen-Cockpit. */
export function receivables(invoices: Invoice[], payments: Payment[], today?: string): Receivables {
  const r: Receivables = { open: 0, overdue: 0 }
  for (const inv of invoices) {
    if (inv.isSuggestion) continue
    const cat = invoiceCategory(inv, today)
    if (cat !== 'open' && cat !== 'overdue') continue
    r[cat] += remaining(inv, paidAmount(payments, inv.id))
  }
  r.open = Math.round(r.open * 100) / 100
  r.overdue = Math.round(r.overdue * 100) / 100
  return r
}
```

- [ ] **Step 4: GREEN beweisen**, dann **Step 5: Commit** — `git commit -am "feat(finanzen): receivables() — offene Forderungen als geteilte Ableitung"`

---

### Task 6: Dashboard-Kachel „Geld unterwegs" ehrlich machen

**Files:**
- Modify: `src/routes/DashboardRoute.tsx` (Zeilen 142-148, 189-193)
- Modify: `src/routes/FinanceRoute.tsx` (Zeilen 454-456 — Cockpit nutzt receivables)

**Interfaces:**
- Consumes: `receivables` (Task 5); `useFinanceStore(s => s.payments)`; `useUiStore(s => s.setAppView)` (View-Id `'invoices'`).

- [ ] **Step 1: Dashboard-Ableitung ersetzen** (Zeilen 142-148):

```ts
// Offene Forderungen (Restbeträge) — dieselbe Ableitung wie das Finanzen-Cockpit.
const payments = useFinanceStore(s => s.payments)
const recv = useMemo(() => receivables(invoices, payments), [invoices, payments])
```
Imports: `import { receivables } from '@/lib/finance/receivables'`. Das alte `overdueInvoices`/`geldUnterwegs`-Memo (inkl. `snoozedInvoiceIds`-Nutzung) entfällt; wenn `snoozedInvoiceIds` danach unbenutzt ist, Import entfernen.

- [ ] **Step 2: Kachel umbauen** (Zeilen 189-193):

```tsx
{/* Segment 2: Geld unterwegs — ALLE offenen Forderungen, Überfälliges als Unterzeile */}
<div
  className={`hd-pulse-stat${recv.overdue > 0 ? ' hot' : ''}`}
  onClick={() => setAppView('invoices')}
  style={{ cursor: 'pointer' }}
  title="Zu Finanzen"
>
  <span className="hd-pulse-k">GELD UNTERWEGS</span>
  <span className="hd-pulse-v">{eur0(recv.open + recv.overdue)}</span>
  {recv.overdue > 0 && (
    <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
      davon {eur0(recv.overdue)} überfällig
    </span>
  )}
</div>
```
`setAppView` aus dem ui.store holen: `const setAppView = useUiStore(s => s.setAppView)` (Import prüfen — DashboardRoute nutzt useUiStore evtl. schon).

- [ ] **Step 3: FinanceRoute-Cockpit auf dieselbe Lib** (Zeilen 454-456):

```ts
const recvTotals = useMemo(() => receivables(realInvoices, payments), [realInvoices, payments])
const openTotal    = recvTotals.open
const overdueTotal = recvTotals.overdue
```
(Alte reduce-Memos ersetzen; `openInvoices`/`overdueInvoices` als Listen bleiben für die Kachel-Zähler bestehen.)

- [ ] **Step 4: Verifizieren** — `npx tsc --noEmit`; `npx vitest run` grün.

- [ ] **Step 5: Commit** — `git commit -am "feat(dashboard): Geld unterwegs = alle offenen Forderungen mit Ueberfaellig-Split, klickbar"`

---

### Task 7: Pure Lib `pipeline-potential`

**Files:**
- Create: `src/lib/finance/pipeline-potential.ts`
- Test: `src/lib/finance/pipeline-potential.test.ts`

**Interfaces:**
- Consumes: `Deal` (`{ stage: string; value?: number }`), `PipelineStage` (`{ name, isWon, isLost }`) aus `@/types/pipeline.types`.
- Produces: `pipelinePotential(deals: Deal[], stages: PipelineStage[]): number`.

- [ ] **Step 1: Failing Test**

```ts
// src/lib/finance/pipeline-potential.test.ts
import { describe, it, expect } from 'vitest'
import { pipelinePotential } from './pipeline-potential'
import type { Deal, PipelineStage } from '@/types/pipeline.types'

const deal = (stage: string, value?: number): Deal =>
  ({ id: 'd', workspaceId: 'ws', createdBy: 'u', accountId: 'a', title: 'T', stage, value, currency: 'EUR', createdAt: '', updatedAt: '' } as Deal)
const stg = (name: string, isWon = false, isLost = false): PipelineStage =>
  ({ id: name, workspaceId: 'ws', name, label: name, orderIndex: 0, color: '', isWon, isLost, createdAt: '', updatedAt: '' })

describe('pipelinePotential', () => {
  it('summiert offene Deals; won/lost via Flags ausgeschlossen — auch umbenannt', () => {
    const stages = [stg('lead'), stg('abschluss', true), stg('verloren', false, true)]
    const sum = pipelinePotential([
      deal('lead', 1500), deal('lead', 500),
      deal('abschluss', 9999), deal('verloren', 9999),
    ], stages)
    expect(sum).toBe(2000)
  })
  it('Deals ohne Wert zählen 0; unbekannte Stage: Namens-Fallback won/lost', () => {
    expect(pipelinePotential([deal('lead'), deal('won', 500), deal('lost', 500)], [])).toBe(0)
  })
})
```

- [ ] **Step 2: RED beweisen** — `npx vitest run src/lib/finance/pipeline-potential.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

```ts
// src/lib/finance/pipeline-potential.ts
import type { Deal, PipelineStage } from '@/types/pipeline.types'

/** Summe der Werte aller offenen Deals. Won/Lost über die Stage-Flags
 *  aufgelöst (Stages sind umbenennbar); Namens-Fallback für Alt-Daten.
 *  Bewusst ungewichtet — Stage-Wahrscheinlichkeiten wären Pseudo-Präzision. */
export function pipelinePotential(deals: Deal[], stages: PipelineStage[]): number {
  const byName = new Map(stages.map(s => [s.name, s]))
  let sum = 0
  for (const d of deals) {
    const st = byName.get(d.stage)
    const won  = st ? st.isWon  : d.stage === 'won'
    const lost = st ? st.isLost : d.stage === 'lost'
    if (won || lost) continue
    sum += d.value ?? 0
  }
  return Math.round(sum * 100) / 100
}
```

- [ ] **Step 4: GREEN beweisen**, dann **Step 5: Commit** — `git commit -am "feat(finanzen): pipelinePotential() — offene Deal-Werte ueber Stage-Flags"`

---

### Task 8: Pipeline-Kachel + Wert-Erfassung beim Deal-Anlegen

**Files:**
- Modify: `src/routes/DashboardRoute.tsx` (viertes Puls-Segment nach Zeile 199)
- Modify: `src/store/leads.store.ts` (`convertToDeal`, Zeilen 103, 140-149)
- Modify: `src/components/leads/QualifyModal.tsx` (Wert-Feld)
- Modify: `src/components/leads/ConvertLeadChoice.tsx` (Wert-Feld im Deal-Zweig)
- Modify: `src/routes/LeadsRoute.tsx` (`handleQualifyConfirm`, `handleConvertChoice`)
- Modify: `src/components/leads/LeadDetailModal.tsx`, `src/routes/leverage/LeverageLeadsRoute.tsx` (`handleConvertChoice`-Signatur)

**Interfaces:**
- Consumes: `pipelinePotential` (Task 7); `useDealsStore` (`deals`, `loadAll(workspaceId)`); `usePipelineStore` (`stages`).
- Produces: `convertToDeal(id, workspaceId, userId, value?: number)` — Default 0, bestehende Aufrufer bleiben gültig. `QualifyModal.onConfirm(appointmentDate?: string, dealValue?: number)`. `ConvertLeadChoice.onChoose(withDeal: boolean, dealValue?: number)`.

- [ ] **Step 1: `convertToDeal` um optionalen Wert erweitern** (leads.store.ts):

Signatur (Interface Zeile 23 + Implementierung Zeile 103):
```ts
convertToDeal: (id: string, workspaceId: string, userId: string, value?: number) => Promise<void>
```
Im `DealsService.upsert`-Payload (Zeile ~147): `value: value ?? 0,`

- [ ] **Step 2: QualifyModal — Wert-Feld** (unter dem Datums-Feld, gleiche Optik):

```tsx
const [value, setValue] = useState('')
// im JSX unter dem Datum-Input:
<div style={{ marginTop: 12 }}>
  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
    Geschätzter Auftragswert (€) <span style={{ fontWeight: 400 }}>(optional)</span>
  </label>
  <input className="mock-input" type="number" min="0" step="100" value={value}
    onChange={e => setValue(e.target.value)} placeholder="z. B. 2500" />
</div>
```
`handleConfirm` übergibt: `await onConfirm(date || undefined, value ? Number(value) : undefined)`; Props-Typ: `onConfirm: (appointmentDate?: string, dealValue?: number) => Promise<void>`.

- [ ] **Step 3: ConvertLeadChoice — Wert-Feld** (zwischen Erklärtext und Buttons; Wert wird nur im `withDeal`-Zweig übergeben):

```tsx
const [value, setValue] = useState('')
// JSX vor der Button-Spalte:
<div style={{ marginBottom: 16 }}>
  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
    Geschätzter Auftragswert (€) <span style={{ fontWeight: 400 }}>(optional, nur mit Deal)</span>
  </label>
  <input className="mock-input" type="number" min="0" step="100" value={value}
    onChange={e => setValue(e.target.value)} placeholder="z. B. 2500" />
</div>
```
`choose(true)` ruft `onChoose(true, value ? Number(value) : undefined)`; `choose(false)` ruft `onChoose(false)`. Props: `onChoose: (withDeal: boolean, dealValue?: number) => void | Promise<void>`.
Bestehenden Component-Test `ConvertLeadChoice.test.tsx` anpassen: `expect(onChoose).toHaveBeenCalledWith(true, undefined)` bzw. `(false)` — plus neuer Fall: Wert „2500" eingeben → `toHaveBeenCalledWith(true, 2500)`.

- [ ] **Step 4: Aufrufer durchreichen**
  - `LeadsRoute.handleQualifyConfirm(appointmentDate?, dealValue?)` → `convertToDeal(leadId, workspaceId, userId, dealValue)`.
  - `LeadsRoute.handleConvertChoice(withDeal, dealValue?)` → im withDeal-Zweig `convertToDeal(..., dealValue)`.
  - Gleiches Muster in `LeadDetailModal.handleConvertChoice` und `LeverageLeadsRoute.handleConvertChoice`.

- [ ] **Step 5: Pipeline-Kachel auf Mein Tag** (DashboardRoute, nach Segment 3 Zeile 199):

```tsx
{/* Segment 4: Pipeline-Potenzial — Summe offener Deal-Werte (ungewichtet) */}
<div className="hd-pulse-stat" onClick={() => setAppView('leverage_pipeline')} style={{ cursor: 'pointer' }} title="Zur Pipeline">
  <span className="hd-pulse-k">PIPELINE</span>
  <span className="hd-pulse-v">{eur0(pipelineSum)}</span>
</div>
```
Ableitung + Laden:
```ts
const deals       = useDealsStore(s => s.deals)
const stages      = usePipelineStore(s => s.stages)
const loadDeals   = useDealsStore(s => s.loadAll)
useEffect(() => { if (workspaceId) loadDeals(workspaceId) }, [workspaceId, loadDeals])
const pipelineSum = useMemo(() => pipelinePotential(deals, stages), [deals, stages])
```
Imports ergänzen (`useDealsStore`, `usePipelineStore`, `pipelinePotential`). Die View-Id ist `'leverage_pipeline'` (NavSidebar.tsx:143).

- [ ] **Step 6: Verifizieren** — `npx vitest run` komplett + `npx tsc --noEmit` sauber.

- [ ] **Step 7: Commit** — `git commit -am "feat(dashboard): Pipeline-Potenzial-Kachel + Auftragswert beim Qualifizieren/Konvertieren"`

---

### Task 9: Gesamtverifikation

- [ ] **Step 1:** `npx vitest run` — alle Tests grün (Erwartung: 859 + neue).
- [ ] **Step 2:** `npx tsc --noEmit` — keine Fehler.
- [ ] **Step 3:** `cargo test --manifest-path src-tauri/Cargo.toml` — unverändert grün (kein Rust-Touch in diesem Plan; nur Absicherung).
- [ ] **Step 4:** Plan-Checkboxen abhaken, ggf. Restpunkte notieren.
