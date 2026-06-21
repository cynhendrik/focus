# Finance fertig: Angebote + Payments cloud-first — Design

**Datum:** 2026-06-21
**Branch:** `feature/erechnung-2026-06-21` (enthält bereits Accounts- + E-Rechnung-Scheiben; nächste Phase darauf)
**Verwandt:** [[shared-workspace-multiplayer]], `2026-06-19-finance-cloud-first-design.md`

## Problem & Ziel

Die Finanz-Lese- und Realtime-Pfade laufen bereits cloud-first (`FinanceGateway` + Finance-Realtime-Channel → `loadAll`). Aber mehrere **Schreib**-Pfade gehen in `finance.store` noch direkt über den lokalen `FinanceService`:

- `createOffer`, `updateOffer`, `deleteOffer`
- `addPayment`, `deletePayment`
- `convertOfferToInvoice`

Folge im geteilten Workspace: Angebot speichern → lokaler Insert referenziert eine Cloud-`account_id`, die lokal fehlt → Fehler („[object Object]"). Payments/Convert ebenso lokal → in der Cloud unsichtbar/fehlerhaft.

**Ziel:** Diese 6 Schreib-Methoden übers `FinanceGateway` routen (solo→`FinanceService` / shared→Supabase), exakt wie die Rechnungs-Writes. Danach ist der gesamte Finanz-Flow (Rechnungen + Angebote + Zahlungen) im geteilten Workspace funktionsfähig.

## Architektur

```
finance.store (createOffer/updateOffer/deleteOffer/addPayment/deletePayment/convertOfferToInvoice)
        │
        └─► FinanceGateway ──┬─ solo  → FinanceService (Tauri invoke, unverändert)
                             └─ shared→ supabase (offers / offer_items / payments)
                                        + allocate_offer_number RPC (neu)
                                        + Mapper aus finance.mapper.ts
```

Lesen (`getOffers/getOffer/getPaymentsByWorkspace`) und **Realtime** (Finance-Channel abonniert `offers`/`payments` → `loadAll`) existieren bereits → **keine Realtime-Änderung nötig**.

## Komponenten

### `finance.mapper.ts` — Write-Mapper ergänzen
- `offerPayloadToRow(p, ctx: { id, number, now })` → `offers`-Row (Status default `'draft'`, taxMode default `'standard'`, `number` aus ctx, ohne `created_at` = DB-Default).
- `offerItemPayloadToRow(it, ctx: { id, offerId })` → `offer_items`-Row (inkl. `item_date`/`unit` — Spalten in 0004 angelegt).
- `paymentPayloadToRow(p, ctx: { id, now })` → `payments`-Row (`workspace_id`, `invoice_id`, `amount`, `paid_at`, `method`, `note`).

(Bestehende Read-Mapper `offerRowToOffer`/`offerItemRowToItem`/`paymentRowToPayment` bleiben.)

### `finance.gateway.ts` — Schreib-Methoden ergänzen
Alle nach Muster `if (!shared()) return FinanceService.xxx(...)` / sonst Supabase, Fehler über den vorhandenen `fail()`-Helfer.

- **`createOffer(payload)`** — shared: Nummer via `supabase.rpc('allocate_offer_number', { ws_id })`, dann `offers`-Insert + `offer_items`-Insert; `getOffer(id)` zurück.
- **`updateOffer(id, payload)`** — shared: `offers`-Update, `offer_items` delete+reinsert (wie Rechnungen, nicht-transaktional); `getOffer(id)` zurück.
- **`deleteOffer(id)`** — shared: `offers`-Delete (offer_items via FK/Cascade bzw. expliziter Delete).
- **`addPayment(payload)`** — shared: `payments`-Insert; Rückgabe Payment.
- **`deletePayment(id)`** — shared: `payments`-Delete.
- **`convertOfferToInvoice(offerId, workspaceId, createdBy)`** — shared: **client-seitiges Composite**: `getOffer` → `UpsertInvoicePayload` aus Offer+Items bauen → `this.createInvoice(payload)` → `offers`-Update (`status='accepted'`, `converted_invoice_id`). Nicht-transaktional (wie bestehendes Invoice+Items-Muster). Feld-Abbildung (Fälligkeit/Status der neuen Rechnung) wird im Plan am Rust-`convert_offer_to_invoice` gespiegelt.

### `finance.store.ts` — die 6 Methoden übers Gateway
`createOffer`/`updateOffer`/`deleteOffer`/`addPayment`/`deletePayment`/`convertOfferToInvoice` rufen statt `FinanceService` nun `FinanceGateway`. Store-State-Updates (optimistisch/Reload) bleiben unverändert.

## Datenbank: `allocate_offer_number` RPC (neu)

`offer_sequences` (verifiziert): `workspace_id text`, `next_number int`, `start_number int` (kein format/seq_year — anders als invoice). Lokales Format (Rust): `ANG-{YYYY}-{NNN}` (3-stellig, per-Workspace fortlaufend).

Neue Funktion (SECURITY DEFINER, mirror `allocate_invoice_number`), wird via Management-API deployed **und** als Migration `supabase/migrations/0005_allocate_offer_number.sql` versioniert:

```sql
create or replace function public.allocate_offer_number(ws_id text)
returns text language plpgsql security definer as $$
declare v_next int; v_to_use int;
begin
  insert into public.offer_sequences (workspace_id, next_number, start_number)
    values (ws_id, 0, 1) on conflict (workspace_id) do nothing;
  select next_number into v_next from public.offer_sequences where workspace_id = ws_id for update;
  v_to_use := coalesce(v_next,0) + 1;
  update public.offer_sequences set next_number = v_to_use where workspace_id = ws_id;
  return 'ANG-' || to_char(now(),'YYYY') || '-' || lpad(v_to_use::text, 3, '0');
end $$;
grant execute on function public.allocate_offer_number(text) to authenticated;
```

`offers`/`offer_items`/`payments`-Spalten existieren (auditiert); `item_date`/`unit` auf `offer_items` in 0004 ergänzt. RLS auf allen drei Tabellen vorhanden (workspace-scoped).

## Fehlerbehandlung

Gateway wirft lesbare Errors (`fail()`); die Aufrufer in `FinanceRoute`/Modals zeigen ohnehin Toasts (gerade in der vorigen Scheibe gehärtet). Store-Methoden propagieren Fehler wie bisher.

## Tests

- **Mapper** (`finance.mapper.test.ts` erweitern): `offerPayloadToRow` (Defaults, number aus ctx, kein created_at), `offerItemPayloadToRow` (item_date/unit), `paymentPayloadToRow`.
- **Gateway** (`finance.gateway.test.ts` erweitern): je Methode solo→`FinanceService` vs shared→supabase Routing; `createOffer` shared ruft `allocate_offer_number`; `convertOfferToInvoice` shared ruft `getOffer`→`createInvoice`→`offers`-Update.
- Keine Realtime-Tests nötig (unverändert).

## Bewusst out of scope

- **Owner-only-Payments / Finanz-UI-Gating für Mitarbeiter** = Plan 3 (separat; RLS bleibt vorerst workspace-scoped).
- E-Rechnung für Angebote.
- Angebots-PDF (funktioniert bereits; nutzt jetzt `FinanceGateway.getOffer` via FinanceRoute-Fix).
- GoBD-Atomarität der Nummernvergabe (Backlog; Offer-Nummer ist unkritischer als Rechnung).

## Erfolgskriterien

1. Im geteilten Workspace: Angebot anlegen/ändern/löschen funktioniert (kein „[object Object]") und erscheint live in einer zweiten Instanz.
2. Zahlung erfassen/löschen funktioniert im geteilten Workspace; Rechnungsstatus kippt korrekt auf „bezahlt".
3. Angebot → Rechnung (`convertOfferToInvoice`) erzeugt im geteilten Workspace eine Cloud-Rechnung und markiert das Angebot als angenommen.
4. Angebote bekommen eine fortlaufende `ANG-{Jahr}-{NNN}`-Nummer (cloud).
5. Solo-Workspace unverändert; alle Tests grün.
