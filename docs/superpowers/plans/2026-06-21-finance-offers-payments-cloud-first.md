# Finance: Angebote + Payments cloud-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `createOffer/updateOffer/deleteOffer/addPayment/deletePayment/convertOfferToInvoice` in `finance.store` übers `FinanceGateway` routen (solo→`FinanceService` / shared→Supabase), damit der Angebots-/Zahlungs-Flow im geteilten Workspace funktioniert.

**Architecture:** Spiegelt die bestehenden Rechnungs-Writes. Write-Mapper in `finance.mapper.ts`, Schreib-Methoden in `finance.gateway.ts`, Store routet um. Neue Supabase-RPC `allocate_offer_number`. Realtime unverändert.

**Tech Stack:** TypeScript, Zustand, supabase-js, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-finance-offers-payments-cloud-first-design.md`

**Nicht anfassen (WIP):** `src/App.tsx`, `src/components/leads/LeadDetailModal.tsx`, `src/routes/leverage/LeverageLeadsRoute.tsx`, `src-tauri/Cargo.toml`. Nie `git add -A`.

**Befehle:** `npx vitest run <pfad>`; voll `npm run test:run`; `npx tsc --noEmit`.

**Referenz-Fakten:**
- `offers`-Spalten: id, workspace_id, created_by, account_id, number, title, status, valid_until, tax_mode, subtotal, tax_amount, total, notes, pdf_path, converted_invoice_id, pending_sync, created_at, updated_at.
- `offer_items`: id, offer_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit.
- `payments`: id, workspace_id, invoice_id, amount, paid_at, method, note, created_at.
- `UpsertOfferPayload`: id?, workspaceId, createdBy, accountId, title, status?, validUntil, taxMode?, subtotal, taxAmount, total, notes?, items[].
- `CreatePaymentPayload`: workspaceId, invoiceId, amount, paidAt, method?, note?.
- Bestehende Gateway-Helfer in `finance.gateway.ts`: `shared()`, `fail(error)`.

---

### Task 1: Supabase-RPC `allocate_offer_number` (Orchestrator)

Wird vom Controller (nicht im Subagenten) via Management-API deployed + als Migration versioniert.

**Files:** Create `supabase/migrations/0005_allocate_offer_number.sql`

- [ ] **Step 1: Migration schreiben** — `supabase/migrations/0005_allocate_offer_number.sql`:

```sql
-- 0005_allocate_offer_number.sql — laufende Angebotsnummer für Cloud-Angebote
-- ANGEWANDT 2026-06-21 via Management-API (Projekt mqbjmquscjtytpjebosw).
-- Spiegelt das lokale Rust-Format ANG-{YYYY}-{NNN}. offer_sequences hat (anders
-- als invoice_sequences) kein format/seq_year → festes Format.
create or replace function public.allocate_offer_number(ws_id text)
returns text language plpgsql security definer as $$
declare v_next int; v_to_use int;
begin
  insert into public.offer_sequences (workspace_id, next_number, start_number)
    values (ws_id, 0, 1) on conflict (workspace_id) do nothing;
  select next_number into v_next from public.offer_sequences where workspace_id = ws_id for update;
  v_to_use := coalesce(v_next, 0) + 1;
  update public.offer_sequences set next_number = v_to_use where workspace_id = ws_id;
  return 'ANG-' || to_char(now(),'YYYY') || '-' || lpad(v_to_use::text, 3, '0');
end $$;
grant execute on function public.allocate_offer_number(text) to authenticated;
```

- [ ] **Step 2: Deploy** (Controller, via Management-API mit PAT) und verifizieren, dass die Funktion existiert.
- [ ] **Step 3: Commit** `git add supabase/migrations/0005_allocate_offer_number.sql && git commit -m "feat(db): allocate_offer_number RPC for cloud offers"`

---

### Task 2: Write-Mapper (`finance.mapper.ts`)

**Files:** Modify `src/data/finance.mapper.ts`, `src/data/finance.mapper.test.ts`

- [ ] **Step 1: Failing tests anhängen** an `src/data/finance.mapper.test.ts`:

```ts
import { offerPayloadToRow, offerItemPayloadToRow, paymentPayloadToRow } from './finance.mapper'

describe('finance.mapper — offer/payment write', () => {
  it('offerPayloadToRow: Defaults + ohne created_at/number/id-Sonderfall', () => {
    const r = offerPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', title: 'Angebot', validUntil: '2026-07-01', subtotal: 100, taxAmount: 19, total: 119, items: [] },
      { id: 'o1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.id).toBe('o1')
    expect(r.workspace_id).toBe('ws1')
    expect(r.account_id).toBe('a1')
    expect(r.status).toBe('draft')        // default
    expect(r.tax_mode).toBe('standard')   // default
    expect(r.valid_until).toBe('2026-07-01')
    expect(r.updated_at).toBe('2026-06-01T00:00:00Z')
    expect(r).not.toHaveProperty('created_at')
    expect(r).not.toHaveProperty('number')  // Nummer kommt separat (RPC) im Gateway
  })

  it('offerItemPayloadToRow: inkl. item_date/unit', () => {
    const r = offerItemPayloadToRow(
      { title: 'Pos', quantity: 2, unitPrice: 50, taxRate: 19, total: 119, sortOrder: 0, unit: 'Std', itemDate: '2026-06-01' },
      { id: 'i1', offerId: 'o1' },
    )
    expect(r.offer_id).toBe('o1')
    expect(r.unit).toBe('Std')
    expect(r.item_date).toBe('2026-06-01')
    expect(r.unit_price).toBe(50)
  })

  it('paymentPayloadToRow: Felder + null-Defaults', () => {
    const r = paymentPayloadToRow(
      { workspaceId: 'ws1', invoiceId: 'inv1', amount: 50, paidAt: '2026-06-02' },
      { id: 'p1', now: '2026-06-02T00:00:00Z' },
    )
    expect(r.id).toBe('p1')
    expect(r.invoice_id).toBe('inv1')
    expect(r.amount).toBe(50)
    expect(r.paid_at).toBe('2026-06-02')
    expect(r.method).toBeNull()
    expect(r.note).toBeNull()
  })
})
```

- [ ] **Step 2: Run, FAIL** — `npx vitest run src/data/finance.mapper.test.ts`

- [ ] **Step 3: Implement** — an `src/data/finance.mapper.ts` anhängen (Imports oben ggf. um `UpsertOfferPayload, UpsertOfferItemPayload, CreatePaymentPayload` ergänzen):

```ts
/** UpsertOfferPayload → offers-Row (ohne number = kommt per RPC; ohne created_at = DB-Default). */
export function offerPayloadToRow(
  p: UpsertOfferPayload, ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id, workspace_id: p.workspaceId, created_by: p.createdBy, account_id: p.accountId,
    title: p.title, status: p.status ?? 'draft', valid_until: p.validUntil,
    tax_mode: p.taxMode ?? 'standard', subtotal: p.subtotal, tax_amount: p.taxAmount, total: p.total,
    notes: p.notes ?? null, updated_at: ctx.now,
  }
}

/** UpsertOfferItemPayload → offer_items-Row. */
export function offerItemPayloadToRow(
  it: UpsertOfferItemPayload, ctx: { id: string; offerId: string },
): Record<string, unknown> {
  return {
    id: ctx.id, offer_id: ctx.offerId, title: it.title, description: it.description ?? null,
    quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, total: it.total,
    sort_order: it.sortOrder, item_date: it.itemDate ?? null, unit: it.unit ?? null,
  }
}

/** CreatePaymentPayload → payments-Row (ohne created_at = DB-Default). */
export function paymentPayloadToRow(
  p: CreatePaymentPayload, ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id, workspace_id: p.workspaceId, invoice_id: p.invoiceId, amount: p.amount,
    paid_at: p.paidAt, method: p.method ?? null, note: p.note ?? null,
  }
}
```

(`ctx.now` für payments aktuell ungenutzt im Row — Parameter der Signatur-Konsistenz halber; falls Lint `noUnusedParameters` meckert, `now` aus der payment-Signatur entfernen und im Gateway-Aufruf weglassen.)

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/finance.mapper.test.ts`
- [ ] **Step 5: Commit** `git add src/data/finance.mapper.ts src/data/finance.mapper.test.ts && git commit -m "feat(finance): offer/payment write mappers"`

---

### Task 3: Gateway — Angebote (create/update/delete)

**Files:** Modify `src/data/finance.gateway.ts`, `src/data/finance.gateway.test.ts`

- [ ] **Step 1: Failing tests anhängen** (`finance.gateway.test.ts` nutzt den vorhandenen `chain`-Mock + `supabase.rpc`):

```ts
describe('FinanceGateway offers write', () => {
  beforeEach(() => { vi.clearAllMocks(); insertResult = { data: null, error: null }; singleResult = { data: { id: 'o1', workspace_id: 'ws1', account_id: 'a1', title: 'A', status: 'draft', valid_until: '2026-07-01', tax_mode: 'standard', subtotal: 0, tax_amount: 0, total: 0, created_at: '', updated_at: '' }, error: null } })
  const offerPayload = { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', title: 'A', validUntil: '2026-07-01', subtotal: 0, taxAmount: 0, total: 0, items: [] }

  it('createOffer (solo) ruft FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.createOffer).mockResolvedValueOnce({ offer: {} as any, items: [] })
    await FinanceGateway.createOffer(offerPayload as any)
    expect(FinanceService.createOffer).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('createOffer (shared) allokiert Nummer + schreibt nach supabase', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.createOffer(offerPayload as any)
    expect(supabase.rpc).toHaveBeenCalledWith('allocate_offer_number', { ws_id: 'ws1' })
    expect(supabase.from).toHaveBeenCalledWith('offers')
  })
  it('deleteOffer (shared) löscht aus supabase', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.deleteOffer('o1')
    expect(supabase.from).toHaveBeenCalledWith('offers')
  })
})
```

Stelle sicher, dass `FinanceService` im Mock (oben in der Datei) auch `createOffer/updateOffer/deleteOffer/addPayment/deletePayment/getOffer/convertOfferToInvoice/getInvoice` enthält — fehlende `vi.fn()` ergänzen.

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — in `finance.gateway.ts` Imports um `offerPayloadToRow, offerItemPayloadToRow` und Typen `UpsertOfferPayload, OfferWithItems` (bereits importiert?) ergänzen, dann ins `FinanceGateway`-Objekt:

```ts
  async createOffer(payload: UpsertOfferPayload): Promise<OfferWithItems> {
    if (!shared()) return FinanceService.createOffer(payload)
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const { data: number, error: numErr } = await supabase.rpc('allocate_offer_number', { ws_id: payload.workspaceId })
    if (numErr) fail(numErr)
    const row = { ...offerPayloadToRow(payload, { id, now }), number }
    const { error: offErr } = await supabase.from('offers').insert(row)
    if (offErr) fail(offErr)
    if (payload.items.length > 0) {
      const itemRows = payload.items.map(it => offerItemPayloadToRow(it, { id: it.id ?? crypto.randomUUID(), offerId: id }))
      const { error: itErr } = await supabase.from('offer_items').insert(itemRows)
      if (itErr) fail(itErr)
    }
    return this.getOffer(id)
  },

  async updateOffer(id: string, payload: UpsertOfferPayload): Promise<OfferWithItems> {
    if (!shared()) return FinanceService.updateOffer(id, payload)
    const now = new Date().toISOString()
    // status & number bewusst NICHT anfassen (mirror Rust update).
    const patch = {
      account_id: payload.accountId, title: payload.title, valid_until: payload.validUntil,
      tax_mode: payload.taxMode ?? 'standard', subtotal: payload.subtotal,
      tax_amount: payload.taxAmount, total: payload.total, notes: payload.notes ?? null, updated_at: now,
    }
    const { error: offErr } = await supabase.from('offers').update(patch).eq('id', id)
    if (offErr) fail(offErr)
    const { error: delErr } = await supabase.from('offer_items').delete().eq('offer_id', id)
    if (delErr) fail(delErr)
    if (payload.items.length > 0) {
      const itemRows = payload.items.map(it => offerItemPayloadToRow(it, { id: it.id ?? crypto.randomUUID(), offerId: id }))
      const { error: itErr } = await supabase.from('offer_items').insert(itemRows)
      if (itErr) fail(itErr)
    }
    return this.getOffer(id)
  },

  async deleteOffer(id: string): Promise<void> {
    if (!shared()) return FinanceService.deleteOffer(id)
    const { error: itErr } = await supabase.from('offer_items').delete().eq('offer_id', id)
    if (itErr) fail(itErr)
    const { error } = await supabase.from('offers').delete().eq('id', id)
    if (error) fail(error)
  },
```

- [ ] **Step 4: Run, PASS**
- [ ] **Step 5: Commit** `git add src/data/finance.gateway.ts src/data/finance.gateway.test.ts && git commit -m "feat(finance): gateway offer create/update/delete (solo/shared)"`

---

### Task 4: Gateway — Payments (add/delete)

**Files:** Modify `src/data/finance.gateway.ts`, `src/data/finance.gateway.test.ts`

- [ ] **Step 1: Failing tests anhängen**:

```ts
describe('FinanceGateway payments write', () => {
  beforeEach(() => { vi.clearAllMocks(); insertResult = { data: null, error: null } })
  const pay = { workspaceId: 'ws1', invoiceId: 'inv1', amount: 50, paidAt: '2026-06-02' }
  it('addPayment (solo) ruft FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.addPayment).mockResolvedValueOnce({} as any)
    await FinanceGateway.addPayment(pay as any)
    expect(FinanceService.addPayment).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('addPayment (shared) schreibt nach supabase.payments', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.addPayment(pay as any)
    expect(supabase.from).toHaveBeenCalledWith('payments')
  })
  it('deletePayment (shared) löscht aus supabase.payments', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.deletePayment('p1')
    expect(supabase.from).toHaveBeenCalledWith('payments')
  })
})
```

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — Import `paymentPayloadToRow` + Typen `Payment, CreatePaymentPayload`, dann:

```ts
  async addPayment(payload: CreatePaymentPayload): Promise<Payment> {
    if (!shared()) return FinanceService.addPayment(payload)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row = paymentPayloadToRow(payload, { id, now })
    const { data, error } = await supabase.from('payments').insert(row).select('*').single()
    if (error) fail(error)
    return paymentRowToPayment(data)
  },

  async deletePayment(id: string): Promise<void> {
    if (!shared()) return FinanceService.deletePayment(id)
    const { error } = await supabase.from('payments').delete().eq('id', id)
    if (error) fail(error)
  },
```

(`paymentRowToPayment` ist bereits importiert.)

- [ ] **Step 4: Run, PASS**
- [ ] **Step 5: Commit** `git add src/data/finance.gateway.ts src/data/finance.gateway.test.ts && git commit -m "feat(finance): gateway payment add/delete (solo/shared)"`

---

### Task 5: Gateway — `convertOfferToInvoice`

**Files:** Modify `src/data/finance.gateway.ts`, `src/data/finance.gateway.test.ts`

- [ ] **Step 1: Failing test anhängen**:

```ts
describe('FinanceGateway convertOfferToInvoice', () => {
  beforeEach(() => { vi.clearAllMocks(); insertResult = { data: null, error: null } })
  it('convert (solo) ruft FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.convertOfferToInvoice).mockResolvedValueOnce({ invoice: {} as any, items: [] })
    await FinanceGateway.convertOfferToInvoice('o1', 'ws1', 'u1')
    expect(FinanceService.convertOfferToInvoice).toHaveBeenCalledWith('o1', 'ws1', 'u1')
  })
  it('convert (shared) liest Offer, erstellt Rechnung, markiert Offer accepted', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    // getOffer → single() liefert offer; createInvoice nutzt insert (then→insertResult ok); getInvoice → single()
    singleResult = { data: { id: 'o1', workspace_id: 'ws1', account_id: 'a1', title: 'A', status: 'draft', valid_until: '2026-07-01', tax_mode: 'standard', subtotal: 100, tax_amount: 19, total: 119, created_at: '', updated_at: '' }, error: null }
    const res = await FinanceGateway.convertOfferToInvoice('o1', 'ws1', 'u1')
    expect(supabase.from).toHaveBeenCalledWith('offers')   // markiert accepted
    expect(res).toBeDefined()
  })
})
```

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — Import `UpsertInvoicePayload` (vorhanden), dann:

```ts
  async convertOfferToInvoice(offerId: string, workspaceId: string, createdBy: string): Promise<InvoiceWithItems> {
    if (!shared()) return FinanceService.convertOfferToInvoice(offerId, workspaceId, createdBy)
    const { offer, items } = await this.getOffer(offerId)
    const today = new Date()
    const due = new Date(today.getTime() + 14 * 86_400_000)
    const ymd = (d: Date) => d.toISOString().slice(0, 10)
    const payload: UpsertInvoicePayload = {
      workspaceId, createdBy, accountId: offer.accountId,
      date: ymd(today), dueDate: ymd(due), status: 'draft', taxMode: offer.taxMode,
      subtotal: offer.subtotal, taxAmount: offer.taxAmount, total: offer.total,
      notes: offer.notes, isSuggestion: false,
      items: items.map(i => ({
        title: i.title, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice,
        taxRate: i.taxRate, total: i.total, sortOrder: i.sortOrder,
      })),
    }
    const result = await this.createInvoice(payload)
    const now = new Date().toISOString()
    const { error } = await supabase.from('offers')
      .update({ status: 'accepted', converted_invoice_id: result.invoice.id, updated_at: now })
      .eq('id', offerId)
    if (error) fail(error)
    return result
  },
```

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/finance.gateway.test.ts`
- [ ] **Step 5: Commit** `git add src/data/finance.gateway.ts src/data/finance.gateway.test.ts && git commit -m "feat(finance): gateway convertOfferToInvoice (solo/shared composite)"`

---

### Task 6: Store über das Gateway

**Files:** Modify `src/store/finance.store.ts`

- [ ] **Step 1: Methoden umstellen** — in `finance.store.ts` die 6 Methoden von `FinanceService` auf `FinanceGateway` ändern (State-Updates unverändert lassen):
  - `createOffer`: `FinanceService.createOffer` → `FinanceGateway.createOffer`
  - `updateOffer`: `FinanceService.updateOffer` → `FinanceGateway.updateOffer`
  - `deleteOffer`: `FinanceService.deleteOffer` → `FinanceGateway.deleteOffer`
  - `addPayment`: `FinanceService.addPayment` → `FinanceGateway.addPayment`
  - `deletePayment`: `FinanceService.deletePayment` → `FinanceGateway.deletePayment`
  - `convertOfferToInvoice`: `FinanceService.convertOfferToInvoice` → `FinanceGateway.convertOfferToInvoice`

- [ ] **Step 2: Prüfen, ob `FinanceService` in `finance.store.ts` noch gebraucht wird.** Es bleibt für `loadKpis` (`FinanceService.getFinanceKpis`) und `tryAutoSaveToAblage` (`FinanceService.getInvoice`) im Einsatz → Import NICHT entfernen. Mit `grep -n "FinanceService" src/store/finance.store.ts` verifizieren, dass nur diese beiden übrig sind.

- [ ] **Step 3: Typecheck + Tests** — `npx tsc --noEmit` und `npx vitest run src/data/ src/store/` → grün.

- [ ] **Step 4: Commit** `git add src/store/finance.store.ts && git commit -m "feat(finance): store routes offer/payment writes through FinanceGateway"`

---

### Task 7: Verifikation

- [ ] **Step 1: Voll** — `npm run test:run` → alle grün.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → keine Fehler.
- [ ] **Step 3: Manuell (User)** im geteilten Workspace: Angebot anlegen (bekommt ANG-Nummer) / ändern / löschen; Angebot→Rechnung; Zahlung erfassen→Status „bezahlt"; alles ohne „[object Object]". Solo unverändert.

---

## Self-Review Notes

- **Spec-Abdeckung:** Mapper (T2), Gateway offers (T3) / payments (T4) / convert (T5), Store (T6), RPC (T1), Tests je Task. Realtime unverändert (Spec). Out-of-scope (Owner-Gating/Plan 3) unberührt.
- **Typ-Konsistenz:** `offerPayloadToRow(p,{id,now})`, `offerItemPayloadToRow(it,{id,offerId})`, `paymentPayloadToRow(p,{id,now})`, Gateway-Methoden = Store-Signaturen. `updateOffer` lässt status/number bewusst aus (mirror Rust). `convert` spiegelt Rust (date heute, due +14T, status draft, offer→accepted).
- **Risiko:** `convertOfferToInvoice` shared ist nicht-transaktional (wie bestehendes Invoice+Items-Muster) — akzeptiert. Offer-Nummer-RPC nicht atomar mit Insert (wie Rechnung — Backlog).
