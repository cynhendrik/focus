# Mail — Dashboard-Integration Design Spec
**Datum:** 2026-05-24  
**Status:** Approved  
**Scope:** Sub-Projekt C — Ungelesene E-Mails auf dem Dashboard + KommunikationPane-Fix

---

## 1. Ziel

Ein neues `DashboardEmailWidget` zeigt alle ungelesenen E-Mails als live Feed auf dem Dashboard.
Beim Klick öffnet sich die Mail-Route mit der E-Mail vorselektiert.
Außerdem wird ein bestehender Bug in `KommunikationPane` behoben (leere `useEffect`-Dependency).

---

## 2. Dateien (neu / geändert)

```
src/components/dashboard/DashboardEmailWidget.tsx   NEU — stateless Widget
src/routes/DashboardRoute.tsx                       +Widget, +loadEmails-Effect
src/components/customer/tabs/KommunikationPane.tsx  Fix: [customerId]-Dependency
```

**Kein neuer Rust-Code. Kein neuer Tauri-Command. Kein neuer Store-State.**

---

## 3. DashboardEmailWidget

### Props

```typescript
interface DashboardEmailWidgetProps {
  emails: EmailHeader[]          // bereits gefiltert: isRead === false, max 8, sortiert desc sentAt
  isLoading: boolean
  onEmailClick: (email: EmailHeader) => void
}
```

### Layout

Card mit `.card`-Klasse (padding 20), Header-Zeile:

```
Ungelesene E-Mails          [3]
```

- `[3]` = Badge mit Anzahl, `.chip`-Klasse, tone `"bad"` wenn > 0, sonst kein Badge
- Darunter Liste aus `client-row`-Zeilen (passt zu bestehenden CSS-Klassen):
  - **Avatar:** Initiale aus `email.fromName` (oder erstes Zeichen von `email.fromAddr`)
  - **Haupt-Text:** `email.subject` (fett, gekürzt mit `truncate`) + darunter `email.fromName || email.fromAddr`
  - **Rechts:** relative Zeitanzeige (`vor N Min.`, `vor N Std.`, `gestern`, Datum bei älter als 2 Tage)

### Zustände

| Zustand | Darstellung |
|---|---|
| `isLoading && emails.length === 0` | Kleiner Spinner, analog zu restlicher App |
| `!isLoading && emails.length === 0 && accountConfigured` | `empty`-Klasse: „Keine ungelesenen E-Mails ✓" |
| `!isLoading && !accountConfigured` | `empty`-Klasse: „Kein Mail-Konto verbunden" |
| `emails.length > 0` | Liste der E-Mails |

`accountConfigured` = `selectedAccountId !== null`

### Relative Zeitformatierung

```typescript
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  if (min < 1)   return 'gerade eben'
  if (min < 60)  return `vor ${min} Min.`
  if (hrs < 24)  return `vor ${hrs} Std.`
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
```

---

## 4. DashboardRoute — Änderungen

### Neue Imports + Store-Selektoren

```typescript
import { useMailStore } from '@/store/mail.store'
import { DashboardEmailWidget } from '@/components/dashboard/DashboardEmailWidget'
import type { EmailHeader } from '@/types/mail.types'

// in DashboardRoute():
const emails            = useMailStore(s => s.emails)
const loadEmails        = useMailStore(s => s.loadEmails)
const selectEmail       = useMailStore(s => s.selectEmail)
const isLoadingMails    = useMailStore(s => s.isLoading)
const selectedAccountId = useMailStore(s => s.selectedAccountId)
const setAppView        = useUiStore(s => s.setAppView)
```

### Neuer useEffect

```typescript
useEffect(() => {
  if (selectedAccountId && emails.length === 0) {
    loadEmails()
  }
}, [selectedAccountId])
```

### Unread-Berechnung

```typescript
const unreadEmails: EmailHeader[] = emails
  .filter(e => !e.isRead)
  .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  .slice(0, 8)
```

### Click-Handler

```typescript
function handleEmailClick(email: EmailHeader) {
  selectEmail(email)
  setAppView('mail')
}
```

### Widget-Einbindung

Das Widget erscheint **nach** der bestehenden `row` (Tagesplan + Aufmerksamkeit), als neuer vollbreiter Block:

```tsx
{/* Row: Tagesplan + Aufmerksamkeit */}
<div className="row">
  ...
</div>

{/* E-Mail Widget — unter der Row */}
<DashboardEmailWidget
  emails={unreadEmails}
  isLoading={isLoadingMails}
  onEmailClick={handleEmailClick}
/>
```

---

## 5. KommunikationPane — Fix

**Bug:** `useEffect` mit leerer Dependency-Liste lädt E-Mails nie neu wenn `customerId` sich ändert (User navigiert zwischen Kunden).

```typescript
// Vorher (Bug):
useEffect(() => {
  loadEmails()
}, [])

// Nachher (Fix):
useEffect(() => {
  loadEmails()
}, [customerId])
```

Kein weiterer Umbau. Die Komponente ist sonst korrekt.

---

## 6. Fehlerbehandlung

| Szenario | Verhalten |
|---|---|
| Keine E-Mails im Store (Mail nie geöffnet) | `useEffect` triggert `loadEmails()` → Widget zeigt Spinner → danach Ergebnis |
| Mail-Konto nicht eingerichtet (`selectedAccountId === null`) | Widget: leerer Zustand „Kein Mail-Konto verbunden" |
| Alle Mails gelesen | Widget: leerer Zustand „Keine ungelesenen E-Mails ✓" |
| Klick auf Mail | `selectEmail(email)` + `setAppView('mail')` → Mail-Route öffnet mit vorselektierter Mail |
| `loadEmails()` schlägt fehl | isLoading → false, leere Liste — kein Error-Banner (Mail-Modul zeigt Fehler separat) |

---

## 7. Out of Scope

- Neue E-Mail direkt aus dem Dashboard schreiben
- Unread-Badge auf dem Mail-Icon in der Sidebar
- Push-Benachrichtigungen für neue E-Mails
- E-Mails im Dashboard markieren / archivieren
- Alle Ordner durchsuchen (nur INBOX)

---

## 8. Dateistruktur

```
src/components/dashboard/DashboardEmailWidget.tsx   NEU
src/routes/DashboardRoute.tsx                       geändert
src/components/customer/tabs/KommunikationPane.tsx  geändert
```
