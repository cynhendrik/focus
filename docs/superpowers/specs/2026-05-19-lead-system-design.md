# Lead System — Design Spec

**Feature:** CRM Sub-Projekt — Lead System (Spec 1 von 2)
**Date:** 2026-05-19
**Branch:** feature/v2-redesign
**Status:** Approved

---

## Ziel

Ein vollständiges Lead-Modul für Cynera: Leads kommen automatisch über Webhooks (Zoom, Wix, WordPress, Zapier) herein, landen in einem Eingangspostfach ("New In"), werden manuell qualifiziert und bei Interesse per One-Click in einen Client konvertiert. Leads sind strikt von Clients getrennt — Pipeline enthält ausschließlich Clients.

---

## Drei Welten

| Welt | account_type | Sichtbar in | Pipeline |
|------|-------------|------------|---------|
| Leads | `'lead'` | LeadsRoute | Nein |
| Clients | `'client'` | ClientsRoute | Ja |
| Pipeline | — | PipelineRoute | Nur Clients |

Follow-Ups gelten für beide (Leads + Clients).

---

## Navigation

Kein Nav-Umbau — minimale Änderung an der bestehenden Struktur:

**Sales-Sektion** (neue Reihenfolge):
```
Leads        [N]   ← NEU, ganz oben
Pipeline     [P]
Smart Lists  [L]
Follow-Ups   [U]
```

- Icon: `Target` (Lucide)
- Kbd: `N`
- Badge: Anzahl Leads mit `lead_status = 'new'` (unbearbeitete New-In-Leads)
- `AppView` in `ui.store.ts` erhält `'leads'`
- `App.tsx`: `case 'leads': return <LeadsRoute />`

---

## Datenmodell

### Migration v11 — accounts Tabelle (SQLite, lokal)

Sieben neue Spalten auf der bestehenden `accounts` Tabelle:

```sql
ALTER TABLE accounts ADD COLUMN account_type      TEXT NOT NULL DEFAULT 'client';
ALTER TABLE accounts ADD COLUMN lead_status        TEXT;         -- new|attempted|warm|lost_reengage
ALTER TABLE accounts ADD COLUMN lead_source        TEXT;         -- zoom|generic|manual
ALTER TABLE accounts ADD COLUMN lead_source_detail TEXT;         -- z.B. "Zoom: Marketing Webinar"
ALTER TABLE accounts ADD COLUMN engagement_score   INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN re_engage_date     TEXT;         -- ISO date, nullable
ALTER TABLE accounts ADD COLUMN converted_at       TEXT;         -- gesetzt bei Konvertierung

CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(workspace_id, account_type);
```

Alle bestehenden Accounts bekommen automatisch `account_type = 'client'` — kein Datenverlust.

### Supabase — pending_leads Tabelle (Cloud, Webhook-Puffer)

```sql
CREATE TABLE pending_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT,
  source        TEXT NOT NULL,   -- 'zoom' | 'generic'
  source_detail TEXT,            -- z.B. Webinar-Titel
  payload       JSONB,           -- raw Webhook-Payload
  synced        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON pending_leads(workspace_id, synced);
```

### TypeScript-Typen

```typescript
// src/types/lead.types.ts

export type LeadStatus = 'new' | 'attempted' | 'warm' | 'lost_reengage'
export type LeadSource = 'zoom' | 'generic' | 'manual'

export interface Lead {
  id: string
  workspaceId: string
  name: string
  email: string
  accountType: 'lead'
  leadStatus: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  engagementScore: number
  reEngageDate?: string
  convertedAt?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertLeadPayload {
  id?: string
  workspaceId: string
  name: string
  email: string
  leadStatus?: LeadStatus
  leadSource: LeadSource
  leadSourceDetail?: string
  reEngageDate?: string
}

export interface BulkLeadAction {
  ids: string[]
  action: 'follow_up' | 'warm' | 'lost' | 'reengage'
  reEngageDate?: string   // required when action === 'reengage' | 'lost'
  followUpTitle?: string  // required when action === 'follow_up'
  followUpDate?: string
}
```

---

## Lead-Status Flow

```
New → Attempted → Warm Lead → Client ✓
            ↓           ↓
       Lost/Re-Engage ←─┘
            ↓
       re_engage_date setzen
            ↓
       Auto Follow-Up wenn Datum erreicht
```

Status-Regeln:
- `engagement_score > 15` → Badge "Warm?" im New-In-Tab (kein Auto-Update)
- `90 Tage keine Aktivität` → Lead automatisch auf `lost_reengage`, `re_engage_date = heute + 90 Tage`
- `re_engage_date` erreicht → Follow-Up automatisch erstellen, Lead taucht im Follow-Up Center auf

---

## Backend (Rust)

### Neue Funktionen in `src-tauri/src/db/account.rs`

```rust
pub fn get_leads(conn, workspace_id) -> Result<Vec<Account>>
// SELECT * FROM accounts WHERE workspace_id=? AND account_type='lead' ORDER BY created_at DESC

pub fn upsert_lead(conn, payload: UpsertLeadPayload) -> Result<Account>
// INSERT OR REPLACE — setzt account_type='lead', lead_status='new' bei neuem Lead

pub fn bulk_update_lead_status(conn, ids: Vec<String>, status: LeadStatus, re_engage_date: Option<String>) -> Result<()>

pub fn convert_lead_to_client(conn, id: String) -> Result<Account>
// UPDATE accounts SET account_type='client', lead_status=NULL, converted_at=NOW() WHERE id=?

pub fn insert_synced_leads(conn, leads: Vec<UpsertLeadPayload>) -> Result<usize>
// Nimmt bereits aus Supabase geholte Leads entgegen und schreibt sie in SQLite
```

### Neue Commands in `src-tauri/src/commands/lead.rs`

```rust
#[tauri::command] pub fn get_leads(db, workspace_id) -> Result<Vec<Account>>
#[tauri::command] pub fn upsert_lead(db, payload) -> Result<Account>
#[tauri::command] pub fn bulk_update_leads(db, ids, action, re_engage_date, follow_up_title, follow_up_date) -> Result<()>
#[tauri::command] pub fn convert_lead_to_client(db, id) -> Result<Account>
#[tauri::command] pub fn insert_synced_leads(db, leads) -> Result<usize>
```

Alle 5 Commands in `generate_handler![]` in `main.rs` registrieren.

---

## Webhook-Integration

### Supabase Edge Function: `lead-intake`

**Datei:** `supabase/functions/lead-intake/index.ts`

```typescript
// URL: https://[proj].supabase.co/functions/v1/lead-intake
// Query-Params: ?workspace_id=xxx&secret=yyy&source=zoom|generic

const { workspace_id, secret, source } = url.searchParams

// 1. Secret validieren
if (secret !== Deno.env.get('LEAD_WEBHOOK_SECRET')) return 401

// 2. Payload normalisieren
const lead = source === 'zoom' ? parseZoom(body) : parseGeneric(body)

// 3. In pending_leads speichern
await supabase.from('pending_leads').insert({ ...lead, workspace_id, payload: body })
```

**Zoom Parser** (`source=zoom`):
- Event: `webinar.registrant_added`
- `email` ← `payload.payload.object.registrant.email`
- `name` ← `first_name + ' ' + last_name`
- `source_detail` ← `payload.payload.object.topic`

**Generic Parser** (`source=generic`):
- Erwartet: `{ email: string, name?: string, source_detail?: string }`
- Funktioniert mit Wix Automations, WordPress (Contact Form 7 Webhook Plugin), Zapier

### Cynera Sync-Logik

Sync wird ausgelöst:
1. Beim App-Start (in `App.tsx` nach Workspace-Load)
2. Alle 5 Minuten via Tauri `setInterval`
3. Manuell: "Sync jetzt"-Button in Settings → Leads & Integrationen

Sync-Ablauf:
1. `sync_pending_leads(workspaceId)` aufrufen
2. Neue Leads in `useLeadsStore` laden
3. Nav-Badge aktualisiert sich automatisch

---

## Frontend

### Service: `src/services/leads.service.ts`

```typescript
export const LeadsService = {
  getAll: (workspaceId: string): Promise<Lead[]> =>
    invoke('get_leads', { workspaceId }),

  upsert: (payload: UpsertLeadPayload): Promise<Lead> =>
    invoke('upsert_lead', { payload }),

  bulkUpdate: (action: BulkLeadAction): Promise<void> =>
    invoke('bulk_update_leads', { ...action }),

  convertToClient: (id: string): Promise<Account> =>
    invoke('convert_lead_to_client', { id }),

  // Sync läuft komplett im Frontend: Supabase → normalize → Rust insert
  syncPending: async (workspaceId: string): Promise<number> => {
    const { data } = await supabase
      .from('pending_leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('synced', false)
    if (!data?.length) return 0
    const leads = data.map(normalizePendingLead)         // → UpsertLeadPayload[]
    const count: number = await invoke('insert_synced_leads', { leads })
    const ids = data.map(r => r.id)
    await supabase.from('pending_leads').update({ synced: true }).in('id', ids)
    return count
  },
}
```

### Store: `src/store/leads.store.ts`

```typescript
interface LeadsState {
  leads: Lead[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertLeadPayload) => Promise<void>
  bulkUpdate: (action: BulkLeadAction) => Promise<void>
  convertToClient: (id: string) => Promise<void>
  syncPending: (workspaceId: string) => Promise<void>
  // Derived
  newLeads: Lead[]          // leadStatus === 'new'
  attemptedLeads: Lead[]
  warmLeads: Lead[]
  lostLeads: Lead[]
}
```

### Route: `src/routes/LeadsRoute.tsx`

Drei Tabs: `new_in | lead_phases | reengage`

**Tab 1 — New In:**
- Tabellenzeilen: Checkbox · Name+Email · Quelle-Badge · Score · Datum · Status-Badge
- Bulk-Action-Bar (erscheint wenn ≥1 selektiert): "Follow-Up erstellen" · "Warm Lead" · "Lost" · "Re-Engage"
- "+ Lead"-Button (manuell anlegen)

**Tab 2 — Lead Phases:**
- Drei Gruppen: Attempted / Warm Leads / Lost Re-Engage
- Warm-Lead-Zeilen: "Zu Kunde machen"-Button inline
- Filter: Quelle, Score-Range, Datum

**Tab 3 — Re-Engage:**
- Liste sortiert nach `re_engage_date` aufsteigend
- Je Zeile: Name · Quelle · Score · Re-Engage-Datum · "Follow-Up jetzt" · "Verschieben"

### Lead-Detailansicht

Öffnet als Slide-over (kein eigene Route). Zeigt:
- Basisdaten (Name, Email, Quelle, Status, Score)
- Aktionen: Follow-Up erstellen · Status setzen · Zu Kunde machen
- Activity Log (bestehende `ActivitiesPane`-Logik)

### Settings — Leads & Integrationen

Neuer Tab in `SettingsRoute`:
- Zoom Webhook URL (readonly + "Kopieren"-Button)
- Generic Webhook URL (readonly + "Kopieren"-Button)
- "Sync jetzt"-Button mit letztem Sync-Zeitstempel

---

## Engagement Score

Additive Punkte, berechnet in Rust bei jeder Activity-Erstellung:

| Event | Punkte |
|-------|--------|
| WebinarJoined | +5 |
| FormSubmitted | +3 |
| EmailOpened | +2 |
| LinkClicked | +3 |
| CallLogged | +2 |
| MeetingBooked | +5 |
| FollowUpCompleted | +4 |
| FollowUpFailed | −1 |
| 90 Tage keine Aktivität | Reset auf max(score−10, 0) |

Schwellenwert: Score > 15 → Badge "Warm?" im New-In-Tab (Hinweis, kein Auto-Update).

---

## Datenfluss

```
App.tsx (workspace geladen)
  → LeadsService.syncPending(workspaceId)    // holt pending_leads aus Supabase
  → useLeadsStore.load(workspaceId)          // lädt alle Leads aus SQLite

LeadsRoute (New In Tab)
  → useLeadsStore.newLeads                   // gefilterte Liste
  → Bulk-Action → useLeadsStore.bulkUpdate()
  → Konvertierung → useLeadsStore.convertToClient() → useCustomersStore.load()

Tauri interval (5 min)
  → LeadsService.syncPending(workspaceId)
  → useLeadsStore.load(workspaceId)
```

---

## Was NICHT gebaut wird (Scope-Grenze)

- Engagement-Score-Berechnung aus E-Mail-Tracking (EmailOpened, LinkClicked) — erfordert E-Mail-Integration, späteres Sub-Projekt
- Automatische Status-Updates durch Rules Engine (z.B. Score > 15 → auto Warm) — kommt in Spec 2 Follow-Up Center
- Team-Features (Lead-Zuweisung an Teammitglieder)
- Lead-Scoring-Konfiguration im UI
- Weitere Webhook-Quellen (z.B. Typeform, ConvertKit) — generischer Parser deckt die meisten ab
