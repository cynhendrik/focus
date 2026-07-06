# Projektplaner-Kern — Fast-Follow (Erreichbarkeit + Cloud-Pfad)

## Kontext

Der finale Whole-Branch-Review von `feat/projektplaner-kern` (8 Tasks, siehe `docs/superpowers/specs/2026-07-06-projektplaner-kern-design.md` + `docs/superpowers/plans/2026-07-06-projektplaner-kern.md`) fand zwei Important-Lücken, die vor dem Merge geschlossen werden sollen:

1. **Kein Erstellungs-Weg**: `useProjectsStore().upsert` wird nirgends in der UI aufgerufen. „Alle Projekte" zeigt dauerhaft den Leerzustand — das Feature ist für echte Nutzer unerreichbar, obwohl Datenschicht + Lifecycle fertig und getestet sind. Das verletzt das Akzeptanzkriterium der Ursprungs-Spec: „Projekt anlegen erzeugt eine `projects`-Zeile + beliebig viele `project_phases`".
2. **Kein Cloud-Schema**: Task 1 hat nur die lokale SQLite-Migration (v37) gebaut. Es existiert keine Supabase-Migration für `projects`/`project_phases`/`activities.project_id` — jeder Cloud-Gateway-Aufruf in einem geteilten Workspace schlägt mit „table does not exist" fehl. Zusätzlich fehlen im Cloud-Insert (`projectToRow`) die Felder `created_at`/`status`, was selbst nach Migration einen NOT-NULL-Fehler auslösen würde.

Nutzer-Entscheidung (2026-07-06): Fast-Follow-Runde JETZT bauen, bevor gemergt wird — nicht als Fundament ohne Nutzbarkeit mergen. Migration wird geschrieben + committet, aber NICHT automatisch live eingespielt (Produktions-Datenbank, braucht PAT + expliziten Auftrag).

**Bewusst NICHT Teil dieser Runde** (bleiben Follow-up-Tickets aus dem Final-Review): die vom Mockup abweichenden Übersichts-Elemente (Segment-Leiste, Legende, KPI-Chips, „Braucht Aufmerksamkeit"-Bucket), „Aufgabe hinzufügen"-Button mit Projekt/Phasen-Picker, Moodboard-Bild-Upload, Cloud-`reorderPhases`-Transaktionalität, Realtime-Replikation für `projects`.

## A. „Neues Projekt"-Modal

**Muster:** `src/components/pipeline/DealModal.tsx` (Struktur, Styling, Kunde-Dropdown mit optionalem `presetCustomerId`-Lock, Fehlerbehandlung, `useDialogFocus`).

**Felder:**
- Kunde\* — Dropdown aus `useCustomersStore().customers` (oder fixe Badge, wenn `presetCustomerId` gesetzt ist — Feld bleibt für eine spätere Einstiegsmöglichkeit aus der Kundenansicht vorbereitet, auch wenn diese Runde den Trigger nur in der Projekt-Übersicht baut).
- Titel\* — Textfeld.
- Beschreibung — optionales Textarea.
- Erste Phase — optionales Textfeld („z.B. Konzeption" — leer lassen erzeugt ein Projekt ganz ohne Phasen, identisch zum bereits bestehenden `phases.length === 0`-Zustand in `ProjectDetailRoute`, der dort schon ein `NewPhaseForm` zeigt).

**Ablauf beim Speichern:**
1. `useProjectsStore().upsert({ workspaceId, accountId: customerId, title, description })` → gibt das neue `Project` zurück.
2. Falls „Erste Phase" ausgefüllt: `useProjectsStore().createPhase({ projectId: project.id, name })`.
3. `setSelectedProjectId(project.id)`, `setAppView('project_detail')`, `onClose()` — Nutzer landet direkt in der neuen Projekt-Detail-Ansicht (kein Zwischenschritt über die leere Übersicht).

**Trigger:** Button „+ Neues Projekt" im Header von `ProjectsOverviewRoute` (rechts neben der Überschrift, `btn-primary`), öffnet das Modal ohne `presetCustomerId`.

**Fehlerfall:** identisch zu `DealModal` — `saveError`-State, Meldung im Modal, kein stiller Fehlschlag.

## B. Supabase-Migration `supabase/migrations/0026_projects.sql`

Folgt dem Muster aus `0025_prepared_items.sql` (Tabellen-Erstellung + RLS) und `0023_direct_messages.sql` (Spalten-Zusatz per `alter table ... add column if not exists`):

```sql
create table if not exists public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active',
  current_phase_id text,
  created_at text not null default (now())::text,
  updated_at text not null default (now())::text,
  completed_at text
);

create table if not exists public.project_phases (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  order_index integer not null,
  created_at text not null default (now())::text
);

create index if not exists idx_projects_ws on public.projects(workspace_id);
create index if not exists idx_project_phases_project on public.project_phases(project_id);

alter table public.projects enable row level security;
alter table public.project_phases enable row level security;

create policy "workspace member" on public.projects
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

-- project_phases hat kein eigenes workspace_id -- Policy geht ueber den Join zum Projekt.
create policy "workspace member via project" on public.project_phases
  for all using (
    exists (select 1 from public.projects p where p.id = project_phases.project_id and is_workspace_member(p.workspace_id))
  ) with check (
    exists (select 1 from public.projects p where p.id = project_phases.project_id and is_workspace_member(p.workspace_id))
  );

alter table public.activities add column if not exists project_id text references public.projects(id);
```

`current_phase_id` bekommt bewusst KEINE `references public.project_phases(id)`-Klausel in der Cloud-Tabelle (Henne-Ei: die erste Phase referenziert das Projekt, das Projekt würde die erste Phase referenzieren — die lokale SQLite-Seite löst das über zwei gestaffelte Migrationsschritte; Postgres könnte es zirkulär per `deferrable` lösen, aber das ist unnötige Komplexität für ein Feld, das ausschließlich über die Anwendung geschrieben wird, nie direkt per SQL-Constraint geprüft werden muss). Kein Realtime-Publish (kein Anwendungsfall für Live-Mitbearbeitung in dieser Runde).

**Cloud-Mapper-Fix** (`src/data/projects.mapper.ts`, Funktion `projectToRow`): ergänzt `created_at: ctx.now` und `status: 'active'` (nur beim Insert-Fall, d.h. wenn `p.id` noch nicht existiert — beim Update-Fall bleibt der Status unangetastet, das übernimmt bereits `setStatus`/`advancePhase`). Schließt den vom Final-Review gefundenen NOT-NULL-Risiko-Bug.

**Migration wird committet, NICHT automatisch angewendet** (Kopfkommentar wie bei `0025`: „NICHT automatisch anwenden — manuell via Management-API einspielen").

## Akzeptanzkriterien (Fast-Follow)

- Ein Nutzer kann über „+ Neues Projekt" in der Übersicht ein Projekt mit Kunde+Titel anlegen und landet direkt in der Detail-Ansicht.
- `npx vitest run` und `npx tsc --noEmit` bleiben grün.
- `supabase/migrations/0026_projects.sql` existiert, ist committet, enthält Tabellen+RLS+Spalten-Zusatz, ist als „nicht angewendet" markiert.
- `projectToRow`-Cloud-Insert setzt `created_at`+`status`, ohne den Update-Pfad zu verändern.
