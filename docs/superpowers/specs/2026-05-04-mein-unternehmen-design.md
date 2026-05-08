# Mein Unternehmen — Design Spec
**Datum:** 2026-05-04  
**Status:** Approved

---

## Ziel

„Mein Unternehmen" ist die zentrale Steuerzentrale des Cynera-Workspace. Der Nutzer konfiguriert dort sein Unternehmensprofil, aktiviert/deaktiviert Module und verwaltet globale CRM-Einstellungen. Dadurch kann Cynera Focus für Agenturen, Coaches, Creator, Dienstleister und Vertriebsteams unterschiedlich aussehen, ohne den Code zu verkomplizieren.

---

## 1. Architektur-Ansatz

**Dedizierter `companyView`-State** im Zustand-Store. Kein Missbrauch von `selectedId`.

- Sidebar-Footer-Icon setzt `companyView` auf eine Unterseite → App rendert `MeinUnternehmen` statt Kundenansicht.
- Wenn `companyView !== null`, wird `selectedId` auf `null` gesetzt.
- Klick auf einen Kunden setzt `companyView` zurück auf `null`.

---

## 2. Datenmodell (Store-Erweiterungen)

### `companyProfile`
```js
{
  name: '',
  industry: '',      // 'Agentur' | 'Coaching' | 'E-Commerce' | 'SaaS' | 'Handwerk' | 'Sonstiges'
  teamSize: '',      // '1' | '2-5' | '6-15' | '16-50' | '50+'
  targetType: '',    // 'Agentur' | 'Coach' | 'Creator' | 'Dienstleister' | 'Vertrieb' | 'Sonstiges'
  description: '',
}
```

### `modules`
```js
{
  crm:         true,   // immer true, nicht deaktivierbar
  workflow:    true,   // Workflow-Tab (To-Dos, Notizen)
  socialMedia: true,   // Social Media-Tab
  deals:       false,  // Deals/Pipeline (Platzhalter)
  followUps:   false,  // Follow-Ups (Platzhalter)
  healthScore: true,   // Health-Tab
  aiInsights:  false,  // AI-Insights (Platzhalter)
}
```

### `crmSettings`
```js
{
  statuses:        ['Lead', 'Aktiv', 'Inaktiv', 'Lost'],
  priorities:      ['Low', 'Medium', 'High'],
  tags:            [],
  followUpEnabled: false,
  followUpDays:    3,
}
```

### UI-State
```js
companyView: null | 'profil' | 'module' | 'crm' | 'workspace'
workspaceName: 'Mein Workspace'
workspaceCreatedAt: <ISO-Datum beim ersten Start>
```

Alle neuen State-Felder werden in den bestehenden `persist`-Block aufgenommen.

---

## 3. Navigation

### Sidebar-Footer
Ein neues **Building-Icon** (`🏢`-SVG) wird als dritter Icon-Button in die Footer-Leiste der Sidebar eingefügt (neben dem bestehenden Übersichts-Icon und dem Profil-Icon).

- Klick: setzt `companyView: 'profil'`, `selectedId: null`
- Aktiv-State: Icon wird mit `var(--p)` eingefärbt wenn `companyView !== null`

### App.jsx Routing-Logik
```
companyView !== null  →  <MeinUnternehmen />
selectedId !== null   →  <CustomerView />
else                  →  <ClientOverview />
```

### CustomerHeader — dynamische Tabs
`TABS`-Array wird durch eine gefilterte Version ersetzt, die `modules`-State liest:

| Tab-ID        | Modul-Key     | Immer sichtbar |
|---------------|---------------|----------------|
| dashboard     | —             | ✓              |
| workflow      | workflow      |                |
| ablage        | —             | ✓              |
| kommunikation | —             | ✓              |
| historie      | —             | ✓              |
| health        | healthScore   |                |
| social        | socialMedia   |                |

---

## 4. Layout — MeinUnternehmen

```
┌─ Sub-Nav (200px, bg1, borderRight) ──┬─ Content (flex: 1, bg, overflow-y auto) ─┐
│                                      │                                           │
│  MEIN UNTERNEHMEN                    │  <aktive Unterseite>                      │
│  (Label, 10px uppercase)             │                                           │
│                                      │                                           │
│  ● Unternehmensprofil                │                                           │
│  ● Module                            │                                           │
│  ● CRM-Einstellungen                 │                                           │
│  ● Workspace                         │                                           │
│                                      │                                           │
└──────────────────────────────────────┴───────────────────────────────────────────┘
```

Sub-Nav-Einträge: gleicher Stil wie Sidebar-Kundeneinträge (hover `var(--bg2)`, aktiv `var(--p5)` + `var(--border3)`).

---

## 5. Unterseiten

### A) Unternehmensprofil (`profil`)

**Layout:** Zwei Spalten — links Formular, rechts Live-Vorschau-Karte.

**Formular (links):**
- Unternehmensname — Text-Input
- Branche — `<select>`: Agentur, Coaching, E-Commerce, SaaS, Handwerk, Sonstiges
- Teamgröße — `<select>`: 1, 2–5, 6–15, 16–50, 50+
- Zieltyp — Pill-Auswahl (6 Optionen, single-select, gleicher Stil wie Filterpills)
- Beschreibung/Mission — `<textarea>`, 4 Zeilen

**Vorschau-Karte (rechts):**
- Cynera-styled Karte mit Unternehmensname groß, Branche + Zieltyp als Badges, Beschreibung, Teamgröße-Info
- Aktualisiert sich live beim Tippen (kein Debounce nötig)

**Speichern-Button:** Explizit, unten links. Setzt `companyProfile` im Store.

---

### B) Module (`module`)

**Layout:** Grid `repeat(auto-fill, minmax(280px, 1fr))`, Gap 16px.

**Modul-Karte:**
- Icon (SVG, 20px)
- Name (Semibold, 14px)
- Kurzbeschreibung (12px, `var(--text3)`)
- Toggle rechts (gleicher Stil wie Theme-Toggle in Sidebar)
- CRM-Karte: Toggle deaktiviert, Badge „Immer aktiv" in `var(--p5)`
- Deaktivierte Module-Karten: `opacity: 0.6`, kein Hover-Effekt

**Wirkung:** Toggle-Änderung aktualisiert `modules` im Store → CustomerHeader filtert Tabs sofort.

---

### C) CRM-Einstellungen (`crm`)

**Layout:** Drei Karten in einer Reihe.

**Karte 1 — Status:**
- Liste der Status als editierbare Chips
- Jeder Chip: Text + × zum Löschen
- Input + „Hinzufügen"-Button unten
- Änderungen direkt in `crmSettings.statuses`

**Karte 2 — Tags:**
- Gleiche Chip-Logik wie Status

**Karte 3 — Follow-Up:**
- Toggle an/aus → `followUpEnabled`
- Zahlen-Input „Standard-Zeitraum: X Tage" → `followUpDays`
- Nur sichtbar/editierbar wenn Toggle an

**CRM-Integration:** `crmSettings.statuses` ersetzt den hardcodierten `status`-Select im Kunden-Formular in `App.jsx`.

---

### D) Workspace-Informationen (`workspace`)

**Layout:** Grid aus Read-only-Karten + eine editierbare Karte.

**Karten:**
- Workspace-Name (editierbar inline, Button „Umbenennen")
- Erstellungsdatum (aus `workspaceCreatedAt`)
- Anzahl Kunden (aus `customers.length`)
- Aktive Module (aus `Object.values(modules).filter(Boolean).length`)
- Speicherverbrauch (geschätzt: `JSON.stringify(localStorage).length / 1024` → „~X KB")

---

## 6. Datei-Struktur (neu)

```
src/components/company/
  MeinUnternehmen.jsx         — Wrapper mit Sub-Nav + Content-Router
  UnternehmensProfil.jsx      — Unterseite A
  ModuleManager.jsx           — Unterseite B
  CrmSettings.jsx             — Unterseite C
  WorkspaceInfo.jsx           — Unterseite D
```

## 7. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/store/index.js` | `companyProfile`, `modules`, `crmSettings`, `companyView`, `workspaceName`, `workspaceCreatedAt` + Actions. `selectCustomer` setzt zusätzlich `companyView: null`. `workspaceCreatedAt` wird beim ersten Persist-Lauf initialisiert (einmalig, nie überschrieben). |
| `src/App.jsx` | Routing-Logik für `companyView`, Status-Dropdown aus `crmSettings.statuses` |
| `src/components/layout/Sidebar.jsx` | Building-Icon im Footer, `companyView`-aktiv-State |
| `src/components/customer/CustomerHeader.jsx` | Dynamische TABS-Filterung via `modules` |

---

## 8. Design-Anforderungen

- Gleiche CSS-Variablen wie bestehendes UI (`var(--bg1)`, `var(--p)`, `var(--border)` etc.)
- Font: Plus Jakarta Sans (bereits geladen)
- Karten: `var(--r-lg)`, `border: 1px solid var(--border)`, `background: var(--bg1)`
- Kein Dark/Light-Sonderfall — CSS-Variablen handeln das automatisch
- Keine überladenen Animationen — nur die bestehenden framer-motion-Muster wo sinnvoll

---

## 9. Out of Scope (Phase 1)

- Deals/Pipeline, Follow-Ups, AI-Insights: Module vorhanden und togglebar, aber Inhalte sind Platzhalter-Tabs
- Per-Kunde-Modul-Überschreibung
- Multi-Workspace-Support
