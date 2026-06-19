# Finance Cloud-first — Plan 1: Fundament + Lese-Pfad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Im geteilten/Cloud-Workspace liest die App Rechnungen, Angebote und Zahlungen **direkt aus Supabase** (statt lokal) und empfängt Änderungen per Realtime; Solo-Workspaces bleiben unverändert lokal.

**Architecture:** Dasselbe Muster wie der `accounts`-Pilot — ein `FinanceGateway` entscheidet pro Aufruf solo→`FinanceService` (Tauri `invoke`) / shared→`supabase`, reine Mapper konvertieren Row↔Typ, `useWorkspaceRealtime` abonniert die Finanz-Tabellen. **Dieser Plan ist NUR der Lese-Pfad + DB-Setup.** Schreiben/Finalisieren/Nummernvergabe/Entwurf-Rechte = Plan 2.

**Tech Stack:** React + Zustand + TypeScript, `@supabase/supabase-js`, Tauri `invoke`, Vitest. Supabase: Postgres + RLS + Realtime.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-19-finance-cloud-first-design.md`. Muster: `src/data/accounts.gateway.ts`, `src/data/accounts.mapper.ts`, `src/core/sync/useWorkspaceRealtime.ts`.

---

## File Structure
- **Create** `src/data/finance.mapper.ts` — Row↔Typ für invoice/item/offer/offerItem/payment (rein, testbar).
- **Create** `src/data/finance.mapper.test.ts`.
- **Create** `src/data/finance.gateway.ts` — `FinanceGateway` Lese-Methoden, Routing solo/shared.
- **Create** `src/data/finance.gateway.test.ts`.
- **Modify** `src/store/finance.store.ts` — Lese-Aufrufe (`loadAll`, `selectInvoice`, `selectOffer`, `loadPayments`) über das Gateway.
- **Modify** `src/core/sync/useWorkspaceRealtime.ts` — Finanz-Channels (invoices/offers/payments) ergänzen.

Spalten (snake_case, aus `src-tauri/src/db/schema.rs`): invoices(id, workspace_id, created_by, account_id, deal_id, number, date, due_date, status, tax_mode, subtotal, tax_amount, total, bank_info, notes, pdf_path, is_suggestion, suggested_by, approved_by, pending_sync, created_at, updated_at); invoice_items(id, invoice_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit); offers(id, workspace_id, created_by, account_id, number, title, status, valid_until, tax_mode, subtotal, tax_amount, total, notes, pdf_path, converted_invoice_id, pending_sync, created_at, updated_at); offer_items(wie invoice_items mit offer_id); payments(id, workspace_id, invoice_id, amount, paid_at, method, note, created_at).

---

## Task 1: DB-Setup & Verifikation (mensch-unterstützt, Supabase SQL-Editor)

**Files:** keine Code-Dateien — Supabase-Migrationen via SQL-Editor. Ergebnisse zurückmelden.

- [ ] **Step 1: Finanz-Schema gegen den Desktop-Code verifizieren**

Im SQL-Editor ausführen, Ergebnis prüfen — bestätigt, ob die Supabase-Spalten zu obiger Liste passen (insb. `invoice_items.item_date`/`unit`, `invoice_sequences.format`/`seq_year`):
```sql
select string_agg(table_name || ': ' || cols, E'\n\n' order by table_name)
from (
  select c.table_name, string_agg(c.column_name, ', ' order by c.ordinal_position) cols
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name in ('invoices','invoice_items','offers','offer_items','invoice_sequences','offer_sequences')
  group by c.table_name
) x;
```
Expected: Spalten entsprechen der File-Structure-Liste. Abweichungen → Mapper in Task 2 anpassen.

- [ ] **Step 2: Bestehende Finanz-RLS-Policies auslesen** (werden in Plan 2 ersetzt; hier nur dokumentieren)
```sql
select string_agg(tablename||': '||policyname||' ('||cmd||') using='||coalesce(qual,'-'), E'\n' order by tablename,policyname)
from pg_policies where schemaname='public'
  and tablename in ('invoices','invoice_items','offers','offer_items');
```

- [ ] **Step 3: `payments`-Tabelle anlegen (fehlt in Supabase)**
```sql
create table if not exists public.payments (
  id           text primary key,
  workspace_id text not null,
  invoice_id   text not null references public.invoices(id) on delete cascade,
  amount       double precision not null,
  paid_at      text not null,
  method       text,
  note         text,
  created_at   text not null default now()::text
);
alter table public.payments enable row level security;
drop policy if exists payments_ws on public.payments;
create policy payments_ws on public.payments
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
```
(Hinweis: owner-only-Verschärfung für payments kommt in Plan 2 mit dem Rechte-Modell; hier erst membership-scoped, damit Realtime/Read funktionieren.)

- [ ] **Step 4: Realtime für die Finanz-Tabellen einschalten**
```sql
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_items','offers','offer_items','payments']
  loop
    if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
    execute format('alter table public.%I replica identity full;', t);
  end loop;
end $$;
```

- [ ] **Step 5: Ergebnis festhalten** — Schema-Abweichungen aus Step 1/2 notieren (fließen in Task 2/Plan 2 ein). Kein Commit (reine DB-Änderungen).

---

## Task 2: Finance-Mapper

**Files:** Create `src/data/finance.mapper.ts`, `src/data/finance.mapper.test.ts`

- [ ] **Step 1: Failing test**
```ts
// src/data/finance.mapper.test.ts
import { describe, it, expect } from 'vitest'
import { invoiceRowToInvoice, invoiceItemRowToItem, offerRowToOffer, paymentRowToPayment } from './finance.mapper'

describe('finance.mapper', () => {
  it('invoiceRowToInvoice mappt snake→camel', () => {
    const inv = invoiceRowToInvoice({
      id:'i1', workspace_id:'ws1', created_by:'u1', account_id:'a1', deal_id:null,
      number:null, date:'2026-01-01', due_date:'2026-01-15', status:'draft', tax_mode:'standard',
      subtotal:100, tax_amount:19, total:119, bank_info:'{}', notes:null, pdf_path:null,
      is_suggestion:0, suggested_by:null, approved_by:null, pending_sync:0,
      created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-02T00:00:00Z',
    })
    expect(inv.workspaceId).toBe('ws1')
    expect(inv.accountId).toBe('a1')
    expect(inv.taxAmount).toBe(19)
    expect(inv.isSuggestion).toBe(false)
    expect(inv.number).toBeUndefined()
  })
  it('invoiceItemRowToItem mappt inkl. optionaler Felder', () => {
    const it = invoiceItemRowToItem({ id:'it1', invoice_id:'i1', title:'Pos', description:null,
      quantity:2, unit_price:50, tax_rate:19, total:100, sort_order:0, item_date:null, unit:null })
    expect(it.invoiceId).toBe('i1'); expect(it.unitPrice).toBe(50); expect(it.taxRate).toBe(19)
  })
  it('paymentRowToPayment mappt', () => {
    const p = paymentRowToPayment({ id:'p1', workspace_id:'ws1', invoice_id:'i1', amount:50,
      paid_at:'2026-01-10', method:'bank', note:null, created_at:'2026-01-10T00:00:00Z' })
    expect(p.invoiceId).toBe('i1'); expect(p.amount).toBe(50)
  })
})
```

- [ ] **Step 2: Test ausführen → FAIL**
Run: `npx vitest run src/data/finance.mapper.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**
```ts
// src/data/finance.mapper.ts
import type { Invoice, InvoiceItem, Offer, OfferItem, Payment } from '@/types/finance.types'

export function invoiceRowToInvoice(r: any): Invoice {
  return {
    id: r.id, workspaceId: r.workspace_id, createdBy: r.created_by, accountId: r.account_id,
    dealId: r.deal_id ?? undefined, number: r.number ?? undefined, date: r.date, dueDate: r.due_date,
    status: r.status, taxMode: r.tax_mode, subtotal: r.subtotal, taxAmount: r.tax_amount, total: r.total,
    bankInfo: r.bank_info ?? '{}', notes: r.notes ?? undefined, pdfPath: r.pdf_path ?? undefined,
    isSuggestion: !!r.is_suggestion, suggestedBy: r.suggested_by ?? undefined,
    approvedBy: r.approved_by ?? undefined, pendingSync: !!r.pending_sync,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}
export function invoiceItemRowToItem(r: any): InvoiceItem {
  return {
    id: r.id, invoiceId: r.invoice_id, title: r.title, description: r.description ?? undefined,
    quantity: r.quantity, unitPrice: r.unit_price, taxRate: r.tax_rate, total: r.total,
    sortOrder: r.sort_order, itemDate: r.item_date ?? undefined, unit: r.unit ?? undefined,
  }
}
export function offerRowToOffer(r: any): Offer {
  return {
    id: r.id, workspaceId: r.workspace_id, createdBy: r.created_by, accountId: r.account_id,
    number: r.number ?? undefined, title: r.title, status: r.status, validUntil: r.valid_until,
    taxMode: r.tax_mode, subtotal: r.subtotal, taxAmount: r.tax_amount, total: r.total,
    notes: r.notes ?? undefined, pdfPath: r.pdf_path ?? undefined,
    convertedInvoiceId: r.converted_invoice_id ?? undefined, pendingSync: !!r.pending_sync,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}
export function offerItemRowToItem(r: any): OfferItem {
  return {
    id: r.id, offerId: r.offer_id, title: r.title, description: r.description ?? undefined,
    quantity: r.quantity, unitPrice: r.unit_price, taxRate: r.tax_rate, total: r.total,
    sortOrder: r.sort_order, itemDate: r.item_date ?? undefined, unit: r.unit ?? undefined,
  }
}
export function paymentRowToPayment(r: any): Payment {
  return {
    id: r.id, workspaceId: r.workspace_id, invoiceId: r.invoice_id, amount: r.amount,
    paidAt: r.paid_at, method: r.method ?? undefined, note: r.note ?? undefined, createdAt: r.created_at,
  }
}
```

- [ ] **Step 4: Test ausführen → PASS**
Run: `npx vitest run src/data/finance.mapper.test.ts` — Expected: PASS (3 Tests).

- [ ] **Step 5: Typecheck + Commit**
Run: `npx tsc --noEmit` (clean)
```bash
git add src/data/finance.mapper.ts src/data/finance.mapper.test.ts
git commit -m "feat(data): finance row<->type mappers"
```

---

## Task 3: FinanceGateway — Lese-Pfad (Routing solo/shared)

**Files:** Create `src/data/finance.gateway.ts`, `src/data/finance.gateway.test.ts`

- [ ] **Step 1: Failing test (Routing)**
```ts
// src/data/finance.gateway.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/services/finance.service', () => ({
  FinanceService: { getInvoices: vi.fn(), getOffers: vi.fn(), getPaymentsByWorkspace: vi.fn(), getInvoice: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: vi.fn() } }))
const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) }
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => chain) } }))

import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { FinanceGateway } from './finance.gateway'

describe('FinanceGateway read routing', () => {
  beforeEach(() => vi.clearAllMocks())
  it('getInvoices solo → FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.getInvoices).mockResolvedValueOnce([])
    await FinanceGateway.getInvoices('ws1')
    expect(FinanceService.getInvoices).toHaveBeenCalledWith('ws1', undefined)
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('getInvoices shared → supabase.invoices', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.getInvoices('ws1')
    expect(supabase.from).toHaveBeenCalledWith('invoices')
    expect(FinanceService.getInvoices).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test ausführen → FAIL**
Run: `npx vitest run src/data/finance.gateway.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren (nur Lese-Methoden)**
```ts
// src/data/finance.gateway.ts
import { supabase } from '@/lib/supabase'
import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import {
  invoiceRowToInvoice, invoiceItemRowToItem, offerRowToOffer, offerItemRowToItem, paymentRowToPayment,
} from './finance.mapper'
import type { Invoice, InvoiceWithItems, Offer, OfferWithItems, Payment, InvoiceStatus } from '@/types/finance.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}

export const FinanceGateway = {
  async getInvoices(workspaceId: string, statusFilter?: InvoiceStatus | 'suggestions'): Promise<Invoice[]> {
    if (!shared()) return FinanceService.getInvoices(workspaceId, statusFilter)
    let q = supabase.from('invoices').select('*').eq('workspace_id', workspaceId)
    if (statusFilter === 'suggestions') q = q.eq('is_suggestion', true)
    else if (statusFilter) q = q.eq('status', statusFilter)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(invoiceRowToInvoice)
  },

  async getInvoice(id: string): Promise<InvoiceWithItems> {
    if (!shared()) return FinanceService.getInvoice(id)
    const [invRes, itemRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order', { ascending: true }),
    ])
    if (invRes.error) throw invRes.error
    if (itemRes.error) throw itemRes.error
    return { invoice: invoiceRowToInvoice(invRes.data), items: (itemRes.data ?? []).map(invoiceItemRowToItem) }
  },

  async getInvoicesByAccount(accountId: string): Promise<Invoice[]> {
    if (!shared()) return FinanceService.getInvoicesByAccount(accountId)
    const { data, error } = await supabase.from('invoices').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(invoiceRowToInvoice)
  },

  async getOffers(workspaceId: string): Promise<Offer[]> {
    if (!shared()) return FinanceService.getOffers(workspaceId)
    const { data, error } = await supabase.from('offers').select('*')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(offerRowToOffer)
  },

  async getOffer(id: string): Promise<OfferWithItems> {
    if (!shared()) return FinanceService.getOffer(id)
    const [offRes, itemRes] = await Promise.all([
      supabase.from('offers').select('*').eq('id', id).single(),
      supabase.from('offer_items').select('*').eq('offer_id', id).order('sort_order', { ascending: true }),
    ])
    if (offRes.error) throw offRes.error
    if (itemRes.error) throw itemRes.error
    return { offer: offerRowToOffer(offRes.data), items: (itemRes.data ?? []).map(offerItemRowToItem) }
  },

  async getOffersByAccount(accountId: string): Promise<Offer[]> {
    if (!shared()) return FinanceService.getOffersByAccount(accountId)
    const { data, error } = await supabase.from('offers').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(offerRowToOffer)
  },

  async getPaymentsByWorkspace(workspaceId: string): Promise<Payment[]> {
    if (!shared()) return FinanceService.getPaymentsByWorkspace(workspaceId)
    const { data, error } = await supabase.from('payments').select('*')
      .eq('workspace_id', workspaceId).order('paid_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(paymentRowToPayment)
  },

  async getPayments(invoiceId: string): Promise<Payment[]> {
    if (!shared()) return FinanceService.getPayments(invoiceId)
    const { data, error } = await supabase.from('payments').select('*')
      .eq('invoice_id', invoiceId).order('paid_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(paymentRowToPayment)
  },
}
```

- [ ] **Step 4: Test ausführen → PASS**
Run: `npx vitest run src/data/finance.gateway.test.ts` — Expected: PASS (2 Tests).

- [ ] **Step 5: Typecheck + Commit**
Run: `npx tsc --noEmit` (clean)
```bash
git add src/data/finance.gateway.ts src/data/finance.gateway.test.ts
git commit -m "feat(data): FinanceGateway read-path routes solo/shared"
```

---

## Task 4: Store-Lese-Pfad + Realtime

**Files:** Modify `src/store/finance.store.ts`, `src/core/sync/useWorkspaceRealtime.ts`

- [ ] **Step 1: Store-Lesepfade auf das Gateway umstellen**
In `src/store/finance.store.ts` Import ergänzen:
```ts
import { FinanceGateway } from '@/data/finance.gateway'
```
Ersetzungen (nur Lese-Aufrufe; Schreib-Methoden bleiben vorerst auf `FinanceService` — Plan 2):
- `loadAll`: die drei `FinanceService.get…` → `FinanceGateway.getInvoices(workspaceId)`, `FinanceGateway.getOffers(workspaceId)`, `FinanceGateway.getPaymentsByWorkspace(workspaceId)`.
- `selectInvoice`: `FinanceService.getInvoice(id)` → `FinanceGateway.getInvoice(id)`.
- `selectOffer`: `FinanceService.getOffer(id)` → `FinanceGateway.getOffer(id)`.
- `loadPayments`: `FinanceService.getPaymentsByWorkspace` → `FinanceGateway.getPaymentsByWorkspace`.
- In `addPayment`/`deletePayment` die nachladenden `FinanceService.getInvoices`/`getPaymentsByWorkspace` ebenfalls auf `FinanceGateway.*` umstellen (Lesen).
`FinanceService`-Import bleibt (Schreib-Methoden nutzen ihn weiter).

- [ ] **Step 2: Realtime-Channels ergänzen**
In `src/core/sync/useWorkspaceRealtime.ts` zusätzlich zu `accounts` Channels für `invoices`, `offers`, `payments` (gefiltert `workspace_id=eq.<id>`) abonnieren. Bei einem Event den jeweiligen Store neu laden (einfachste, korrekte Variante — kein feingranulares Merge nötig):
```ts
import { useFinanceStore } from '@/store/finance.store'
// … innerhalb des useEffect, nach dem accounts-Channel, wenn isShared:
const finance = supabase
  .channel(`ws-finance-${activeWorkspaceId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `workspace_id=eq.${activeWorkspaceId}` },
      () => { useFinanceStore.getState().loadAll(activeWorkspaceId); useFinanceStore.getState().loadKpis(activeWorkspaceId) })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `workspace_id=eq.${activeWorkspaceId}` },
      () => { useFinanceStore.getState().loadAll(activeWorkspaceId) })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `workspace_id=eq.${activeWorkspaceId}` },
      () => { useFinanceStore.getState().loadAll(activeWorkspaceId) })
  .subscribe()
```
…und im Cleanup `supabase.removeChannel(finance)` zusätzlich zum bestehenden accounts-Channel. (Reload-on-event ist bewusst grob gehalten; bei den kleinen Datenmengen unkritisch und vermeidet Merge-Bugs.)

- [ ] **Step 3: Typecheck + volle Suite**
Run: `npx tsc --noEmit && npx vitest run`
Expected: keine Typfehler; alle Tests grün (bestehende finance/store-Tests laufen im Solo-Mock weiter über die delegierende Gateway-Schicht).

- [ ] **Step 4: Commit**
```bash
git add src/store/finance.store.ts src/core/sync/useWorkspaceRealtime.ts
git commit -m "feat(finance): route store reads through gateway + realtime"
```

- [ ] **Step 5: Manuelle Verifikation (im geteilten Workspace)**
Owner-Gerät: eine Rechnung existiert in Supabase (via SQL einfügen oder über die noch lokale Schreib-Methode im Solo + späteren Plan-2-Pfad). Erwartung: im Cloud-Workspace zeigt die Finanzen-Liste die Supabase-Daten; ein zweites Owner-Gerät sieht Änderungen nach Realtime-Event. (Voller Schreib-/Finalisierungs-Test in Plan 2.)

---

## Self-Review-Notiz (Plan-Autor)
- **Spec-Abdeckung:** Deckt aus der Spec ab: FinanceGateway (Lesen), Mapper, Realtime, `payments`-Tabelle, RLS/Realtime-Einschalten, Schema-Verifikation. **Bewusst NICHT hier (→ Plan 2):** Schreib-Pfad (create/update/delete), atomare Nummernvergabe (`allocate_invoice_number`), Entwurf-Rechte/`can_view_finance`/UI-Gating, owner-only-payments-Verschärfung, `convertOfferToInvoice`, `company_settings`-Cloud.
- **Annahme (Task 1 verifiziert):** Supabase-Finanz-Spalten == `schema.rs`. Drift (z. B. `item_date`/`unit`, `format`/`seq_year`) wird in Task 1 bestätigt; Mapper sind null-tolerant (`?? undefined`), brechen also bei fehlender Optional-Spalte nicht.
- **Platzhalter:** keine.
- **Typkonsistenz:** Gateway-Methodennamen spiegeln `FinanceService` (getInvoices/getInvoice/getInvoicesByAccount/getOffers/getOffer/getOffersByAccount/getPaymentsByWorkspace/getPayments); Mapper-Namen konsistent über Tasks 2–4.
