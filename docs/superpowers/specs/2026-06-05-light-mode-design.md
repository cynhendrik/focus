# Light Mode Design Spec
**Datum:** 2026-06-05  
**Status:** Approved

---

## Ziel

Der Light Mode soll sich wie eine echte macOS-App anfühlen — nicht wie ein invertierter Dark Mode. Klare visuelle Tiefe durch Schichtung (Sidebar → Background → Karten), saubere Typografie-Hierarchie, keine Lime-Farbe sichtbar.

## Charakter: macOS Translucent

Referenz: macOS Finder, Apple Mail, Notes.

- **Sidebar:** transluzentes Grau, leicht vom Content abgehoben
- **Content-Background:** `#f2f2f7` (System-Grau) — Karten liegen weiß darauf
- **Karten:** Weiß mit subtilstem Schatten
- **Topbar:** leicht transluzent, von Content getrennt durch Border

## CSS-Variablen — `[data-theme="light"]` komplett

```css
[data-theme="light"] {
  /* Hintergründe */
  --bg:        oklch(96% 0.002 270);   /* f2f2f7 — Content-Background */
  --bg-2:      oklch(94% 0.003 270);
  --surface:   oklch(100% 0 0);        /* fff — Karten */
  --surface-2: oklch(97% 0.002 270);   /* leicht grau — aktive Nav-Items */
  --surface-3: oklch(94% 0.003 270);

  /* Borders */
  --border:        oklch(88% 0.003 270);   /* e8e8ed */
  --border-strong: oklch(78% 0.004 270);

  /* Text */
  --fg:       oklch(12% 0 0);    /* 1a1a1a */
  --fg-2:     oklch(23% 0 0);    /* 3a3a3c */
  --fg-muted: oklch(39% 0 0);    /* 636366 */
  --fg-dim:   oklch(56% 0 0);    /* 8e8e93 */

  /* Accent = near-black, kein Lime */
  --accent:      oklch(14% 0 0);
  --accent-2:    oklch(24% 0 0);
  --accent-soft: oklch(14% 0 0 / 0.07);
  --accent-glow: oklch(14% 0 0 / 0.12);
  --accent-text: oklch(14% 0 0);
  --accent-ink:  oklch(98% 0 0);   /* weißer Text auf schwarzem Button */

  /* Status-Farben dunkel für Weiß-Hintergrund */
  --danger: oklch(48% 0.18 25);    /* dunkles Rot */
  --warn:   oklch(44% 0.16 70);    /* dunkles Amber */
  --ok:     oklch(40% 0.18 155);   /* dunkles Grün */
  --info:   oklch(44% 0.15 235);   /* dunkles Blau */

  /* Schatten */
  --shadow-1: 0 1px 0 rgba(255,255,255,0.9) inset, 0 0 0 1px rgba(0,0,0,0.06);
  --shadow-2: 0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-glass: 0 1px 0 rgba(255,255,255,0.9) inset, 0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.14);
}
```

## Sidebar

```
background: rgba(242,242,247,0.92)
backdrop-filter: blur(24px)
border-right: 1px solid rgba(0,0,0,0.07)
```

- **CORRA:** Icon schwarz, Label dunkelgrau, `font-weight: 600`
- **Aktive Items:** `background: rgba(255,255,255,0.7)`, `box-shadow: --shadow-1`, `color: var(--fg)`
- **Aktiv-Indikator (::before):** `background: var(--accent)` = near-black, 3px Linie
- **Badges:** `background: var(--accent)` = schwarz, `color: var(--accent-ink)` = weiß
- **Quick Capture Border:** `var(--border)` = `oklch(88%)`
- **Profil-Zeile:** `background: rgba(255,255,255,0.5)`, `border: 1px solid rgba(0,0,0,0.06)`

## App-Hintergrund

Kein Lime-Gradient im Light Mode:
```css
[data-theme="light"] .app { background: var(--bg); }
```

## Content & Karten

- **Content-Fläche:** `var(--bg)` = `#f2f2f7`
- **Karten:** `var(--surface)` = `#fff` mit `var(--shadow-1)`
- **Statistik-Boxen:** `background: rgba(0,0,0,0.03)`, `border: 1px solid rgba(0,0,0,0.04)`

## Topbar

```
background: rgba(255,255,255,0.85)
backdrop-filter: blur(16px)
border-bottom: 1px solid rgba(0,0,0,0.07)
```

## Status-Chips & Pills

Alle Light-Mode-Overrides nötig da Dark-Mode-Werte (hohe Helligkeit) auf Weiß unsichtbar:

```css
[data-theme="light"] .chip[data-tone="ok"]   { background: oklch(40% 0.18 155 / 0.1); }
[data-theme="light"] .chip[data-tone="warn"] { background: oklch(44% 0.16 70 / 0.1); }
[data-theme="light"] .chip[data-tone="bad"]  { background: oklch(48% 0.18 25 / 0.1); }
[data-theme="light"] .chip[data-tone="info"] { background: oklch(44% 0.15 235 / 0.1); }
[data-theme="light"] .tl-pill[data-tone="warn"] { background: oklch(44% 0.16 70 / 0.1); }
```

## Buttons

```css
.btn-primary { background: var(--accent); color: var(--accent-ink); }
/* → Light Mode: schwarz mit weißem Text */
/* → Dark Mode: Lime mit schwarzem Text */
```

## Was NICHT ändert

- Dark Mode bleibt vollständig unverändert
- Lime (`oklch(92% 0.2 125)`) nur im Dark Mode sichtbar
- App-Logo bleibt Lime in beiden Modi (Markenzeichen)
- Alle Komponenten-Farben (Lucide-Icons, Status-Dots) bleiben farbig

## Was bereits implementiert ist (aus Vorgänger-Commits)

- `[data-theme="light"] .app { background: var(--bg); }` ✓
- Light Mode accent near-black ✓
- Status-Farben Light-Mode-Overrides ✓
- Chip/Pill Light-Mode-Overrides ✓
- `corraPulse` Animation auf `var(--accent-glow)` ✓
- Invoice-Inputs auf `var(--accent)` ✓

## Was noch fehlt (Implementierungsaufgaben)

1. **`--bg` anpassen:** Aktuell `oklch(98% 0.003 90)` → soll `oklch(96% 0.002 270)` (neutrales System-Grau statt warmem Off-White)
2. **Sidebar-Hintergrund:** Noch hardcoded `background: linear-gradient(...)` in `.sidebar` — braucht Light-Mode-Override: `rgba(242,242,247,0.92)`
3. **Topbar Light-Mode:** Noch keine explizite Light-Mode-Behandlung
4. **`--shadow-1` und `--shadow-2`:** Korrekte Dark-on-Light-Versionen setzen
5. **`--fg`, `--fg-2`, `--fg-muted`, `--fg-dim`:** Aktuell leicht bläuliches Grau (`hue 270`) — soll zu neutralem Schwarz (`oklch(X% 0 0)`)
6. **Aktive Nav-Items:** Korrekte `rgba(255,255,255,0.7)` Background + Shadow
7. **Karten-Shadow:** Einheitliche `--shadow-1` Verwendung statt gemischter Inline-Werte
