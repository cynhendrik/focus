# Smart Lists & Lead → Pipeline Bridge

**Datum:** 2026-05-29
**Branch:** feature/v2-redesign
**Status:** Design (zur Implementierung freigegeben nach User-Review)

## Kontext

Zwei Lücken im Sales-Modul:

1. **Smart Lists ist ein Placeholder.** `SmartListsRoute.tsx` zeigt nur "Kommt bald". Backend (DB-Schema, Tauri-Commands, Service-Layer, Store) ist komplett implementiert und seedet System-Listen beim App-Start — die UI fehlt vollständig.

2. **Leads und Pipeline (Deals) sind zwei getrennte Welten.** Lead-Konvertierung via `convertToClient` macht aus dem Lead-Account einen Customer-Account, legt aber keinen Deal an. Der User muss manuell in die Pipeline wechseln und einen Deal erstellen. Reibungspunkt im wichtigsten Sales-Flow.

Beide Features sind unabhängig voneinander, leben aber in derselben Sales-Sidebar-Sektion und werden zusammen ausgeliefert.

## Feature 1: Lead → Pipeline Auto-Bridge

### Trigger

Vierte Spalte **"Termin gebucht"** am Lead-Board in `LeadsRoute.tsx` (zusätzlich zu `new` / `attempted` / `warm`). Drag eines Leads in diese Spalte triggert die Konvertierung.

Column-Definition:
```ts
{ id: 'call_booked', label: 'Termin gebucht', hoverBg: 'rgba(208,252,105,0.10)', dot: '#D0FC69' }
```
Akzentfarbe (Brand-Grün) signalisiert: Zielspalte des Sales-Flows.

### Datenmodell-Grundlage

Lead und Customer teilen sich die `accounts`-Tabelle. Konvertierung ändert nur `account_type` von `'lead'` zu `'customer'` und `status` auf `'aktiv'`. Die ID bleibt stabil — `lead.id === customer.id` nach Convert. Das macht `Deal.accountId` trivial.

### Drop-Flow

Neue Store-Action `useLeadsStore.convertToDeal(leadId, workspaceId, userId)`:

1. Lead lokal merken (Name + reichlich Kontext fürs Deal/Toast)
2. `LeadsService.convertToClient(leadId)` — Lead wird Customer
3. Erste aktive Pipeline-Stage holen: `usePipelineStore.getState().activeStages()[0]`
4. `DealsService.upsert({ workspaceId, createdBy: userId, accountId: leadId, customerId: leadId, title: lead.name, stage: firstStage.name, value: 0 })` — `upsert` ohne `id` legt neu an
5. Lead aus `leads`-Store entfernen, Deal in `deals`-Store einfügen, Customer-Store reloaden
6. Toast bottom-right: **"Deal angelegt — {leadName}"** mit Button **"→ Pipeline öffnen"** (setzt `appView: 'pipeline'`)

### Edge Cases

- **Keine Pipeline-Stages konfiguriert:** `PipelineService.seed()` läuft beim App-Start (`App.tsx`), Default-Stages existieren immer. Falls Stages aus irgendeinem Grund leer: Toast "Bitte erst Pipeline-Stages anlegen" + Drop abbrechen, keine partielle State-Änderung.
- **Backend-Fehler beim Convert:** Lead bleibt im `attempted`/`warm`-Status, Drop-Animation rollt zurück, Toast mit Error.
- **Bereits konvertierte Leads:** Lead-Board zeigt nur Accounts mit `accountType === 'lead'`, daher unmöglich.

### Visuelles

- Drop-Animation: Karte fade-out + scale(0.95) über 200ms, dann Removal
- Toast: 4 Sekunden sichtbar, slide-in von rechts, manuell schließbar
- Spalten-Header "Termin gebucht": gleicher Style wie andere Columns, nur Akzent-Dot in Brand-Grün

### Geänderte/neue Files

- `src/routes/LeadsRoute.tsx` — `COLUMNS`-Array um `call_booked` erweitert; `handleDragEnd` zweigt bei Drop auf `call_booked` zur neuen Store-Action ab
- `src/store/leads.store.ts` — neue Action `convertToDeal(leadId, workspaceId, userId)`
- `src/components/ui/Toast.tsx` — Rewrite des bestehenden `Toast.jsx` als TypeScript-Version mit optionalem Action-Button (Label + onClick). Render-Slot bleibt in `App.tsx` (existing `ToastProvider`-Mount entfernt)
- `src/store/toast.store.ts` (neu) — Zustand-basierter Toast-Queue: `showToast({ message, action? })`, `dismissToast(id)`. Ersetzt den hackigen module-level `_showToast`-Trick im aktuellen `Toast.jsx`

### Type-Änderungen

Keine. `Deal.accountId`, `Customer.id`, `Lead.id` sind alle bereits `string`. `convertToClient` returnt aktuell `Lead`, das passt — wir brauchen vom Backend keine Customer-Daten zurück, da `leadId === customerId`.

---

## Feature 2: Smart Lists UI

### Layout

`SmartListsRoute.tsx` wird komplett neu geschrieben. Zwei-Spalten-Layout, full-height:

```
┌─────────────────────────────────────────────────────────────┐
│ Topbar (existing)                                           │
├──────────────┬──────────────────────────────────────────────┤
│              │ FilterBar (chips, active filter dimensions)  │
│ Smart Lists  ├──────────────────────────────────────────────┤
│ [+]          │ <Listenname>          {n} Kunden  [Speichern]│
│              ├──────────────────────────────────────────────┤
│ ▸ System     │                                              │
│   Aktiv      │ Customer Tabelle (gefiltert)                 │
│   Hoch-Prio  │                                              │
│ ▸ Meine      │                                              │
│   ★ VIP      │                                              │
│   Inaktiv30  │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### Komponenten

**`SmartListPanel`** (links, 260px breit)
- Header: "Smart Lists" h2 + `+`-Button (öffnet `SmartListModal`)
- Gruppe **System** (collapsible, expanded by default): seeded Listen mit `isSystem === true`, read-only
- Gruppe **Meine Listen**: user-erstellte Listen, mit Hover-Actions (rename, delete, duplicate)
- Jede Zeile: Lucide-Icon (aus dem `icon`-String der SmartList) + Name + Match-Count (Mono, rechtsbündig, `var(--fg-dim)`)
- Active-State: 2px linker Akzent-Balken, `background: var(--accent-soft)`
- Click → setzt `activeListId` im Store

**`FilterEditor`** (oben rechts, inline)
- Geteilt zwischen FilterBar (oben im Right-Panel) und SmartListModal
- Chip pro Filter-Dimension:
  - **Status** — Multi-Select-Chips: Lead / Aktiv / Inaktiv / Lost
  - **Priorität** — Multi-Select-Chips: Low / Normal / High
  - **Score** — Dual-Range (0-100), zeigt "Score: 60-100" wenn gesetzt
  - **Industry** — Multi-Select-Chips, Werte aus `INDUSTRIES`-Konstante (`OnboardingWizard.tsx`)
  - **Tags** — Free-Text-Input mit Chip-Display
  - **Inactive Days** — Number-Input "Inaktiv seit ≥ {n} Tagen"
- Klick auf Chip öffnet inline-Popover zum Editieren
- "Clear"-Button rechts wenn mindestens ein Filter aktiv
- Bei Änderung gegenüber gespeichertem Filter: zeigt "Speichern"-Button im Sub-Header (persistiert geänderten Filter)

**`CustomerTableFiltered`** (Hauptbereich)
- Spalten: Name | Status (Chip) | Priorität | Score (Mono) | Industry | Letzte Aktivität (relativ) | Actions
- Sortbar pro Spalte (Click-Header)
- Click Row → `setSelectedCustomer(c.id)` + `setAppView('clients')`
- Empty State: Icon + "Keine Kunden matchen diesen Filter." + (falls Filter aktiv) "Filter zurücksetzen"-Button

**`SmartListModal`** (Create + Edit)
- Felder: Name (text), Icon-Picker, Filter-Editor (inline)
- Icon-Picker: 6-8 Lucide-Optionen — `Users, Star, Flame, Zap, AlertTriangle, Clock, Award, Sparkles`
- Save → `SmartListService.upsert`
- Edit-Mode: Initial-State aus selectedList, Save schreibt zurück (gleiche ID)

### Pure Filter-Function

Neue Datei `src/lib/smartListFilter.ts`:

```ts
export function applyFilter(
  customers: Customer[],
  filter: SmartListFilter,
): Customer[] {
  return customers.filter(c => {
    if (filter.status?.length && !filter.status.includes(c.status)) return false
    if (filter.priority?.length && !filter.priority.includes(c.priority)) return false
    if (filter.scoreMin !== undefined && c.leadScore < filter.scoreMin) return false
    if (filter.scoreMax !== undefined && c.leadScore > filter.scoreMax) return false
    if (filter.industry?.length && !c.industry) return false
    if (filter.industry?.length && c.industry && !filter.industry.includes(c.industry)) return false
    if (filter.tags?.length && !filter.tags.every(t => c.tags.includes(t))) return false
    if (filter.inactiveDays !== undefined) {
      // Customer hat aktuell kein lastActivityAt direkt — wir nutzen updatedAt als Proxy
      const inactiveMs = filter.inactiveDays * 86_400_000
      if (Date.now() - new Date(c.updatedAt).getTime() < inactiveMs) return false
    }
    return true
  })
}
```

Pure-Function, voll testbar. Keine Side-Effects, keine State-Reads.

### Store-Erweiterung

`src/store/smart-lists.store.ts` bekommt:
- `activeListId: string | null`
- `setActiveList(id: string | null): void`
- `activeList(): SmartList | null` — Getter

`activeListId` wird in localStorage persistiert (`cynera:smartlists:active-v1`), damit der State beim Reload erhalten bleibt.

### Match-Count-Performance

`SmartListPanel` zeigt pro Liste die Match-Count. Bei N Smart Lists und M Kunden: O(N×M) pro Render. Für realistische Größen (N<50, M<10k) unkritisch. `useMemo` mit Dependencies `[customers, smartLists]` reicht.

### Geänderte/neue Files

- `src/routes/SmartListsRoute.tsx` — kompletter Rewrite (~150 Zeilen)
- `src/components/smart-lists/SmartListPanel.tsx` (neu)
- `src/components/smart-lists/FilterEditor.tsx` (neu)
- `src/components/smart-lists/CustomerTableFiltered.tsx` (neu)
- `src/components/smart-lists/SmartListModal.tsx` (neu)
- `src/lib/smartListFilter.ts` (neu, pure function + unit-Tests)
- `src/store/smart-lists.store.ts` (extend: `activeListId`, `setActiveList`)

### Type-Änderungen

Keine — `SmartList`-, `SmartListFilter`-, `Customer`-Types existieren vollständig.

---

## Testing

**Feature 1 (Lead → Pipeline):**
- Manuell: Lead anlegen → drag durch Spalten bis "Termin gebucht" → Verifizieren: Customer entsteht, Deal in Pipeline mit Lead-Name, Toast erscheint
- Edge: Pipeline ohne Stages → Drop-Abbruch + Error-Toast
- Edge: Backend-Fehler simulieren (z.B. via Network-Throttle) → Lead bleibt im alten Status

**Feature 2 (Smart Lists):**
- Unit-Tests für `applyFilter`: jede Dimension einzeln, Kombinationen, Edge-Cases (leere Filter, leere Customer-Liste)
- Manuell: System-Liste anklicken → Match-Count und Tabelle korrekt; User-Liste erstellen → erscheint links, filtert korrekt; Liste löschen → verschwindet; activeListId persistiert über Reload

## Out-of-Scope

- Smart-List-basierte Bulk-Actions (Bulk-Email an Liste, Tag-Apply etc.) — späteres Feature
- Smart Lists für Leads (statt Customers) — aktuelles Modell ist Customer-only, Lead-Filter wäre eigene Smart-List-Variante
- Drag-Reordering der Smart Lists in der Sidebar — `orderIndex` ist im Schema, aber UI dafür ist nicht Teil dieses Specs
- Sharing/Team-Smart-Lists — Workspace-scoped reicht
- Lead → Customer ohne Deal (klassischer `convertToClient`-Flow): bleibt verfügbar via Rechtsklick-Menü, der neue Auto-Bridge-Flow ist additiv

## Abhängigkeiten

Keine externen. Alle Backend-Pieces sind da:
- `convert_lead_to_client` Tauri-Command ✓
- `seed_system_smart_lists` Tauri-Command ✓
- `upsert_smart_list`, `get_smart_lists`, `delete_smart_list` ✓
- Pipeline-Stages mit Seed-Defaults ✓ (`PipelineService.seed` in `App.tsx`)
- `DealsService.upsert` ✓ (für Create und Update)
