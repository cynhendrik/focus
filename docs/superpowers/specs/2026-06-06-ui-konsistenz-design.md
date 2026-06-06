# UI-Konsistenz — Design-Spec
**Datum:** 2026-06-06

## Problem

Die App hat mehrere Haupt-Routes, die unterschiedliche Heading-Größen, Padding-Werte und Styling-Ansätze verwenden. Das führt zu einem uneinheitlichen Gesamtbild.

### Konkrete Inkonsistenzen

| Route | Heading | Padding-Container |
|---|---|---|
| Finanzen, Kalender, Pipeline | `.greeting-title` = `clamp(48px, 6vw, 88px)` ✅ | `.main-inner` = 32px/48px ✅ |
| Heute (DashboardRoute) | `fontSize: 42`, falsche letter-spacing ❌ | `24px/28px` (zu wenig) ❌ |
| Aufträge & Zeit (ZeitmanagementRoute) | `fontSize: 32` ❌ | eigenes div `28px/28px` ❌ |
| Übersicht/Kunden (OverviewRoute) | Tailwind `text-xl` ≈ 20px ❌ | Tailwind `p-6` ❌ |

---

## Lösung: `PageHeader`-Komponente + Normierung

### Ansatz B — Gemeinsame Komponente

Eine neue Komponente `src/components/layout/PageHeader.tsx` kapselt die `.greeting`-Struktur.

#### Schnittstelle

```tsx
interface PageHeaderProps {
  title: string        // z.B. "Finanzen"
  titleDot?: boolean   // ob ein gedimmter Punkt am Ende erscheint (Standard: true)
  sub?: React.ReactNode   // linke Untertitelzeile (z.B. "Mai 2026 · KW 20")
  subRight?: React.ReactNode  // rechte Spalte (z.B. KPI-Wert, Zähler)
  action?: React.ReactNode    // optionale Buttons oben rechts (für OverviewRoute)
}
```

#### Rendering

```tsx
// Nutzt exakt die CSS-Klassen aus globals.css:
<div className="greeting">
  <h1 className="greeting-title">
    {title}{titleDot !== false && <em>.</em>}
  </h1>
  {(sub || subRight) && (
    <div className="greeting-sub">
      {sub && <span>{sub}</span>}
      {subRight && <span>{subRight}</span>}
    </div>
  )}
</div>
```

Kein neues CSS nötig. Die `.greeting`-Klassen sind bereits vollständig in `globals.css` definiert.

---

## Betroffene Routes

### 1. `DashboardRoute` (Heute)

**Vorher:** `DashboardHero`-Komponente mit inline `fontSize: 42, fontWeight: 700`  
**Nachher:** `<PageHeader title="Guten Morgen, Hendrik" titleDot={false} ... />`  
Personalisierter Akzentname bleibt (`<em>` oder `<span style={{ color: 'var(--accent)' }}>`)  
Padding: `main-inner` Standard wird beibehalten (kein Override mehr nötig)

### 2. `ZeitmanagementRoute`

**Vorher:** inline h1 `fontSize: 32`, eigenes div-Container  
**Nachher:** `<PageHeader title="Aufträge & Zeit" sub="..." />` + Route in `.main-inner` wrappen

### 3. `OverviewRoute`

**Vorher:** Tailwind `text-xl font-semibold`, `p-6`, Tailwind-Grid  
**Nachher:** `<PageHeader title="Übersicht" sub="..." action={<button>+ Neuer Kunde</button>} />` + `.main-inner` Container  
Kunden-Liste bleibt als Tailwind — nur der Header-Bereich wird normiert

---

## Spacing-Normierung

Alle betroffenen Routes sollen:
- Äußeres `<div className="main-inner">` nutzen (keine padding-Overrides)
- Interner Abstands-Rhythmus: `gap: 14–24px` zwischen Sektionen, konsistent mit den bereits korrekten Routes

### Abstand nach PageHeader

Die `.greeting`-Klasse hat `margin-bottom: 28px` eingebaut — kein manueller Abstand nötig.

---

## Was NICHT geändert wird

- `HeuteRoute` (die Swipe-Karten-Ansicht im separaten Tab) — hat bewusst eigenes Layout als Focus-Mode
- `CalendarRoute`, `FinanceRoute`, `PipelineRoute` — bereits korrekt, keine Änderungen
- Interne Komponenten-Styles (Karten, Listen, Tabellen) — nur der Page-Level-Header wird normiert
- Tailwind in Unterkomponenten (z.B. `DashboardPane`) — außerhalb des Scope

---

## Implementierungsreihenfolge

1. `PageHeader`-Komponente erstellen (`src/components/layout/PageHeader.tsx`)
2. `DashboardRoute` — `DashboardHero` durch `PageHeader` ersetzen, Padding normieren
3. `ZeitmanagementRoute` — Header + Container normieren
4. `OverviewRoute` — Header + Container normieren
5. Visuelle Verifikation: alle Routes nebeneinander vergleichen

---

## Erfolgskriterien

- Alle Haupt-Routes zeigen heading in identischer Schriftgröße (`clamp(48px, 6vw, 88px)`)
- Alle Routes haben denselben horizontalen Außenabstand (`.main-inner` = `48px` seitlich)
- Die persönliche Begrüßung auf "Heute" hat dasselbe visuelle Gewicht wie "Finanzen." und "Kalender."
- Kein neues CSS nötig — nur bestehende Klassen verwenden
