# Sunset Color Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die gesamte In-App-Farbwelt von Blau (`#3B6DF4`) + Aurora-Verlauf (Blau→Violett) auf die Sunset-Koralle umstellen — inkl. Splash-/Intro-Animation, Ambient-Hintergründe, KORA-Hero, Onboarding und Favicon.

**Architecture:** Die App ist überwiegend Token-getrieben (`--accent*` in `src/styles/globals.css`). Wir tauschen zuerst die Tokens (flippt ~80 % automatisch: `.btn-primary`, `.tab-indicator`, Nav, die meisten Komponenten), dann die hartkodierten Blautöne in `globals.css` (Ambient-Glows, KORA-Hero, Splash-Animation, Info-Chips), dann `onboarding.css`, dann die hartkodierten Werte in Komponenten (zwei wiederkehrende Muster + Einzelstellen), zuletzt das Favicon. Verifikation pro Task: `pnpm typecheck` clean + `pnpm test:run` grün (keine Tests prüfen Farbwerte → Suite bleibt grün) + finaler Build/Visual-Check.

**Tech Stack:** Vite + React + TypeScript, CSS Custom Properties (oklch + hex + rgb), Tauri.

## Global Constraints

- **Branch:** `feature/erechnung-2026-06-21` (Branding bereits darauf gemerged). Auf diesem weiterarbeiten.
- **bw-Style NICHT anfassen:** `[data-style="bw"]` (globals.css 174–195) ist bewusst monochrom (kein Blau) → unverändert lassen.
- **Keine Tests prüfen Farbwerte** (verifiziert): `pnpm test:run` muss durchweg grün bleiben; bricht eine Suite, ist es eine echte Regression, kein Farb-Assert.
- **Sunset-Ersetzungs-Kanon** (exakt so verwenden):
  | Rolle | ALT | NEU |
  |---|---|---|
  | Akzent solid | `#3B6DF4` | `#F2754F` |
  | Akzent-2 / Hover | `#2D5CDC` / `#2d5cdc` | `#E05F38` |
  | Akzent-Text (dark) | `#3B6DF4` | `#FF9576` |
  | Akzent-Text (light) | `#3B6DF4` | `#E05F38` |
  | Akzent als oklch (Alpha-Kontexte) | `56% 0.19 264` | `68% 0.16 41` |
  | Akzent als rgb (Alpha-Kontexte) | `59 109 244` | `242 117 79` |
  | Violett (Aurora) | `#8b5bff` | `#FF9576` |
  | Verlauf-Paar | `#5b8cff, #8b5bff` | `#FF7A59, #FFB07C` |
  | KORA-Hero blau | `91 140 255` | `255 122 89` |
  | KORA-Hero violett | `139 91 255` | `255 176 124` |
  | Info (dark) | `78% 0.13 235` | `72% 0.10 195` (Teal) |
  | Info (light) | `44% 0.15 235` | `45% 0.09 195` (Teal) |
  | Ambient-Glow blau | `92% 0.18 264` / `78% 0.13 235` | `80% 0.14 45` (warm) |
  | Splash-BG | `#3B6DF4 0%, #2d5cdc 100%` | `#262A31 0%, #14161A 100%` (Graphit) |

---

### Task 1: Token-Block in globals.css (Dark + Light) auf Sunset

**Files:**
- Modify: `src/styles/globals.css:54-64` (Dark-Root-Tokens), `:141-150` (Light-Tokens), `:68` + `:156` (Info-Token)

**Interfaces:**
- Produces: `--accent`, `--accent-2`, `--accent-soft`, `--accent-glow`, `--accent-text`, `--accent-violet`, `--accent-gradient`, `--nav-active-bg`, `--info` in Sunset-Werten. Alle nachgelagerten Tasks/Komponenten, die diese Tokens nutzen, ziehen automatisch nach.

- [ ] **Step 1: Dark-Root-Tokens ersetzen (globals.css 54–64)**

Ersetze den Block exakt:
```css
  --accent:      #F2754F;
  --accent-2:    #E05F38;
  --accent-soft: rgb(242 117 79 / 0.14);
  --accent-glow: rgb(242 117 79 / 0.50);
  --accent-ink:  oklch(98% 0 0);
  --accent-text: #FF9576;
  /* Sunset */
  --accent-violet:   #FF9576;
  --accent-gradient: linear-gradient(135deg, #FF7A59, #FFB07C);
  --card-shadow:     0 1px 2px rgb(0 0 0 / 0.25);
  --nav-active-bg:   linear-gradient(90deg, rgb(242 117 79 / 0.20), rgb(255 176 124 / 0.05));
```
(ersetzt Zeilen 54–64; `--accent-ink` und `--card-shadow` bleiben wertgleich.)

- [ ] **Step 2: Info-Token dark (globals.css 68)**

```css
  --info: oklch(72% 0.10 195);
```

- [ ] **Step 3: Light-Tokens ersetzen (globals.css 141–150)**

```css
  --accent:      #F2754F;
  --accent-2:    #E05F38;
  --accent-soft: rgb(242 117 79 / 0.10);
  --accent-glow: rgb(242 117 79 / 0.20);
  --accent-text: #E05F38;
  --accent-ink:  oklch(98% 0 0);
  --accent-violet:   #FF9E7D;
  --accent-gradient: linear-gradient(135deg, #FF7A59, #FFB07C);
  --card-shadow:     0 1px 2px rgb(40 50 90 / 0.05);
  --nav-active-bg:   linear-gradient(90deg, rgb(242 117 79 / 0.14), rgb(255 176 124 / 0.05));
```

- [ ] **Step 4: Info-Token light (globals.css 156)**

```css
  --info:   oklch(45% 0.09 195);
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` → keine Fehler.
Run: `pnpm test:run` → grün.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(brand): Sunset accent tokens (dark+light) ersetzen Blau/Aurora"
```

---

### Task 2: Hartkodierte Blautöne in globals.css (Ambient, KORA-Hero, Splash, Info-Chip)

**Files:**
- Modify: `src/styles/globals.css` Zeilen 267–269, 550–563, 977, 982, 1011, 1032, 1106–1119, 1699, 1709

**Interfaces:**
- Consumes: nichts. Produces: Sunset-gefärbte Ambient-Hintergründe, KORA-Hero-Karte, Splash-Animation, Info-Chips.

- [ ] **Step 1: Ambient-Hintergrund-Glows dark (267–269)**

Ersetze:
```css
    radial-gradient(1300px 700px at 75% -12%, oklch(80% 0.14 45 / 0.13), transparent 62%),
    radial-gradient(800px 240px at 50%  -6%, oklch(80% 0.14 45 / 0.07), transparent 70%),
    radial-gradient(900px  500px at -10% 100%, oklch(80% 0.12 55 / 0.07), transparent 60%),
```

- [ ] **Step 2: KORA-Hero-Karte (550–563)**

- 550: `background: linear-gradient(135deg, rgb(255 122 89 / 0.26), rgb(255 176 124 / 0.08) 70%);`
- 551: `border: 1px solid rgb(255 122 89 / 0.34);`
- 556: `background: radial-gradient(120px 60px at 18% 0%, rgb(255 176 124 / 0.18), transparent 70%);`
- 559: `transform: translateY(-1px); border-color: rgb(255 122 89 / 0.6);`
- 563: `border-color: rgb(255 122 89 / 0.7);`

- [ ] **Step 3: Info-Chip (977, 982)**

- 977: `.chip[data-tone="info"]   { background: oklch(72% 0.10 195 / 0.16); color: var(--info); }`
- 982: `[data-theme="light"] .chip[data-tone="info"] { background: oklch(45% 0.09 195 / 0.1); }`

- [ ] **Step 4: Splash-/Intro-Animation (1011, 1032, 1106–1119)**

- 1011: `background: radial-gradient(circle at 50% 45%, #262A31 0%, #14161A 100%);`
- 1032: `background: radial-gradient(circle, rgb(242 117 79 / 0.34), transparent 62%);`
- 1106: `background: #F2754F;`
- 1107: `box-shadow: 0 0 14px rgb(242 117 79 / 0.75);`
- 1118: `0%, 100% { transform: scale(1);   box-shadow: 0 0 14px rgb(242 117 79 / 0.75); }`
- 1119: `50%      { transform: scale(1.7); box-shadow: 0 0 28px rgb(242 117 79 / 0.55); }`

(Zeile 1036 `oklch(58% 0.10 70 / 0.28)` ist bereits warm-amber → **unverändert lassen**.)

- [ ] **Step 5: Ambient-Glows light (1699, 1709)**

- 1699: `radial-gradient(900px 650px at 100% 110%, oklch(80% 0.13 45 / 0.12), transparent 55%),`
- 1709: `radial-gradient(800px 500px at 90% 80%, oklch(80% 0.13 45 / 0.08), transparent 55%);`

- [ ] **Step 6: Verify**

Run: `pnpm typecheck` → keine Fehler.
Run: `pnpm test:run` → grün.
Sicherstellen, dass kein `264`, `91 140 255`, `139 91 255`, `59 109 244`, `#3B6DF4`, `#2d5cdc` mehr in `globals.css` steht **außer** im bw-Block (174–195, bleibt) und Zeile 1036 (amber):
Run: `grep -nE "3B6DF4|2d5cdc|91 140 255|139 91 255|59 109 244|0\.1[0-9] 264|0\.13 235|0\.15 235|0\.18 264" src/styles/globals.css` → **keine Treffer**.

- [ ] **Step 7: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(brand): Sunset für Ambient, KORA-Hero, Splash-Animation, Info-Chips"
```

---

### Task 3: onboarding.css auf Sunset

**Files:**
- Modify: `src/styles/onboarding.css` Zeilen 41, 48, 51, 73, 84, 87, 100, 108, 110, 113

**Interfaces:**
- Consumes: `--accent` (aus Task 1). Produces: Sunset-Onboarding (Pills, Progress-Bars, Company-Step).

- [ ] **Step 1: `#5b8cff`-Fallbacks → `#F2754F`**

Ersetze in allen Vorkommen `var(--accent, #5b8cff)` → `var(--accent, #F2754F)` (Zeilen 41, 48, 73, 87, 108, 110, 113) und `var(--accent-soft, rgba(91,140,255,0.14))` → `var(--accent-soft, rgba(242,117,79,0.14))` (Zeile 100).

- [ ] **Step 2: Progress-Bar-Verläufe (51, 84)**

- 51: `.onboarding-bar__fill { ... background: linear-gradient(90deg, #F2754F, #2FA36B); ... }`
- 84: `.onboarding-progress__fill { ... background: linear-gradient(90deg, #F2754F, #2FA39C); ... }`

(Der grüne/teal Endpunkt bleibt — Progress läuft Koralle → „fertig"-Grün/Teal.)

- [ ] **Step 3: Verify**

Run: `grep -nE "5b8cff|91 140 255|91,140,255" src/styles/onboarding.css` → **keine Treffer**.
Run: `pnpm test:run` → grün.

- [ ] **Step 4: Commit**

```bash
git add src/styles/onboarding.css
git commit -m "feat(brand): Sunset im Onboarding (Pills, Progress, Company-Step)"
```

---

### Task 4: Hartkodierte Blautöne in Komponenten

**Files:**
- Modify: `src/App.tsx:223`, `src/core/auth/LoginScreen.tsx:6`, `src/components/settings/AussehensSettings.tsx:31,34,36`
- Modify (Muster `56% 0.19 264` → `68% 0.16 41`): `src/routes/FinanceRoute.tsx`, `src/components/finance/InvoiceForm.tsx`, `src/components/layout/ZeitPanel.tsx`, `src/routes/ZeitmanagementRoute.tsx`, `src/components/ui/DownloadToast.tsx`, `src/components/ui/UpdateBanner.tsx`, `src/components/global/GlobalQuickComposer.tsx`, `src/components/customer/InsightsStrip.tsx`, `src/components/settings/WorkspaceSettings.tsx`, `src/routes/DashboardRoute.tsx:631`
- Modify (Muster `78% 0.13 235` → `72% 0.10 195`): `src/routes/DashboardRoute.tsx:554`, `src/components/dashboard/DayTimeline.tsx:236`

**Interfaces:**
- Consumes: nichts. Produces: keine hartkodierten Blautöne mehr in Komponenten.

- [ ] **Step 1: Wiederkehrendes Akzent-Muster ersetzen**

In allen oben unter „Muster `56% 0.19 264`" gelisteten Dateien: jede Teilzeichenkette `56% 0.19 264` → `68% 0.16 41` (Alpha-Suffixe wie `/ 0.12`, `/ 0.2`, `/ 0.35` etc. bleiben unverändert dahinter).

- [ ] **Step 2: Info-Blau-Muster ersetzen**

`src/routes/DashboardRoute.tsx:554` und `src/components/dashboard/DayTimeline.tsx:236`: `78% 0.13 235` → `72% 0.10 195` (Alpha-Suffix bleibt).

- [ ] **Step 3: Einzelstellen `#3B6DF4`**

- `src/App.tsx:223`: `background: '#3B6DF4'` → `background: '#14161A'` (Graphit-Flash beim Auth-Laden, passt zur Splash).
- `src/core/auth/LoginScreen.tsx:6`: `const BLUE   = '#3B6DF4'` → `const BLUE   = '#F2754F'`.
- `src/components/settings/AussehensSettings.tsx:31`: `accent: '#3B6DF4',` → `accent: '#F2754F',`
- `src/components/settings/AussehensSettings.tsx:34`: `background: '#3B6DF4'` → `background: '#F2754F'`
- `src/components/settings/AussehensSettings.tsx:36`: `background: '#3B6DF4'` → `background: '#F2754F'`

- [ ] **Step 4: Verify**

Run: `grep -rnE "3B6DF4|56% 0\.19 264|78% 0\.13 235|0\.13 235|0\.15 235" src --include=*.tsx` → **keine Treffer** (außer ggf. `--info`-Nutzung via Token, die ist ok).
Run: `pnpm typecheck` → keine Fehler.
Run: `pnpm test:run` → grün.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/core/auth/LoginScreen.tsx src/components/settings/AussehensSettings.tsx src/routes/FinanceRoute.tsx src/components/finance/InvoiceForm.tsx src/components/layout/ZeitPanel.tsx src/routes/ZeitmanagementRoute.tsx src/components/ui/DownloadToast.tsx src/components/ui/UpdateBanner.tsx src/components/global/GlobalQuickComposer.tsx src/components/customer/InsightsStrip.tsx src/components/settings/WorkspaceSettings.tsx src/routes/DashboardRoute.tsx src/components/dashboard/DayTimeline.tsx
git commit -m "feat(brand): Sunset in Komponenten (Akzent-/Info-Hartwerte raus)"
```

---

### Task 5: Favicon auf Sunset + finaler Verify-Durchlauf

**Files:**
- Modify: `public/favicon.svg`

**Interfaces:**
- Consumes: `branding/cultera-icon.svg` (vorhandener Master). Produces: Sunset-Favicon.

- [ ] **Step 1: favicon.svg durch den Sunset-Master ersetzen**

```bash
cp branding/cultera-icon.svg public/favicon.svg
```

- [ ] **Step 2: Voll-Verify**

Run: `pnpm typecheck` → keine Fehler.
Run: `pnpm test:run` → grün (alle Suites).
Run: `pnpm build` → erfolgreich (tsc + vite).
Globaler Rest-Check:
Run: `grep -rnE "3B6DF4|5b8cff|8b5bff|56% 0\.19 264|91 140 255|139 91 255|59 109 244" src public --include=*.tsx --include=*.ts --include=*.css --include=*.svg` → nur noch erlaubte Reste (bw-Block in globals.css, sonst nichts).

- [ ] **Step 3: Visueller Check**

App starten (`pnpm tauri dev` oder `pnpm dev`) und prüfen: Splash-Screen graphit+koralle, Sidebar-Aktiv koralle, Buttons koralle, KORA-Hero koralle, Dashboard-Kennzahlen koralle, Finance-Charts koralle, Onboarding koralle, kein Blau mehr (außer bewusst neutralem Graphit). Dark + Light testen.

- [ ] **Step 4: Commit**

```bash
git add public/favicon.svg
git commit -m "feat(brand): Sunset-Favicon + finaler Migrations-Check"
```
