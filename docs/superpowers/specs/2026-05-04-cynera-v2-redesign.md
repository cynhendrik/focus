# Cynera v2 — Complete Redesign Spec
**Date:** 2026-05-04
**Status:** Approved
**Approach:** Option B — UI-Neubau im gleichen Repo (alle Komponenten neu, Store-Logik bleibt)

---

## 1. Vision

Cynera bekommt ein komplett neues visuelles und strukturelles Fundament. Light Theme als primäres Design, 3-Spalten-Layout für die Kundenansicht, Health Score System pro Kunde, Kategorie-Verwaltung und ein simuliertes AI-Panel. Die Store-Logik, Tauri-Config und Basis-Packages bleiben erhalten — alle Komponenten werden von Grund auf neu gebaut.

---

## 2. Design Tokens (`src/styles/globals.css`)

### Light Theme (primär / Default)

```css
:root {
  /* Backgrounds */
  --bg:    #F4F4F8;
  --bg1:   #FFFFFF;
  --bg2:   #F0EFF8;
  --bg3:   #E8E7F4;
  --bg4:   #DDD9F0;
  --bg5:   #D1CBE8;

  /* Purple Accents */
  --p:     #7C3AED;
  --p2:    #6D28D9;
  --p3:    #C4B5FD;
  --p4:    #EDE9FE;
  --p5:    rgba(124,58,237,0.08);
  --p6:    rgba(124,58,237,0.14);

  /* Text */
  --text:  #111827;
  --text2: #4B5563;
  --text3: #9CA3AF;
  --text4: #D1D5DB;

  /* Borders */
  --border:  rgba(0,0,0,0.08);
  --border2: rgba(0,0,0,0.12);
  --border3: rgba(124,58,237,0.20);

  /* Semantic */
  --green: #22C55E;
  --amber: #F59E0B;
  --red:   #EF4444;
  --blue:  #3B82F6;

  /* Radius */
  --r-xs:  6px;
  --r-sm:  8px;
  --r-md:  12px;
  --r-lg:  16px;
  --r-xl:  20px;
  --r-pill: 999px;

  /* Shadows */
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.10);

  /* Legacy */
  --r: var(--r-md);
  --shadow: var(--shadow-md);
}
```

### Dark Theme (optional, via Toggle)

```css
[data-theme="dark"] {
  --bg:    #0C0C0F;
  --bg1:   #111115;
  --bg2:   #16161B;
  --bg3:   #1C1C23;
  --bg4:   #23232C;
  --bg5:   #2A2A36;
  --border:  rgba(124,58,237,0.08);
  --border2: rgba(124,58,237,0.16);
  --border3: rgba(124,58,237,0.28);
  --text:  #F0F0FF;
  --text2: #8B8BA7;
  --text3: #4A4A6A;
  --text4: #2E2E48;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.30);
  --shadow-md: 0 4px 24px rgba(0,0,0,0.50);
  --shadow-lg: 0 8px 48px rgba(0,0,0,0.65);
}
```

---

## 3. Was bleibt / Was fällt weg

### Bleibt erhalten
| Pfad | Status |
|---|---|
| `src/store/` | Bleibt komplett, nur Erweiterungen |
| `src-tauri/` | Unverändert |
| `package.json`, `vite.config.js` | Unverändert |
| `src/main.jsx` | Minimal-Anpassung (Theme-Default auf light) |
| `src/utils/helpers.js` | Bleibt |

### Wird gelöscht & neu gebaut
- Alle `src/components/**`
- `src/styles/globals.css` (komplett neues Token-Set)
- `src/App.jsx` (Neuaufbau)

---

## 4. Datenmodell-Erweiterungen

### `customers` (bestehend, erweitert)
Zwei neue Felder:
- `category: string` — z.B. "Buchhaltung", "Steuererklärung", "Jahresabschluss" (frei editierbar)
- `status: 'aktiv' | 'inaktiv'` — Default: `'aktiv'`

### `healthScores` (neu)
```js
{
  id: string,
  customerId: string,
  score: number,          // 0–100, manuell gesetzt
  engagement: number,     // %, manuell
  onTimeDelivery: number, // %, manuell
  updatedAt: string,      // ISO date
}
```
Health Score Schwellen: Healthy ≥ 80, Warning 60–79, At Risk < 60.

### `deadlines` (neu)
```js
{
  id: string,
  customerId: string,
  title: string,
  date: string,           // ISO date
  priority: 'high' | 'medium' | 'low',
  createdAt: string,
}
```

---

## 5. Screen-Struktur

### Screen 1 — IntroScreen
Erscheint beim ersten App-Start (Flag in Store: `hasSeenIntro`). Danach übersprungen.

- Hintergrund: `--bg` (hellgrau-lila)
- Animierter Titel: "If we build, we build to win" — Wörter erscheinen nacheinander (stagger, framer-motion)
- Greeting-Badge: Pill `✦ Hello, User` (weißer Hintergrund, leichter Shadow)
- Subtitle: "Welcome to Cynera — your command center for client success." (`Cynera` in `--p`)
- CTA-Button: "Let's Work →" (Pill, `--p` Background, weiß)
- "?" Help-Button unten rechts (fixiert)

### Screen 2 — Client Overview (kein Kunde ausgewählt)
Zweispaltig: Sidebar links, Hauptbereich rechts.

**Hauptbereich:**
- Heading: "Client Overview" + Subtitle
- Filter-Bar: Chips für Alle / Healthy (80+) / Warning (60–79) / At Risk (<60) + Kategorie-Chips
- 4 Stat-Cards: Total Clients, Avg Health Score (mit Trend), Healthy Clients, At Risk
- Kategorie-Breakdown-Cards: eine pro Kategorie, zeigt Anzahl + Ø Health Score + Farbbalken
- Client List Tabelle: Spalten CLIENT · CATEGORY · HEALTH SCORE · STATUS · LAST ACTIVITY

### Screen 3 — Customer View (Kunde ausgewählt)
Dreispaltig: Sidebar + Main + AI-Panel (nur Dashboard-Tab).

**Customer Header (über den Tabs):**
- Großer Avatar (lila, Initialen)
- Name (bold, groß)
- Kategorie-Badge (grau Pill)
- Status-Badge (grün "Aktiv" / grau "Inaktiv")
- "Letzte Aktivität: vor X Std."
- Rechts: Health Score als große Zahl + "HEALTH SCORE" Label + Trend (+6 grün / -3 rot)

**Tab-Navigation:** Dashboard · Workflow · Ablage · Kommunikation · Historie · Health

---

## 6. Layout — Customer View

```
┌────────────┬──────────────────────────────┬────────────┐
│  Sidebar   │         Main Content         │  AI Panel  │
│  264px     │         flex: 1              │  280px     │
│            │                              │            │
│            │  (Customer Header)           │  (nur bei  │
│            │  (Tab Bar)                   │  Dashboard)│
│            │  (Tab Content)               │            │
└────────────┴──────────────────────────────┴────────────┘
```

Das AI-Panel ist **ausschließlich** im Dashboard-Tab sichtbar. Alle anderen Tabs nutzen volle Breite (Sidebar + Main, kein rechtes Panel).

---

## 7. Komponenten — Detail

### Sidebar (`Sidebar.jsx`)
- Header: "CYNERA" bold + "CLIENTS" in `--p`
- Suchfeld: "Search clients..."
- Kategorie-Filter: "KATEGORIE" Label + Chips (Alle + dynamisch aus Kundendaten)
- "+ New Client" Button (lila, volle Breite)
- "CLIENTS · N" Section-Label
- Kundenliste: Avatar + Name + Kategorie-Tag + offene Tasks Badge
- Footer: Grid-Icon (zur Übersicht), Person-Icon, Theme-Toggle

### TopBar (`TopBar.jsx`)
- Links: "Today in Cynera" (bold) + Datum darunter (grau)
- Mitte: Search-Input (Pill, "Search...")
- Rechts: "+ New Client" Button (lila Pill)

### CustomerDashboard (`CustomerDashboard.jsx`)

**"What matters today" Banner:**
- Lila Gradient-Hintergrund
- ✦ Icon + "What matters today" Titel
- Simulierter AI-Text (statischer Placeholder, aus `healthScores`-Daten generiert)

**Client Health Section:**
- 3 Cards: Health Score (mit "Good"/"Warning"/"At Risk"-Badge), Engagement (%), On-Time Delivery (%)
- Jede Card: Großzahl + farbiger Fortschrittsbalken

**Upcoming Deadlines:**
- Liste aus `deadlines`-Entität, nach Datum sortiert
- Priority-Badge: high (rot), medium (amber), low (grau)

**KPI Snapshot:**
- Zeigt die letzten 2 KPI-Einträge aus bestehendem `kpis`-Store

### AI Panel (`AiPanel.jsx`)
Simuliert — alle Texte sind statische Strings, berechnet aus vorhandenen Daten (kein API-Call).

- **"Ich habe etwas analysiert"** Card (lila): Text aus Health Score + Trend berechnet
- Quick Actions: "Health Score erklären", "Größtes Risiko?", "Nächste Schritte?" (klappbare Textblöcke, statisch)
- **Focus Section:** Liste der offenen Todos des Kunden (aus bestehendem `todos`-Store), mit Priority-Dot
- **Cynera Focus AI:** 3 Sektionen (SYSTEM OVERVIEW, RISKS & ALERTS, OPPORTUNITIES) — statische Placeholder-Bullets, aus vorhandenen Daten befüllt

### Tabs — Gerüst

| Tab | Inhalt beim Start |
|---|---|
| Dashboard | Voll implementiert (s.o.) |
| Workflow | Bestehende TodoPane + NotesPane + KpisPane (angepasstes Styling) |
| Ablage | Bestehende AblagePane (angepasstes Styling) |
| Kommunikation | Placeholder: "Kommunikation — coming soon" |
| Historie | Placeholder: Timeline der Aktivitäten (aus `createdAt` der Entitäten) |
| Health | Detail-Ansicht des Health Scores: Verlauf + Metriken editierbar |

---

## 8. Neue Store-Slices

`dataSlice.js` erhält:
- `healthScores: []` + `addHealthScore`, `updateHealthScore`
- `deadlines: []` + `addDeadline`, `updateDeadline`, `deleteDeadline`

`customers` in `dataSlice.js` erweitert um `category` und `status` beim `addCustomer`.

---

## 9. Out of Scope

- KI-API-Integration (kommt später)
- Kommunikation-Tab (Placeholder)
- Mobile / Responsive Design
- TypeScript-Migration
- Cloud-Sync / Backend
- Intro-Screen Personalisierung (Name bleibt "User")
