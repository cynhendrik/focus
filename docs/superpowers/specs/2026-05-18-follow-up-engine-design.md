# Follow-Up Engine — Design Spec

**Feature:** CRM Sub-projekt C — Follow-Up Engine
**Date:** 2026-05-18
**Branch:** feature/v2-redesign
**Status:** Approved

---

## Goal

Einen globalen Follow-Up Command Center bauen: alle offenen Follow-Ups workspace-weit auf einen Blick, nach Dringlichkeit gruppiert (Überfällig / Heute / Diese Woche / Später), plus eine Inaktivitätsliste für Kunden ohne Kontakt in den letzten 14 Tagen. Dazu eine neue Rust-Abfrage für Last-Activity-Dates und eine "+ Follow-Up"-Schnellerfassung im Kunden-Dashboard.

**Architecture:** Ein neuer Rust-Command `get_last_activity_dates(workspace_id)` liefert den letzten Aktivitäts-Zeitstempel pro Account. Das Frontend erweitert `CrmService` um `getAllFollowUps(workspaceId)` (nutzt den bereits vorhandenen `get_open_tasks`-Command + Frontend-Filter auf `is_follow_up`). `useCrmStore` bekommt `allFollowUps` + `lastActivity` State. Die bestehende `KpisRoute` wird zum **Follow-Up Center** umgebaut. NavSidebar erhält einen neuen "Follow-Ups" Eintrag.

**Tech Stack:** Rust (rusqlite), TypeScript, React, Tailwind, Zustand

---

## Datenmodell

### Neuer Rust-Typ: `AccountActivityDate`

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountActivityDate {
    pub account_id: String,
    pub last_activity_at: Option<String>,
}
```

### Neue Rust-DB-Funktion

```sql
SELECT account_id, MAX(created_at) as last_activity_at
FROM activities
WHERE workspace_id = ?1
GROUP BY account_id
```

### Neues TypeScript-Interface

```typescript
export interface AccountActivityDate {
  accountId: string
  lastActivityAt: string | null
}
```

---

## Komponenten

### 1. Rust: `get_last_activity_dates` Command

- **Datei:** `src-tauri/src/db/activity.rs` — neue Funktion `get_last_activity_dates(conn, workspace_id)`
- **Datei:** `src-tauri/src/commands/activity.rs` — neuer Command `get_last_activity_dates(db, workspace_id)`
- **Datei:** `src-tauri/src/main.rs` — Command registrieren

### 2. Frontend: CrmService erweitern

`src/services/crm.service.ts` — neue Methode `getAllFollowUps(workspaceId)` + `getLastActivityDates(workspaceId)`:

```typescript
getAllFollowUps: async (workspaceId: string): Promise<FollowUp[]> => {
  const activities = await invoke<Activity[]>('get_open_tasks', { workspaceId })
  return activities
    .filter(a => { try { return JSON.parse(a.payload).is_follow_up === true } catch { return false } })
    .map(activityToFollowUp)
},

getLastActivityDates: (workspaceId: string): Promise<AccountActivityDate[]> =>
  invoke('get_last_activity_dates', { workspaceId }),
```

### 3. Frontend: useCrmStore erweitern

`src/store/crm.store.ts` — neue Felder + Aktion:

```typescript
allFollowUps: FollowUp[]
lastActivity: AccountActivityDate[]
loadAll: (workspaceId: string) => Promise<void>
```

### 4. Follow-Up Center UI

`src/routes/KpisRoute.tsx` — vollständiger Rewrite zu `FollowUpCenter`:

**Layout:**
```
┌─ Stats Bar ────────────────────────────────────┐
│  3 Überfällig · 1 Heute · 4 Diese Woche        │
└────────────────────────────────────────────────┘
┌─ Section: Überfällig ──────────────────────────┐
│  [Card] TechCorp · "Angebot nachfassen"  -3d   │
└────────────────────────────────────────────────┘
┌─ Section: Heute ───────────────────────────────┐
│  [Card] Muster GmbH · "Call vorbereiten"       │
└────────────────────────────────────────────────┘
┌─ Section: Diese Woche ─────────────────────────┐
│  [Card] StartupXY · "Demo schicken"   Fr        │
└────────────────────────────────────────────────┘
┌─ Später ───────────────────────────────────────┐
│  ...                                           │
└────────────────────────────────────────────────┘
┌─ Kunden ohne Kontakt (14+ Tage) ───────────────┐
│  [Chip] WebAgency · zuletzt: vor 21 Tagen      │
│  [+Follow-Up] Button                           │
└────────────────────────────────────────────────┘
```

**Follow-Up Card:** Kundenname (grüner Badge) · Titel · Fälligkeitsdatum · Priorität · "Erledigt"-Button (✓) · "Löschen"-Button (✕)

**Inaktivitätsschwelle:** 14 Tage (hardcoded, später konfigurierbar)

### 5. NavSidebar

`src/components/layout/NavSidebar.tsx`:
- Import `Bell` Icon von lucide-react
- Eintrag "Follow-Ups" mit `appView === 'kpis'` und kbd `"U"` (unter Tasks, vor Calendar)

### 6. DashboardPane Quick-Create

`src/components/customer/tabs/DashboardPane.tsx` — kleiner "+ Follow-Up erstellen" Link unterhalb der Lead Score Card, öffnet ein Inline-Formular (Titel + Datum) das `useCrmStore.upsert` aufruft.

---

## Was NICHT gebaut wird

- Automatische Erstellung von Follow-Ups durch die Rules Engine (C2, späteres Sub-Projekt)
- Push-Notifications / Desktop-Benachrichtigungen
- Konfigurierbarer Inaktivitätsschwellwert im UI
- E-Mail-Integration ("Sende Follow-Up per Mail")
