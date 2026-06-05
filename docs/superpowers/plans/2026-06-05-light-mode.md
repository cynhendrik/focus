# Light Mode Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light Mode auf Apple-like macOS Translucent Design bringen — neutrales Schwarz/Weiß/Grau, kein Lime sichtbar, klare Tiefe durch Sidebar-Transluzenz und Karten auf grauem Hintergrund.

**Architecture:** Reine CSS-Änderungen in `globals.css`. Task 1 ersetzt den `[data-theme="light"]` Variablen-Block komplett. Task 2 fügt komponentenspezifische Light-Mode-Overrides für Sidebar und Topbar hinzu. Kein TSX angefasst.

**Tech Stack:** CSS (oklch, backdrop-filter), keine Libraries

---

## File Map

| Datei | Was passiert |
|---|---|
| `src/styles/globals.css` | Task 1: `[data-theme="light"]` Block ersetzen; Task 2: Sidebar + Topbar Overrides hinzufügen |

---

## Task 1: CSS-Variablen — `[data-theme="light"]` Block komplett ersetzen

**Files:**
- Modify: `src/styles/globals.css` (Zeilen 111–145)

### Kontext

Der aktuelle Block verwendet `hue: 90` (warmes Off-White) für alle Hintergründe und leicht bläuliches Grau (`hue: 270` mit Chroma) für Text. Beides ist subtil falsch — neutrales macOS-Grau braucht `hue: 270` mit minimalem Chroma für Hintergründe und pures Schwarz (`chroma: 0`) für Text. Außerdem muss `--surface-2` auf Weiß gesetzt werden, damit aktive Nav-Items (weiß) auf dem grauen Sidebar-Hintergrund klar hervorstechen.

- [ ] **Schritt 1: Den gesamten `[data-theme="light"]` Block lesen**

Öffne `src/styles/globals.css` und lies Zeile 111–145. Verifiziere dass der Block so aussieht:

```css
[data-theme="light"] {
  --bg: oklch(98% 0.003 90);
  --bg-2: oklch(96% 0.004 90);
  --surface: oklch(100% 0 0);
  --surface-2: oklch(97% 0.004 90);
  ...
}
```

- [ ] **Schritt 2: Block komplett ersetzen**

Ersetze den gesamten `[data-theme="light"] { ... }` Block (Zeilen 111–145) mit:

```css
[data-theme="light"] {
  /* Hintergründe — neutrales macOS-Grau (#f2f2f7), kein warmes Off-White */
  --bg:        oklch(96% 0.002 270);
  --bg-2:      oklch(94% 0.003 270);
  --surface:   oklch(100% 0 0);
  --surface-2: oklch(100% 0 0);
  --surface-3: oklch(96% 0.002 270);

  /* Borders */
  --border:        oklch(88% 0.003 270);
  --border-strong: oklch(78% 0.004 270);

  /* Text — neutrales Schwarz, kein Blau-Stich */
  --fg:       oklch(12% 0 0);
  --fg-2:     oklch(23% 0 0);
  --fg-muted: oklch(40% 0 0);
  --fg-dim:   oklch(56% 0 0);

  /* Accent = near-black, kein Lime */
  --accent:      oklch(14% 0 0);
  --accent-2:    oklch(24% 0 0);
  --accent-soft: oklch(14% 0 0 / 0.07);
  --accent-glow: oklch(14% 0 0 / 0.12);
  --accent-text: oklch(14% 0 0);
  --accent-ink:  oklch(98% 0 0);

  /* Status-Farben — dunkel für Weiß-Hintergrund */
  --danger: oklch(48% 0.18 25);
  --warn:   oklch(44% 0.16 70);
  --ok:     oklch(40% 0.18 155);
  --info:   oklch(44% 0.15 235);

  /* Schatten — dark-on-light */
  --shadow-1: 0 1px 0 oklch(100% 0 0 / 0.9) inset, 0 0 0 1px oklch(0% 0 0 / 0.06);
  --shadow-2: 0 4px 16px oklch(0% 0 0 / 0.08), 0 0 0 1px oklch(0% 0 0 / 0.05);
  --shadow-glass: 0 1px 0 oklch(100% 0 0 / 0.9) inset, 0 0 0 1px oklch(0% 0 0 / 0.06), 0 24px 64px oklch(0% 0 0 / 0.14);

  /* Backward-compat aliases */
  --text: var(--fg);
  --text2: var(--fg-muted);
  --text3: var(--fg-dim);
  --bg1: var(--surface);
  --bg2: var(--surface-2);
  --bg3: var(--surface-3);
}
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
pnpm typecheck
```

Erwartetes Ergebnis: Keine neuen Fehler (nur pre-existing Tiptap-Fehler).

---

## Task 2: Sidebar + Topbar Light-Mode-Overrides

**Files:**
- Modify: `src/styles/globals.css` (nach dem `.app` Light-Mode-Override, ca. Zeile 212)

### Kontext

`.sidebar` hat aktuell `background: linear-gradient(180deg, oklch(100% 0 0 / 0.015), transparent 30%)` — dieser dunkle Gradient ist fast unsichtbar im Dark Mode und macht die Sidebar transparent im Light Mode (sieht dann wie der Content-Background aus). Wir brauchen einen expliziten Light-Mode-Override.

`.topbar` verwendet `background: linear-gradient(180deg, var(--bg) 60%, oklch(0% 0 0 / 0) 100%)` — der Gradient von `--bg` zu `oklch(0% 0 0 / 0)` (transparent schwarz) ist im Dark Mode ein schöner Fade. Im Light Mode wollen wir stattdessen ein weißliches transluzentes Panel.

- [ ] **Schritt 1: Nach der Zeile `[data-theme="light"] .app { background: var(--bg); }` suchen**

Diese Zeile steht ca. bei Zeile 212 (nach dem `.app { ... }` Block). Direkt danach einfügen:

```css
[data-theme="light"] .sidebar {
  background: rgba(242, 242, 247, 0.92);
  backdrop-filter: blur(24px);
}

[data-theme="light"] .topbar {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
}
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
pnpm typecheck
```

Erwartetes Ergebnis: Keine neuen Fehler.

- [ ] **Schritt 3: App starten und Light Mode visuell prüfen**

```bash
pnpm dev
```

In der App in den Light Mode wechseln (Theme-Toggle oder System-Setting). Prüfen:

- [ ] Sidebar: leicht grau/transluzent — NICHT weiß wie Content
- [ ] Content-Hintergrund: grau (`#f2f2f7`), Karten liegen weiß darauf
- [ ] Aktive Nav-Items: weißer Hintergrund auf grauem Sidebar → klar sichtbar
- [ ] Aktiv-Indikator (3px Linie links): dunkelgrau/schwarz — kein Lime
- [ ] CORRA-Icon: schwarz — kein Lime
- [ ] Badge (z.B. Posteingang): schwarzer Hintergrund, weißer Text
- [ ] Topbar: leicht weißlich transluzent, subtile untere Border
- [ ] Buttons: schwarz mit weißem Text
- [ ] Status-Chips: gedämpfte Farben (dunkles Amber, dunkles Rot etc.)
- [ ] Kein Lime-Gradient im App-Hintergrund sichtbar

---

## Task 3: Commit

**Files:** `src/styles/globals.css`

- [ ] **Schritt 1: Stagen**

```bash
git add src/styles/globals.css
```

- [ ] **Schritt 2: Commit**

```bash
git commit -m "design(light-mode): macOS Translucent — neutrales Grau, transluzente Sidebar, kein Lime"
```

Erwartetes Ergebnis: Commit erfolgreich.
