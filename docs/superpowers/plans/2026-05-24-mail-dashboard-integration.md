# Mail Dashboard-Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ungelesene E-Mails als live Widget auf dem Dashboard anzeigen + `useEffect`-Bug in `KommunikationPane` beheben.

**Architecture:** Neues stateless `DashboardEmailWidget` liest `EmailHeader[]` als Props, rendert mit bestehenden CSS-Klassen (`.card`, `.client-row`, `.avatar`). `DashboardRoute` selektiert aus `useMailStore`, berechnet `unreadEmails`, triggert `loadEmails()` on mount wenn leer. Klick: `selectEmail(email)` + `setAppView('mail')`. `KommunikationPane` erhält `[customerId]` als `useEffect`-Dependency.

**Tech Stack:** React 18, TypeScript, Zustand (`mail.store`, `ui.store`), bestehende CSS-Klassen in `src/styles/globals.css`

---

## Dateistruktur

```
src/components/dashboard/DashboardEmailWidget.tsx   NEU — stateless Widget (Props rein, Events raus)
src/routes/DashboardRoute.tsx                       MODIFY — store selectors, loadEmails effect, Widget
src/components/customer/tabs/KommunikationPane.tsx  MODIFY — useEffect dependency fix
```

---

### Task 1: DashboardEmailWidget — stateless Komponente

**Files:**
- Create: `src/components/dashboard/DashboardEmailWidget.tsx`

Das Widget kennt keine Store-Logik. Es bekommt alles als Props und feuert Callbacks.

Relevante CSS-Klassen aus `src/styles/globals.css`:
- `.card` — weißer/dunkler Hintergrund, Border, Border-Radius
- `.client-row` — Grid `32px 1fr auto auto`, Hover-Effekt, Cursor pointer
- `.avatar` — 30×30px, `border-radius: 10px`, Flex-Center
- `.client-name` — `font-size: 13.5px; font-weight: 500`
- `.client-meta` — `font-size: 11.5px; color: var(--fg-dim)`
- `.chip[data-tone="bad"]` — roter Badge
- `.empty` — zentrierter Leer-Zustand
- `.mono` — Monospace-Schrift (für Zeit-Anzeige)

- [ ] **Step 1: Datei anlegen**

Erstelle `src/components/dashboard/DashboardEmailWidget.tsx`:

```tsx
import type { EmailHeader } from '@/types/mail.types'

interface DashboardEmailWidgetProps {
  emails: EmailHeader[]   // bereits gefiltert (ungelesen), max 8, desc sentAt
  isLoading: boolean
  hasAccount: boolean     // false → "Kein Mail-Konto verbunden"
  onEmailClick: (email: EmailHeader) => void
}

function getInitials(name: string, addr: string): string {
  const src = name.trim() || addr
  return src
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  if (min < 1)   return 'gerade eben'
  if (min < 60)  return `vor ${min} Min.`
  if (hrs < 24)  return `vor ${hrs} Std.`
  const d         = new Date(iso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export function DashboardEmailWidget({
  emails,
  isLoading,
  hasAccount,
  onEmailClick,
}: DashboardEmailWidgetProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Ungelesene E-Mails</h2>
        {emails.length > 0 && (
          <span className="chip" data-tone="bad">{emails.length} ungelesen</span>
        )}
      </div>

      {/* Lade-Zustand */}
      {isLoading && emails.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {/* Kein Konto */}
      {!isLoading && !hasAccount && (
        <p className="empty" style={{ padding: '24px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Kein Mail-Konto verbunden
        </p>
      )}

      {/* Alle gelesen */}
      {!isLoading && hasAccount && emails.length === 0 && (
        <p className="empty" style={{ padding: '24px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Keine ungelesenen E-Mails ✓
        </p>
      )}

      {/* E-Mail-Liste */}
      {emails.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {emails.map(email => (
            <div
              key={email.id}
              className="client-row"
              onClick={() => onEmailClick(email)}
            >
              <div className="avatar">
                {getInitials(email.fromName, email.fromAddr)}
              </div>
              <div>
                <div className="client-name" style={{ fontWeight: 600 }}>
                  {email.subject || '(Kein Betreff)'}
                </div>
                <div className="client-meta">
                  {email.fromName || email.fromAddr}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                {formatRelativeTime(email.sentAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript-Check**

```bash
pnpm tsc --noEmit
```

Erwartet: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardEmailWidget.tsx
git commit -m "feat(dashboard): DashboardEmailWidget — stateless unread mail widget"
```

---

### Task 2: DashboardRoute — Widget einbinden

**Files:**
- Modify: `src/routes/DashboardRoute.tsx`

Aktueller Stand der Datei:
- Zeile 1: `import { useEffect } from 'react'` — bereits vorhanden
- Zeile 8: `import type { Customer } from '@/types/customer.types'` — letzter Import
- Zeile 66: `const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''` — letzter Selektor
- Zeile 67–69: bestehender `useEffect` für `loadKpis`
- Zeile 128–177: `<div className="row">` mit Tagesplan + Aufmerksamkeit — danach `</div>` schließt `main-inner`

- [ ] **Step 1: Imports ergänzen**

Nach Zeile 8 (`import type { Customer } from '@/types/customer.types'`) einfügen:

```typescript
import { useMailStore } from '@/store/mail.store'
import { DashboardEmailWidget } from '@/components/dashboard/DashboardEmailWidget'
import type { EmailHeader } from '@/types/mail.types'
```

- [ ] **Step 2: Store-Selektoren in `DashboardRoute()` hinzufügen**

Nach Zeile 65 (`const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''`) einfügen:

```typescript
const emails            = useMailStore(s => s.emails)
const loadEmails        = useMailStore(s => s.loadEmails)
const selectEmail       = useMailStore(s => s.selectEmail)
const isLoadingMails    = useMailStore(s => s.isLoading)
const selectedAccountId = useMailStore(s => s.selectedAccountId)
const setAppView        = useUiStore(s => s.setAppView)
```

- [ ] **Step 3: `useEffect` + Berechnungen hinzufügen**

Nach dem bestehenden `useEffect` für `loadKpis` (Zeilen 67–69) einfügen:

```typescript
useEffect(() => {
  if (selectedAccountId && emails.length === 0) {
    loadEmails()
  }
}, [selectedAccountId])

const unreadEmails: EmailHeader[] = emails
  .filter(e => !e.isRead)
  .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  .slice(0, 8)

function handleEmailClick(email: EmailHeader): void {
  selectEmail(email)
  setAppView('mail')
}
```

- [ ] **Step 4: Widget in JSX einbinden**

Nach dem schließenden `</div>` der `.row`-Div (Zeile 177, vor dem abschließenden `</div>` von `main-inner`) einfügen:

```tsx
<DashboardEmailWidget
  emails={unreadEmails}
  isLoading={isLoadingMails}
  hasAccount={selectedAccountId !== null}
  onEmailClick={handleEmailClick}
/>
```

Die vollständige `return`-Struktur am Ende sieht dann so aus:

```tsx
  {/* Row: Tagesplan + Aufmerksamkeit */}
  <div className="row">
    ...
  </div>

  {/* Ungelesene E-Mails Widget */}
  <DashboardEmailWidget
    emails={unreadEmails}
    isLoading={isLoadingMails}
    hasAccount={selectedAccountId !== null}
    onEmailClick={handleEmailClick}
  />
</div>  {/* main-inner */}
```

- [ ] **Step 5: TypeScript-Check**

```bash
pnpm tsc --noEmit
```

Erwartet: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/routes/DashboardRoute.tsx
git commit -m "feat(dashboard): ungelesene E-Mails Widget eingebunden"
```

---

### Task 3: KommunikationPane — useEffect-Bug beheben

**Files:**
- Modify: `src/components/customer/tabs/KommunikationPane.tsx`

**Bug:** `useEffect(() => { loadEmails() }, [])` mit leerer Dependency-Liste. Wenn der User zwischen zwei Kunden navigiert, bleibt die E-Mail-Liste des vorherigen Kunden stehen, weil der Effect nach dem ersten Render nie wieder feuert.

**Fix:** Dependency `customerId` hinzufügen → Effect feuert bei jedem Kundenwechsel neu.

- [ ] **Step 1: `useEffect`-Dependency ändern**

In `src/components/customer/tabs/KommunikationPane.tsx`, Zeilen 73–75, ersetze:

```typescript
  useEffect(() => {
    loadEmails()
  }, [])
```

durch:

```typescript
  useEffect(() => {
    loadEmails()
  }, [customerId])
```

- [ ] **Step 2: TypeScript-Check**

```bash
pnpm tsc --noEmit
```

Erwartet: keine Fehler. (ESLint könnte `react-hooks/exhaustive-deps` für `loadEmails` warnen — das ist akzeptabel, da `loadEmails` aus Zustand-Store kommt und stabil ist.)

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/tabs/KommunikationPane.tsx
git commit -m "fix(kommunikation): useEffect auf [customerId] — lädt Mails bei Kundenwechsel neu"
```

---

## Manuelle Verifikation (nach allen Tasks)

```bash
pnpm tauri dev
```

Checkliste:

| # | Szenario | Erwartet |
|---|---|---|
| 1 | Dashboard öffnen, Mail-Konto eingerichtet + ungelesene Mails | Widget zeigt Liste mit Absender, Betreff, relativer Zeit |
| 2 | Dashboard öffnen, Mail-Konto eingerichtet, alle Mails gelesen | Widget: „Keine ungelesenen E-Mails ✓" |
| 3 | Dashboard öffnen, kein Mail-Konto | Widget: „Kein Mail-Konto verbunden" |
| 4 | Klick auf E-Mail im Widget | Mail-Route öffnet, E-Mail vorselektiert |
| 5 | Dashboard öffnen ohne vorherigen Mail-Besuch | Widget zeigt kurz Spinner, lädt dann |
| 6 | KommunikationPane: Kunde A → Kunde B navigieren | E-Mail-Liste lädt neu für Kunde B |
