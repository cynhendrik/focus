# Nav Redesign — Design Spec
**Datum:** 2026-06-05  
**Status:** Approved

---

## Ziel

Die Sidebar-Navigation soll sauber, logisch und Apple-like wirken. Keine redundanten Elemente, keine visuellen Widersprüche, klare Hierarchie.

## Struktur (genehmigt)

```
[Brand: Focus / CYNERA · 2026]

CORRA                          ← featured, lime, ⌘K — kein Section-Label
─────────────────────────────
HEUTE (Section-Label)
  Dashboard                    ← bold, primary destination, kbd: H

INBOX (Section-Label)
  Posteingang                  ← Mail-Icon, Badge wenn unread > 0
  Kalender                     ← Calendar-Icon
  Zeitmanagement               ← Clock-Icon

WORKSPACE (Section-Label)
  Kunden                       ← Users-Icon, kein Badge
  Akquise                      ← Target-Icon, Badge: newLeads + openDeals (wenn > 0)
  Finanzen                     ← CreditCard-Icon

[flex spacer]

Quick Capture (gestrichelt)    ← PenLine-Icon, kbd: ⌘⇧N
Integrationen
Einstellungen
[Profil-Zeile: Avatar + Name]
```

## Design-Entscheidungen

### CORRA
- Steht über allen Sektionen — kein Section-Label, kein Accordion
- Farbe: `var(--accent)` (Lime) für Icon und Label-Text
- Kein Glow-Filter (war übertrieben)
- Shortcut `⌘K` rechts als kbd-Chip

### Section-Labels
- Stil: `9.5px`, `font-weight: 700`, `letter-spacing: 0.1em`, monospace, uppercase, `color: var(--fg-dim)`
- Padding: `12px 10px 3px` (mehr Abstand oben als unten)
- Kein Divider zusätzlich — Label allein trennt die Sektionen

### Nav-Items
- Eine einzige CSS-Klasse `.nav-item` für alle Standard-Items (kein `.nav-item-heute`, kein `.corra-nav-item` als separate Klassen)
- `font-weight: 700` für das Heute/Dashboard-Item via Modifier `.nav-item--primary`
- `color: var(--accent)` für CORRA via Modifier `.nav-item--featured`
- Aktiv-Indikator: 3px Lime-Linie links (via `::before`, `left: -14px`)

### Inbox — kein Accordion
- Posteingang, Kalender, Zeitmanagement sind flat — kein aufklappbarer Header
- Zeitmanagement gehört zu Inbox (zeitbasiert, nicht Business/Workspace)
- Im collapsed State: alle drei Icons sichtbar

### Badges
- **Posteingang:** `unreadMails` — nur wenn > 0
- **Akquise:** `newLeads + openDeals` — nur wenn > 0
- **Kunden:** kein Badge — Gesamtanzahl ist kein actionable Signal

### Quick Capture
- Gestrichelter Button — bleibt, aber via CSS-Klasse `.nav-capture` statt Inline-Styles
- Hover: `border-color: var(--accent)`, `color: var(--accent)`

### Collapsed State
- Section-Labels: `display: none`
- Alle Items: Icon zentriert, Label ausgeblendet
- CORRA: Icon zentriert
- Profile: nur Avatar

## CSS-Refactoring

Statt drei fast-identischer Klassen (`.nav-item`, `.corra-nav-item`, `.nav-item-heute`) gibt es eine Basis-Klasse:

```css
.nav-item { /* alle gemeinsamen Styles */ }
.nav-item--primary { font-weight: 700; }
.nav-item--featured { color: var(--accent); font-weight: 600; }
.nav-item--featured .nav-item-icon { color: var(--accent); }
```

## Komponenten

Kein Strukturwandel — alles bleibt in `NavSidebar.tsx`. Interne Bereinigung:
- `InboxSection` Komponente entfällt (kein Accordion mehr)
- `SubItem` Komponente entfällt
- `useEffect` für View-Redirect bleibt vorerst (separates Thema)

## Was bleibt gleich

- Collapse/Expand-Funktionalität
- Profil-Zeile unten
- Keyboard-Shortcuts (H, A, C, F, Z)
- Quick Capture Trigger
