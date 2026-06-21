# Accounts/Kunden cloud-first — Design

**Datum:** 2026-06-21
**Branch:** ab `feature/v2-fixes-2026-06-18` (frischer Branch pro Scheibe)
**Verwandt:** `2026-06-18-shared-workspace-accounts-pilot-design.md`, `2026-06-19-finance-cloud-first-design.md`

## Problem

Im Cloud-Workspace lesen `accounts.store` und `customers.store` weiterhin lokal (SQLite) statt aus Supabase:

- `accounts.store` ruft direkt `invoke('get_accounts')` — kein Gateway, kein Realtime.
- `customers.store` ruft `CustomerService` → ebenfalls direkt `invoke('get_accounts')`.

Folge: Das Rechnungs-Formular (`InvoiceForm.tsx:28` via `useAccountsStore`) zeigt im geteilten Workspace **lokale** Kunden. Deren `account_id` existiert nicht in Supabase → **FK-Fehler `invoices_account_id_fkey`** beim Rechnungs-Insert. Außerdem: ein zu-Kunde-gemachter Lead „verschwindet" (Kundenliste ist lokal, der konvertierte Lead liegt in Supabase).

Der Finanz-Schreibcode selbst ist korrekt — nur durch fehlende Cloud-Kunden blockiert.

## Datenmodell-Befund (wichtig)

- **Lokal** hat die `accounts`-Tabelle **keine `account_type`-Spalte** (siehe `src-tauri/src/db/account.rs`, `Account`-Struct + `JOIN_QUERY_ALL`). Leads laufen lokal über einen getrennten Pfad (`get_leads`). `get_accounts` liefert alle nicht-privaten Accounts des Workspace.
- **In Supabase** liegen Leads **und** Kunden in *einer* `accounts`-Tabelle, getrennt durch `account_type` (`'lead'` vs `'client'`). `AccountsGateway.convertToClient` setzt `account_type:'client'`.
- Konsequenz: Die Cloud-Read-Query für Kunden/Accounts **muss Leads ausfiltern**, sonst erscheinen Leads im Kunden-Picker und in der Kundenliste.

## Architektur (Ansatz A: ein Gateway)

Beide Stores sind Views auf dieselben Daten — ein Kunde *ist* ein Account. Daher **ein** Gateway als einziger Cloud-Schreibpfad (DRY, konsistente Spalten).

```
accounts.store ─┐                              ┌─ solo  → invoke(get_accounts / upsert_account / …)
                ├─→ AccountsGateway ───────────┤
customers.store ┘   (+ Account↔Customer-Map)   └─ shared→ supabase.from('accounts')  [account_type != 'lead']
```

### Komponenten

**`src/data/accounts.gateway.ts`** — generische Account-Methoden ergänzen (bestehende Lead-Methoden bleiben):
- `getAccounts(workspaceId): Promise<Account[]>` — solo: `invoke('get_accounts', { workspaceId })`; shared: Supabase-Read (siehe Filterregel).
- `upsertAccount(payload): Promise<Account>` — solo: `invoke('upsert_account', { payload })`; shared: `supabase.from('accounts').upsert(row).select().single()` mit `account_type:'client'`.
- `setArchived(id, archived): Promise<Account>` — solo: `invoke('cmd_set_account_archived', { id, archived })`; shared: `update({ archived_at })`.
- `setPrimaryDeal(accountId, dealId): Promise<Account>` — solo: `invoke('cmd_set_primary_deal', …)`; shared: `update({ primary_deal_id })` best-effort.
- `deleteAccount(id, workspaceId)` — **existiert bereits**, wird wiederverwendet.

**`src/data/accounts.mapper.ts`** — ergänzen:
- `accountRowToAccount(r): Account` — Supabase-Row → `Account`-Domänentyp. Computed-Felder (`pipelinePhase`, `pipelinePhaseLabel`) → `null` (kein Deals-JOIN in der Cloud).
- `accountPayloadToRow(payload, ctx): Record<string, unknown>` — `UpsertAccountPayload` → Supabase-Row; setzt `id`, `created_by`, `account_type:'client'`, `updated_at`.

**`src/data/customers.mapper.ts`** (neu) — reine, geteilte Mapper aus `CustomerService` herausgelöst:
- `accountToCustomer(a: Account): Customer`
- `customerPayloadToAccountPayload(p: UpsertCustomerPayload): UpsertAccountPayload`

### Store-Anbindung

**`accounts.store`** — kein direktes `invoke` mehr:
- `init → AccountsGateway.getAccounts`
- `upsert → AccountsGateway.upsertAccount`
- `remove → AccountsGateway.deleteAccount`
- `setPrimaryDeal → AccountsGateway.setPrimaryDeal`
- Stilles `catch {}` durch dasselbe `AppError`-Muster wie `customers.store` ersetzen (kleine gezielte Verbesserung, da Datei ohnehin angefasst wird).

**`customers.store`** — über das Gateway statt `CustomerService`:
- `init → AccountsGateway.getAccounts()` → `accountToCustomer`
- `upsert → customerPayloadToAccountPayload` → `AccountsGateway.upsertAccount` → `accountToCustomer`
- `remove → AccountsGateway.deleteAccount`
- `setArchived → AccountsGateway.setArchived` → `accountToCustomer`
- Mail-Rematch-Logik bleibt unverändert.

**`CustomerService`** wird auf eine reine Solo-`invoke`-Hülle reduziert oder ganz aufgelöst (Entscheidung im Plan, je nachdem ob das Gateway den Solo-Pfad direkt übernimmt — sauberere Variante gewinnt). Die Mapper wandern in jedem Fall nach `customers.mapper.ts`.

## Cloud-Query / Filterregel (verbindlich)

**Read (shared):**
```
supabase.from('accounts').select('*')
  .eq('workspace_id', workspaceId)
  .eq('is_private', 0)
  .or('account_type.is.null,account_type.neq.lead')
  .order('name', { ascending: true })
```
- `.neq('account_type','lead')` allein würde Bestands-Rows mit `account_type = NULL` (Alt-Kunden) fälschlich ausschließen → daher `.or('account_type.is.null,account_type.neq.lead')`.

**Write (shared):** Kunden/Accounts bekommen immer `account_type:'client'` → Alt-NULLs heilen sich beim nächsten Speichern.

## Realtime

`useWorkspaceRealtime` abonniert bereits die gesamte `accounts`-Tabelle (gefiltert auf `workspace_id`). Erweitern:

- Bei `payload.new.account_type != 'lead'` (und nicht privat): Row über `accountRowToAccount` mappen → in `accounts.store` upserten; zusätzlich über `accountToCustomer` → in `customers.store` upserten.
- Bei `DELETE` oder Wechsel **zu** `account_type === 'lead'`: aus `accounts.store` **und** `customers.store` entfernen.
- Spiegelt exakt das bestehende Leads-Handling im selben Channel.

## Fehlerbehandlung

Gateway wirft lesbare Errors (wie `finance.gateway`). `customers.store` behält sein `AppError`-Mapping; `accounts.store` erhält dasselbe Muster statt `catch {}`.

## Tests (TDD)

- **Reine Mapper:** `accountRowToAccount`, `accountPayloadToRow`, `accountToCustomer`, `customerPayloadToAccountPayload` — Round-trip, NULL-Defaults, `account_type:'client'`, Status-/Priority-Übersetzungen (`prospect↔lead`, `churned↔lost`, `vip→high`).
- **Gateway-Routing:** Supabase + Services gemockt, `isActiveWorkspaceShared()` toggeln → solo ruft `invoke`, shared ruft Supabase mit korrektem Filter (inkl. NULL-`account_type`-Fall).
- **Realtime-Handler:** Nicht-Lead-Row landet in `accounts.store` **und** `customers.store`; Wechsel zu `'lead'` bzw. DELETE entfernt sie aus beiden.

## Pflicht-Vorabschritt (Plan)

Bevor die Mapper final sind: **Supabase-Spaltentypen der `accounts`-Tabelle via `information_schema` prüfen** — insbesondere `tags`, `goals`, `social_links`, `score_factors` (jsonb vs text), `is_private`, `lead_score`, `health_score`, `account_type`, `vat_id`, `archived_at`, `primary_deal_id`, `created_by`. (Wiederkehrende Schema-Drift-Lehre; z. B. war `invoices.is_suggestion` ein `smallint`.)

## Out of scope (bewusst)

- Deals/Pipeline cloud-first (Computed-Felder bleiben in der Cloud `null`).
- `company_settings` cloud.
- Entwurf-Rechte/UI-Gating für Mitarbeiter (Plan 3).
- GoBD-Atomarität der Rechnungsnummer (separates Backlog).

## Erfolgskriterien

1. Im geteilten Workspace zeigt der Rechnungs-Picker (`InvoiceForm`) Cloud-Kunden; Rechnung-Insert läuft ohne `invoices_account_id_fkey`-Fehler durch.
2. Lead → Kunde konvertieren: der Kunde erscheint sofort in der Kundenliste (kein „Verschwinden").
3. Solo-Workspace verhält sich unverändert (alle bestehenden Tests grün).
4. Realtime: ein in Instanz A angelegter/geänderter Kunde erscheint live in Instanz B.
