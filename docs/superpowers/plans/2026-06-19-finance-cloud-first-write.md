# Finance Cloud-first — Plan 2: Schreib-Pfad + atomare GoBD-Nummernvergabe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Im geteilten/Cloud-Workspace kann der Owner Rechnungen anlegen/bearbeiten/löschen und finalisieren — mit lückenloser, atomar vergebener GoBD-Nummer; Solo bleibt lokal.

**Architecture:** `FinanceGateway` (aus Plan 1) bekommt Schreib-Methoden: shared→Supabase, solo→`FinanceService`. Die Nummernvergabe läuft als **`SECURITY DEFINER`-Postgres-Funktion** `allocate_invoice_number(ws)` (Row-Lock, spiegelt die Rust-Logik), aufgerufen beim Finalisieren (Status→'open') und beim Freigeben eines Vorschlags. Komposit-Schreiben (Rechnung + Positionen) sequenziell über den JS-Client.

**Tech Stack:** React + Zustand + TS, `@supabase/supabase-js`, Postgres/plpgsql, Vitest.

**Referenz:** Spec `docs/superpowers/specs/2026-06-19-finance-cloud-first-design.md`; Plan 1 `…-finance-cloud-first-pipe.md`. Rust-Vorlage: `src-tauri/src/db/invoice.rs` (`next_invoice_number`, `compute_next_counter`, `apply_invoice_format`, `update_status` L456-, `approve_suggestion` L436-).

**Scope:** NUR Rechnungen-Schreiben + Nummernvergabe + Finalisieren/Freigeben. NICHT hier (→ Plan 3): Entwurf-Rechte/`can_view_finance`/UI-Gating, owner-only payments, Angebote-Schreiben + `convertOfferToInvoice`, `company_settings`-Cloud, `loadKpis`-Gateway.

---

## File Structure
- **Modify** (Supabase, Task 1) `invoice_sequences` (Spalten sicherstellen) + neue Funktion `allocate_invoice_number`.
- **Modify** `src/data/finance.mapper.ts` — `invoicePayloadToRow`, `invoiceItemPayloadToRow`.
- **Modify** `src/data/finance.gateway.ts` — Schreib-Methoden: `createInvoice`, `updateInvoice`, `deleteInvoice`, `updateInvoiceStatus`, `approveInvoiceSuggestion`.
- **Modify** `src/store/finance.store.ts` — diese fünf Methoden über das Gateway.

---

## Task 1: DB — Sequenz-Spalten + atomare Nummern-Funktion (Nutzer, Supabase SQL)

- [ ] **Step 1: Sequenz-Spalten + created_at-Default sicherstellen** (idempotent)
```sql
alter table public.invoice_sequences add column if not exists format text;
alter table public.invoice_sequences add column if not exists seq_year integer;
alter table public.invoices alter column created_at set default now()::text;
```

- [ ] **Step 2: Atomare Nummern-Funktion anlegen** (spiegelt Rust `next_invoice_number`)
```sql
create or replace function public.allocate_invoice_number(ws_id text)
returns text language plpgsql security definer as $$
declare
  v_next int; v_start int; v_format text; v_seq_year int;
  v_cur_year int := extract(year from now())::int;
  v_to_use int; v_has_year boolean; v_nrun text; v_number text;
begin
  insert into public.invoice_sequences (workspace_id, next_number, start_number)
    values (ws_id, 0, 1) on conflict (workspace_id) do nothing;

  select next_number, coalesce(start_number,1),
         coalesce(nullif(format,''),'{YYYY}-{NNNNN}'), coalesce(seq_year,0)
    into v_next, v_start, v_format, v_seq_year
    from public.invoice_sequences where workspace_id = ws_id
    for update;

  v_has_year := position('{YYYY}' in v_format) > 0 or position('{YY}' in v_format) > 0;
  if v_seq_year <> 0 and v_seq_year <> v_cur_year and v_has_year then
    v_to_use := v_start;          -- Jahres-Reset
  else
    v_to_use := v_next + 1;
  end if;

  v_number := replace(v_format, '{YYYY}', to_char(now(),'YYYY'));
  v_number := replace(v_number, '{YY}',  to_char(now(),'YY'));
  v_number := replace(v_number, '{MM}',  to_char(now(),'MM'));
  v_nrun := substring(v_number from '\{(N+)\}');   -- z.B. "NNNNN"
  if v_nrun is not null then
    v_number := replace(v_number, '{'||v_nrun||'}', lpad(v_to_use::text, length(v_nrun), '0'));
  end if;

  update public.invoice_sequences
    set next_number = v_to_use, seq_year = v_cur_year
    where workspace_id = ws_id;

  return v_number;
end $$;
```

- [ ] **Step 3: Funktion testen** (zweimal aufrufen → fortlaufend)
```sql
select public.allocate_invoice_number('b65fb0db-a75b-4e1d-ad62-e912edc8f9ac');
select public.allocate_invoice_number('b65fb0db-a75b-4e1d-ad62-e912edc8f9ac');
```
Expected: zwei aufeinanderfolgende Nummern (z. B. `2026-00001`, `2026-00002`). Ergebnis zurückmelden. **Danach** den hochgezählten `next_number` für diesen Test-Workspace zurücksetzen, falls echte Nummern bei 1 starten sollen:
```sql
update public.invoice_sequences set next_number = 0, seq_year = 0
where workspace_id='b65fb0db-a75b-4e1d-ad62-e912edc8f9ac';
```

---

## Task 2: Payload→Row-Mapper

**Files:** Modify `src/data/finance.mapper.ts`, `src/data/finance.mapper.test.ts`

- [ ] **Step 1: Failing test**
```ts
// in src/data/finance.mapper.test.ts ergänzen:
import { invoicePayloadToRow, invoiceItemPayloadToRow } from './finance.mapper'

describe('finance payload→row', () => {
  it('invoicePayloadToRow setzt defaults + snake_case', () => {
    const r = invoicePayloadToRow(
      { workspaceId:'ws1', createdBy:'u1', accountId:'a1', date:'2026-01-01', dueDate:'2026-01-15',
        subtotal:100, taxAmount:19, total:119, items:[] },
      { id:'i1', now:'2026-01-01T00:00:00Z' })
    expect(r.id).toBe('i1'); expect(r.workspace_id).toBe('ws1'); expect(r.account_id).toBe('a1')
    expect(r.status).toBe('draft'); expect(r.tax_mode).toBe('standard')
    expect(r.bank_info).toBe('{}'); expect(r.is_suggestion).toBe(false)
    expect(r.number).toBeNull(); expect(r.updated_at).toBe('2026-01-01T00:00:00Z')
    expect(r).not.toHaveProperty('created_at')   // DB-Default
  })
  it('invoiceItemPayloadToRow mappt + invoice_id', () => {
    const r = invoiceItemPayloadToRow(
      { title:'Pos', quantity:2, unitPrice:50, taxRate:19, total:100, sortOrder:0 },
      { id:'it1', invoiceId:'i1' })
    expect(r.invoice_id).toBe('i1'); expect(r.unit_price).toBe(50); expect(r.tax_rate).toBe(19)
    expect(r.description).toBeNull()
  })
})
```

- [ ] **Step 2:** `npx vitest run src/data/finance.mapper.test.ts` → FAIL (Funktionen fehlen).

- [ ] **Step 3: Implementieren** (in `src/data/finance.mapper.ts` ergänzen)
```ts
import type { UpsertInvoicePayload, UpsertInvoiceItemPayload } from '@/types/finance.types'

/** UpsertInvoicePayload → invoices-Row (ohne created_at = DB-Default; ohne items). */
export function invoicePayloadToRow(
  p: UpsertInvoicePayload, ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id, workspace_id: p.workspaceId, created_by: p.createdBy, account_id: p.accountId,
    deal_id: p.dealId ?? null, number: p.number ?? null, date: p.date, due_date: p.dueDate,
    status: p.status ?? 'draft', tax_mode: p.taxMode ?? 'standard',
    subtotal: p.subtotal, tax_amount: p.taxAmount, total: p.total,
    bank_info: p.bankInfo ?? '{}', notes: p.notes ?? null,
    is_suggestion: p.isSuggestion ?? false, suggested_by: p.suggestedBy ?? null,
    updated_at: ctx.now,
  }
}

/** UpsertInvoiceItemPayload → invoice_items-Row. */
export function invoiceItemPayloadToRow(
  it: UpsertInvoiceItemPayload, ctx: { id: string; invoiceId: string },
): Record<string, unknown> {
  return {
    id: ctx.id, invoice_id: ctx.invoiceId, title: it.title, description: it.description ?? null,
    quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, total: it.total,
    sort_order: it.sortOrder, item_date: it.itemDate ?? null, unit: it.unit ?? null,
  }
}
```

- [ ] **Step 4:** `npx vitest run src/data/finance.mapper.test.ts` → PASS. Dann `npx tsc --noEmit` (clean).
- [ ] **Step 5: Commit**
```bash
git add src/data/finance.mapper.ts src/data/finance.mapper.test.ts
git commit -m "feat(data): finance invoice payload->row mappers"
```

---

## Task 3: Gateway — createInvoice / updateInvoice / deleteInvoice

**Files:** Modify `src/data/finance.gateway.ts`, `src/data/finance.gateway.test.ts`

- [ ] **Step 1: Failing test (Routing create)**
```ts
// in finance.gateway.test.ts: FinanceService-Mock um createInvoice/updateInvoice/deleteInvoice ergänzen,
// supaChain um insert/update/delete (chainable) erweitern (insert/update/delete → returns chain; eq/select/single/order wie gehabt).
it('createInvoice solo → FinanceService', async () => {
  vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
  vi.mocked(FinanceService.createInvoice).mockResolvedValueOnce({ invoice: { id:'i1' }, items: [] } as any)
  await FinanceGateway.createInvoice({ workspaceId:'ws1', createdBy:'u1', accountId:'a1',
    date:'d', dueDate:'d', subtotal:0, taxAmount:0, total:0, items:[] })
  expect(FinanceService.createInvoice).toHaveBeenCalled()
  expect(supabase.from).not.toHaveBeenCalled()
})
it('createInvoice shared → supabase.invoices insert', async () => {
  vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
  vi.mocked(useAuthStore.getState as any) // siehe Hinweis unten
  await FinanceGateway.createInvoice({ workspaceId:'ws1', createdBy:'u1', accountId:'a1',
    date:'d', dueDate:'d', subtotal:0, taxAmount:0, total:0, items:[] })
  expect(supabase.from).toHaveBeenCalledWith('invoices')
})
```
Hinweis: Der shared-`createInvoice` ruft am Ende `this.getInvoice(id)`; im Test reicht es zu prüfen, dass `supabase.from('invoices')` aufgerufen wurde. Die supaChain muss `insert` (→ chain), `delete` (→ chain) und `single()`/`order()` (→ resolved) unterstützen, damit der Aufruf nicht wirft.

- [ ] **Step 2:** `npx vitest run src/data/finance.gateway.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** (Schreib-Methoden im `FinanceGateway`-Objekt ergänzen; Imports `invoicePayloadToRow, invoiceItemPayloadToRow` aus `./finance.mapper`, `UpsertInvoicePayload, InvoiceWithItems` aus den Typen)
```ts
async createInvoice(payload: UpsertInvoicePayload): Promise<InvoiceWithItems> {
  if (!shared()) return FinanceService.createInvoice(payload)
  const id = payload.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const row = invoicePayloadToRow(payload, { id, now })
  const { error: invErr } = await supabase.from('invoices').insert(row)
  if (invErr) throw invErr
  if (payload.items.length > 0) {
    const itemRows = payload.items.map(it =>
      invoiceItemPayloadToRow(it, { id: it.id ?? crypto.randomUUID(), invoiceId: id }))
    const { error: itErr } = await supabase.from('invoice_items').insert(itemRows)
    if (itErr) throw itErr
  }
  return this.getInvoice(id)
},

async updateInvoice(id: string, payload: UpsertInvoicePayload): Promise<InvoiceWithItems> {
  if (!shared()) return FinanceService.updateInvoice(id, payload)
  const now = new Date().toISOString()
  const row = invoicePayloadToRow(payload, { id, now })
  delete (row as any).id  // id im WHERE, nicht im SET
  const { error: invErr } = await supabase.from('invoices').update(row).eq('id', id)
  if (invErr) throw invErr
  // Positionen ersetzen (wie Rust replace_items)
  const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id)
  if (delErr) throw delErr
  if (payload.items.length > 0) {
    const itemRows = payload.items.map(it =>
      invoiceItemPayloadToRow(it, { id: it.id ?? crypto.randomUUID(), invoiceId: id }))
    const { error: itErr } = await supabase.from('invoice_items').insert(itemRows)
    if (itErr) throw itErr
  }
  return this.getInvoice(id)
},

async deleteInvoice(id: string): Promise<void> {
  if (!shared()) return FinanceService.deleteInvoice(id)
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw error
},
```
Hinweis Atomicity: Komposit-Schreiben ist sequenziell (kein DB-Transaktions-Wrapper über den JS-Client). Für Entwürfe akzeptabel; ein späterer Postgres-RPC kann es atomar machen (Backlog).

- [ ] **Step 4:** `npx vitest run src/data/finance.gateway.test.ts` → PASS. `npx tsc --noEmit` (clean).
- [ ] **Step 5: Commit**
```bash
git add src/data/finance.gateway.ts src/data/finance.gateway.test.ts
git commit -m "feat(data): FinanceGateway invoice write-path (create/update/delete)"
```

---

## Task 4: Gateway — Finalisieren + Vorschlag freigeben (Nummernvergabe)

**Files:** Modify `src/data/finance.gateway.ts`, `src/data/finance.gateway.test.ts`

- [ ] **Step 1: Failing test**
```ts
it('updateInvoiceStatus shared → open ohne Nummer ruft RPC + setzt Nummer', async () => {
  vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
  // supaChain.single() liefert eine Rechnung OHNE number; supabase.rpc → { data:'2026-00001', error:null }
  await FinanceGateway.updateInvoiceStatus('i1', 'open')
  expect((supabase as any).rpc).toHaveBeenCalledWith('allocate_invoice_number', expect.any(Object))
})
```
Hinweis: `supabase`-Mock um `rpc: vi.fn().mockResolvedValue({ data:'2026-00001', error:null })` ergänzen; `single()` muss eine Row mit `workspace_id` + `number:null` liefern.

- [ ] **Step 2:** `npx vitest run src/data/finance.gateway.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**
```ts
async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  if (!shared()) return FinanceService.updateInvoiceStatus(id, status)
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status, updated_at: now }
  // Beim ERSTEN Übergang auf 'open' eine Nummer vergeben (GoBD), falls noch keine.
  if (status === 'open') {
    const { data: cur, error: curErr } = await supabase.from('invoices')
      .select('workspace_id, number').eq('id', id).single()
    if (curErr) throw curErr
    if (cur && !cur.number) {
      const { data: number, error: rpcErr } = await supabase
        .rpc('allocate_invoice_number', { ws_id: cur.workspace_id })
      if (rpcErr) throw rpcErr
      patch.number = number
    }
  }
  const { data, error } = await supabase.from('invoices').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return invoiceRowToInvoice(data)
},

async approveInvoiceSuggestion(id: string, approvedBy: string, workspaceId: string): Promise<Invoice> {
  if (!shared()) return FinanceService.approveInvoiceSuggestion(id, approvedBy, workspaceId)
  const now = new Date().toISOString()
  const { data: number, error: rpcErr } = await supabase
    .rpc('allocate_invoice_number', { ws_id: workspaceId })
  if (rpcErr) throw rpcErr
  const { data, error } = await supabase.from('invoices')
    .update({ number, status: 'open', is_suggestion: false, approved_by: approvedBy, updated_at: now })
    .eq('id', id).select('*').single()
  if (error) throw error
  return invoiceRowToInvoice(data)
},
```
(`invoiceRowToInvoice` ist bereits importiert; `InvoiceStatus`/`Invoice` ebenfalls.)

- [ ] **Step 4:** `npx vitest run src/data/finance.gateway.test.ts` → PASS. `npx tsc --noEmit` (clean).
- [ ] **Step 5: Commit**
```bash
git add src/data/finance.gateway.ts src/data/finance.gateway.test.ts
git commit -m "feat(data): FinanceGateway finalize + approve assign atomic number"
```

---

## Task 5: Store — Schreib-Methoden über das Gateway

**Files:** Modify `src/store/finance.store.ts`

- [ ] **Step 1: Umstellen** (nur diese fünf; Rest unverändert)
- `createInvoice`: `FinanceService.createInvoice(payload)` → `FinanceGateway.createInvoice(payload)`
- `updateInvoice`: `FinanceService.updateInvoice(id, payload)` → `FinanceGateway.updateInvoice(id, payload)`
- `deleteInvoice`: `FinanceService.deleteInvoice(id)` → `FinanceGateway.deleteInvoice(id)`
- `approveInvoiceSuggestion`: `FinanceService.approveInvoiceSuggestion(...)` → `FinanceGateway.approveInvoiceSuggestion(...)`
- `updateInvoiceStatus`: `FinanceService.updateInvoiceStatus(id, status)` → `FinanceGateway.updateInvoiceStatus(id, status)`
Die `tryAutoSaveToAblage`-Aufrufe bleiben (rein UI/Ablage). Offers/payments-Writes bleiben auf `FinanceService` (Plan 3).

- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run` → keine Fehler; alle Tests grün (Solo-Mock delegiert weiter).
- [ ] **Step 3: Commit**
```bash
git add src/store/finance.store.ts
git commit -m "feat(finance): route invoice writes through gateway"
```

- [ ] **Step 4: Manuelle Verifikation (geteilter Workspace, Owner)**
Kunden anlegen (CRM, cloud) → Rechnung als Entwurf anlegen → in der DB `select id, number, status from invoices …` zeigt `number=NULL, status='draft'`. Rechnung finalisieren (Status „offen") → `number` ist gesetzt (z. B. `2026-00001`), zweite finalisierte Rechnung → `…00002` (lückenlos). Zweites Owner-Gerät sieht beides live (Realtime aus Plan 1).

---

## Self-Review-Notiz
- **Spec-Abdeckung:** Schreib-Pfad Rechnungen (create/update/delete), atomare Nummernvergabe (Postgres-Funktion, Rust-treu inkl. Jahres-Reset + Format-Tokens), Finalisieren (Status→open) + Vorschlag-Freigabe. **NICHT hier (→ Plan 3):** Entwurf-RLS/can_view_finance/UI-Gating, owner-only payments, Angebote-Write + convertOfferToInvoice, company_settings.
- **Atomicity-Hinweis:** Komposit-Schreiben sequenziell (kein Transaktions-Wrapper); für Entwürfe akzeptabel, RPC-Atomisierung = Backlog.
- **Annahme:** `invoice_sequences.format/seq_year` werden in Task 1 sichergestellt; `invoices.created_at` bekommt DB-Default.
- **Typkonsistenz:** Gateway-Methoden spiegeln `FinanceService` (createInvoice/updateInvoice/deleteInvoice/updateInvoiceStatus/approveInvoiceSuggestion); Mapper `invoicePayloadToRow`/`invoiceItemPayloadToRow` konsistent.
- **Platzhalter:** keine.
