# Phase 1 — Vertrauen + Präsenz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die drei offenen Lücken aus Phase 1 der "Vorbereiteter Schreibtisch"-Spec schließen: Tray-Badge verdrahten, Sync-Pending sichtbar machen, drei stille Fehler im Mahnwesen/Firmenprofil fixen.

**Architektur:** Sechs kleine, unabhängig testbare Änderungen an bestehenden Dateien. Keine neuen Stores, keine neue Datenbank-Tabelle — reine Verdrahtung von bereits vorhandenen Daten/Commands plus additives Logging/Toast.

**Tech Stack:** React + TypeScript (Vitest + Testing Library), Zustand, Tauri (`@tauri-apps/api/core` `invoke`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-vertrauen-praesenz-phase1-design.md`
- Alle neuen/geänderten Log-Aufrufe nutzen `log.warn(message, ctx)` aus `src/lib/logger.ts` (nie `console.warn` direkt).
- Kein Verhalten ändert sich außer: Fehler werden jetzt geloggt/als Warnung zurückgegeben/als Toast angezeigt. Bestehende Fallback-Logik bleibt identisch.
- Jede Task endet mit grünen Tests (`npm run test:run`) für die betroffene Datei und einem Commit.

---

### Task 1: `computeOpenCount()` — geteilte Badge-Zahl + NavSidebar-Umstellung

**Files:**
- Modify: `src/lib/heute/due.ts`
- Modify: `src/lib/heute/due.test.ts`
- Modify: `src/components/layout/NavSidebar.tsx:92`

**Interfaces:**
- Produces: `computeOpenCount(overdueCount: number, unreadMails: number, todayTodos: number): number` — reine Summenfunktion, exportiert aus `src/lib/heute/due.ts`. Wird von Task 2 (`useTrayBadge`) importiert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/lib/heute/due.test.ts` ergänzen (neues `describe`-Block ans Dateiende):

```ts
describe('computeOpenCount', () => {
  it('summiert ueberfaellige Rechnungen, ungelesene Mails und Heute-Todos', () => {
    expect(computeOpenCount(2, 3, 1)).toBe(6)
  })
  it('ist 0 wenn alles leer ist', () => {
    expect(computeOpenCount(0, 0, 0)).toBe(0)
  })
})
```

Import-Zeile am Dateianfang erweitern: `import { isTodoForToday, computeOpenCount } from './due'`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/lib/heute/due.test.ts`
Expected: FAIL — `computeOpenCount is not a function` / Import-Fehler.

- [ ] **Step 3: Funktion implementieren**

In `src/lib/heute/due.ts` ans Dateiende anfügen:

```ts
/** Gesamtzahl offener Punkte fuer Tray-Badge und Sidebar — EINE Quelle fuer beide. */
export function computeOpenCount(overdueCount: number, unreadMails: number, todayTodos: number): number {
  return overdueCount + unreadMails + todayTodos
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/lib/heute/due.test.ts`
Expected: PASS (alle Tests inkl. neuer `computeOpenCount`-Tests).

- [ ] **Step 5: NavSidebar auf die geteilte Funktion umstellen**

In `src/components/layout/NavSidebar.tsx`:
- Import ergänzen: `import { computeOpenCount } from '@/lib/heute/due'`
- Zeile 92 ersetzen:

Vorher:
```ts
  const corraBadge  = overdueCount + unreadMails + todayTodos || undefined
```

Nachher:
```ts
  const corraBadge  = computeOpenCount(overdueCount, unreadMails, todayTodos) || undefined
```

- [ ] **Step 6: Gesamten Test-Suite-Lauf + Typecheck verifizieren**

Run: `npm run test:run` und `npm run typecheck`
Expected: beide grün, keine Regression (NavSidebar hat kein eigenes Testfile — Verhalten unverändert, nur eine Quelle).

- [ ] **Step 7: Commit**

```bash
git add src/lib/heute/due.ts src/lib/heute/due.test.ts src/components/layout/NavSidebar.tsx
git commit -m "refactor(heute): computeOpenCount als geteilte Quelle fuer Sidebar-Badge"
```

---

### Task 2: Tray-Badge verdrahten

**Files:**
- Create: `src/hooks/useTrayBadge.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `computeOpenCount(overdueCount, unreadMails, todayTodos)` aus Task 1; Tauri-Command `cmd_update_tray_status(app, open_count: u32)` (bereits vorhanden, `src-tauri/src/main.rs:42-52`, erwartet den Parameter `openCount` beim `invoke`-Aufruf, da Tauri Snake→Camel automatisch mappt).
- Produces: Hook `useTrayBadge(): void`, gemountet in `App.tsx` neben `useMoneyEvents()`.

- [ ] **Step 1: Hook schreiben**

`src/hooks/useTrayBadge.ts` (neu):

```ts
import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useTodosStore } from '@/store/todos.store'
import { invoiceCategory } from '@/lib/finance/invoice-filters'
import { computeOpenCount } from '@/lib/heute/due'

/**
 * Haelt den Tray-Tooltip synchron mit der Anzahl offener Punkte
 * (dieselbe Zahl wie das Sidebar-Badge). Reine Verdrahtung, kein
 * eigener State — cmd_update_tray_status existierte bereits, wurde
 * bisher nie aufgerufen.
 */
export function useTrayBadge() {
  const overdueCount = useFinanceStore(s =>
    s.invoices.filter(i => !i.isSuggestion && invoiceCategory(i) === 'overdue').length
  )
  const unreadMails = useMailStore(s => s.emails.filter(e => !e.isRead).length)
  const todayTodos = useTodosStore(s =>
    s.allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length
  )

  useEffect(() => {
    const openCount = computeOpenCount(overdueCount, unreadMails, todayTodos)
    void invoke('cmd_update_tray_status', { openCount }).catch(() => {})
  }, [overdueCount, unreadMails, todayTodos])
}
```

Hinweis: `.catch(() => {})` bewusst still — der Tray-Tooltip ist rein kosmetisch, ein Fehlschlag (z. B. kein Tray auf der Plattform) darf die App nicht stören. Kein Fall der Vertrauens-Schicht (kein Datenverlust, kein „stilles Degradieren" einer Nutzeraktion).

- [ ] **Step 2: Hook in App.tsx mounten**

In `src/App.tsx` Import ergänzen (bei den anderen Hook-Importen, z. B. neben `useMoneyEvents`):

```ts
import { useTrayBadge } from '@/hooks/useTrayBadge'
```

Zeile 229 (`useMoneyEvents()`), direkt danach ergänzen:

```ts
  useMoneyEvents()
  useTrayBadge()
```

- [ ] **Step 3: Typecheck + volle Test-Suite laufen lassen**

Run: `npm run typecheck && npm run test:run`
Expected: beide grün. (Kein dedizierter Hook-Test — `useMoneyEvents`, das identische Wiring-Muster, hat ebenfalls keinen; reine Store→invoke-Verdrahtung wird hier nicht unit-getestet, siehe bestehende Konvention.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTrayBadge.ts src/App.tsx
git commit -m "feat(tray): Tray-Tooltip mit Anzahl offener Punkte verdrahten"
```

---

### Task 3: Sync-Pending im UI sichtbar machen

**Files:**
- Modify: `src/components/layout/SyncStatusChip.tsx`
- Modify: `src/components/layout/SyncStatusChip.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceStore(s => s.pendingCount)` (bereits vorhanden, wird schon von `useSyncBridge.ts` befüllt).

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/components/layout/SyncStatusChip.test.tsx`, neuen Test in die bestehende `describe('SyncStatusChip', ...)`-Gruppe einfügen (vor der letzten schließenden Klammer, nach dem `'rendert nichts im lokalen Workspace'`-Test):

```ts
  it('zeigt einen ruhigen Zustand fuer wartende, noch nicht fehlgeschlagene Aenderungen', () => {
    useWorkspaceStore.setState({ failedCount: 0, pendingCount: 4 } as never)
    render(<SyncStatusChip />)
    expect(screen.getByText('Synchronisiert …')).toBeInTheDocument()
    expect(screen.queryByText('Sync-Fehler')).not.toBeInTheDocument()
  })

  it('rendert nichts wenn weder Fehler noch wartende Aenderungen vorliegen', () => {
    useWorkspaceStore.setState({ failedCount: 0, pendingCount: 0 } as never)
    const { container } = render(<SyncStatusChip />)
    expect(container.firstChild).toBeNull()
  })
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/components/layout/SyncStatusChip.test.tsx`
Expected: FAIL — Text „Synchronisiert …" nicht gefunden (Komponente rendert aktuell `null`, weil `failedCount === 0` sofort abbricht).

- [ ] **Step 3: Komponente erweitern**

`src/components/layout/SyncStatusChip.tsx` — die frühe Return-Bedingung und das Markup anpassen:

Vorher (Zeile 13-18):
```ts
export function SyncStatusChip() {
  const failedCount = useWorkspaceStore(s => s.failedCount)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const [busy, setBusy] = useState(false)

  if (!isShared || failedCount === 0) return null
```

Nachher:
```ts
export function SyncStatusChip() {
  const failedCount = useWorkspaceStore(s => s.failedCount)
  const pendingCount = useWorkspaceStore(s => s.pendingCount)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const [busy, setBusy] = useState(false)

  if (!isShared || (failedCount === 0 && pendingCount === 0)) return null

  if (failedCount === 0) {
    return (
      <div
        className="nav-item"
        data-active="false"
        data-label="Sync-Pending"
        title={`${pendingCount} Änderungen werden übertragen`}
      >
        <RefreshCw size={18} strokeWidth={1.75} />
        <span className="nav-item__label">Synchronisiert …</span>
      </div>
    )
  }
```

Der restliche Rückgabewert (der bestehende `<button>` mit `CloudOff`/„Sync-Fehler") bleibt unverändert darunter stehen — er wird jetzt nur erreicht, wenn `failedCount > 0`.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/components/layout/SyncStatusChip.test.tsx`
Expected: PASS, alle 5 Tests (3 bestehende + 2 neue).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SyncStatusChip.tsx src/components/layout/SyncStatusChip.test.tsx
git commit -m "feat(sync): wartende Aenderungen sichtbar machen, nicht nur Fehlschlaege"
```

---

### Task 4: Mahnwesen — Kontakt-Lookup-Fehlschlag loggen

**Files:**
- Modify: `src/services/dunning.service.ts:179`
- Modify: `src/services/dunning.service.test.ts`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/services/dunning.service.test.ts`, neuen Test in `describe('prepareReminder: Template statt KI', ...)` ergänzen (oder eigene neue `describe`-Gruppe direkt danach):

```ts
describe('prepareReminder: Kontakt-Lookup-Fehler', () => {
  it('loggt eine Warnung wenn der Kontakt-Lookup fehlschlaegt, faellt aber auf Konto-E-Mail zurueck', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { ContactsGateway } = await import('@/data/contacts.gateway')
    const { log } = await import('@/lib/logger')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer GmbH', email: 'info@meyer.de' }] } as never)
    vi.mocked(ContactsGateway.getByAccount).mockRejectedValueOnce(new Error('db timeout'))
    const warnSpy = vi.spyOn(log, 'warn')

    const invoice = { id: 'inv1', accountId: 'acc1', number: 'R-1', dueDate: '2026-06-01', total: 100, status: 'overdue' } as never
    const result = await prepareReminder(invoice, 0)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.to).toEqual(['info@meyer.de'])
    expect(warnSpy).toHaveBeenCalledWith(
      'contact lookup failed, falling back to account email',
      expect.objectContaining({ invoiceId: 'inv1' })
    )
    warnSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/services/dunning.service.test.ts`
Expected: FAIL — `warnSpy` wurde nicht mit dieser Nachricht aufgerufen (aktuell wird der Fehler komplett verschluckt).

- [ ] **Step 3: Fix implementieren**

In `src/services/dunning.service.ts`, Zeile 179:

Vorher:
```ts
    const contacts = await ContactsGateway.getByAccount(invoice.accountId).catch(() => [])
```

Nachher:
```ts
    const contacts = await ContactsGateway.getByAccount(invoice.accountId).catch((err) => {
      log.warn('contact lookup failed, falling back to account email', { invoiceId: invoice.id, err })
      return []
    })
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/services/dunning.service.test.ts`
Expected: PASS, alle Tests inkl. des neuen.

- [ ] **Step 5: Commit**

```bash
git add src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "fix(dunning): Kontakt-Lookup-Fehlschlag loggen statt still verschlucken"
```

---

### Task 5: Mahnwesen — Protokollbuch-Fehler als Warnung zurückgeben

**Files:**
- Modify: `src/services/dunning.service.ts:257-269`
- Modify: `src/services/dunning.service.test.ts`

**Interfaces:**
- `DunningSendResult` (bereits definiert, Zeile 155) hat bereits ein optionales `warning?: string` — wird hier für einen zweiten Fall genutzt, keine Typänderung nötig.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/services/dunning.service.test.ts` neue `describe`-Gruppe ergänzen:

```ts
describe('sendReminder: Protokollbuch-Fehler', () => {
  it('gibt eine Warnung zurueck wenn die Aktivitaet nicht protokolliert werden konnte, Versand zaehlt trotzdem als ok', async () => {
    const { sendReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { MailService } = await import('@/services/mail.service')
    const { ActivitiesGateway } = await import('@/data/activities.gateway')
    const { ContactsGateway } = await import('@/data/contacts.gateway')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [] } as never) // kein PDF-Block noetig
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValueOnce([{ email: 'x@y.de' }] as never)
    vi.spyOn(MailService, 'sendEmail').mockResolvedValueOnce(undefined as never)
    vi.spyOn(ActivitiesGateway, 'create').mockRejectedValueOnce(new Error('offline'))

    const invoice = { id: 'inv1', accountId: 'accX', number: 'R-1', dueDate: '2026-06-01', total: 100, status: 'overdue' } as never
    const result = await sendReminder(invoice, 0)

    expect(result.ok).toBe(true)
    expect(result.warning).toBe('Mahnung gesendet, aber nicht im Kundenverlauf protokolliert.')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/services/dunning.service.test.ts`
Expected: FAIL — `result.warning` ist `undefined` (aktuell wird der Fehler nur geloggt, die Funktion gibt trotzdem `{ ok: true }` ohne `warning` zurück).

- [ ] **Step 3: Fix implementieren**

In `src/services/dunning.service.ts`, Zeilen 257-271:

Vorher:
```ts
  // Protokollbuch: Der Versand ist am Kunden nachlesbar (was, wann, an wen).
  try {
    await ActivitiesGateway.create({
      workspaceId: useWorkspaceStore.getState().getActiveWorkspaceId() ?? '',
      createdBy: useAuthStore.getState().user?.id ?? '',
      accountId: invoice.accountId,
      type: 'note',
      title: `${levelLabel(level)} versendet · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)}`,
      body: `Per E-Mail an ${prep.data.to.join(', ')} — mit Rechnungs-PDF.`,
    })
  } catch (protoErr) {
    log.warn('reminder protocol activity failed', { invoiceId: invoice.id, protoErr })
  }
  return { invoiceId: invoice.id, ok: true }
}
```

Nachher:
```ts
  // Protokollbuch: Der Versand ist am Kunden nachlesbar (was, wann, an wen).
  try {
    await ActivitiesGateway.create({
      workspaceId: useWorkspaceStore.getState().getActiveWorkspaceId() ?? '',
      createdBy: useAuthStore.getState().user?.id ?? '',
      accountId: invoice.accountId,
      type: 'note',
      title: `${levelLabel(level)} versendet · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)}`,
      body: `Per E-Mail an ${prep.data.to.join(', ')} — mit Rechnungs-PDF.`,
    })
  } catch (protoErr) {
    log.warn('reminder protocol activity failed', { invoiceId: invoice.id, protoErr })
    return { invoiceId: invoice.id, ok: true, warning: 'Mahnung gesendet, aber nicht im Kundenverlauf protokolliert.' }
  }
  return { invoiceId: invoice.id, ok: true }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/services/dunning.service.test.ts`
Expected: PASS, alle Tests inkl. des neuen.

- [ ] **Step 5: Commit**

```bash
git add src/services/dunning.service.ts src/services/dunning.service.test.ts
git commit -m "fix(dunning): Protokollbuch-Fehlschlag als Warnung im Ergebnis melden"
```

---

### Task 6: Firmenprofil — korruptes JSON sichtbar machen

**Files:**
- Modify: `src/services/company.service.ts`
- Create: `src/services/company.service.test.ts`

**Interfaces:**
- Consumes: `toastError(message: string)` aus `src/store/toast.store.ts` (bereits vorhanden).

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/services/company.service.test.ts` (neu):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { log } from '@/lib/logger'
import { useToastStore } from '@/store/toast.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('CompanyService.get: korruptes JSON', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('loggt eine Warnung mit Feldname und zeigt einen Fehler-Toast, faellt aber auf {} zurueck', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 'c1', profile: '{kaputt', modules: '{}', crmConfig: '{}', updatedAt: '2026-01-01',
    })
    const warnSpy = vi.spyOn(log, 'warn')

    const { CompanyService } = await import('./company.service')
    const result = await CompanyService.get()

    expect(result.profile).toEqual({})
    expect(warnSpy).toHaveBeenCalledWith(
      'company settings field corrupt, using fallback',
      expect.objectContaining({ field: 'profile' })
    )
    expect(useToastStore.getState().toasts[0]?.variant).toBe('error')
    warnSpy.mockRestore()
  })

  it('bleibt still wenn alle Felder valides JSON sind', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 'c1', profile: '{}', modules: '{}', crmConfig: '{}', updatedAt: '2026-01-01',
    })
    const { CompanyService } = await import('./company.service')
    await CompanyService.get()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/services/company.service.test.ts`
Expected: FAIL — `warnSpy` nicht aufgerufen, kein Toast (aktuell verschluckt `tryParse` den Fehler komplett).

- [ ] **Step 3: Fix implementieren**

`src/services/company.service.ts` komplett ersetzen durch:

```ts
import { invoke } from '@tauri-apps/api/core'
import type { UpdateCompanyPayload } from '@/types/company.types'
import { log } from '@/lib/logger'
import { toastError } from '@/store/toast.store'

interface RawCompanySettings {
  id: string
  profile: string
  modules: string
  crmConfig: string
  updatedAt: string
}

export const CompanyService = {
  async get() {
    const raw = await invoke<RawCompanySettings>('get_company_settings')
    return parse(raw)
  },
  async update(payload: UpdateCompanyPayload) {
    const raw = await invoke<RawCompanySettings>('update_company_settings', { payload })
    return parse(raw)
  },
}

function parse(raw: RawCompanySettings) {
  return {
    id: raw.id,
    profile: tryParse(raw.profile, {}, 'profile'),
    modules: tryParse(raw.modules, {}, 'modules'),
    crmConfig: tryParse(raw.crmConfig, {}, 'crmConfig'),
    updatedAt: raw.updatedAt,
  }
}

function tryParse(json: string, fallback: unknown, fieldName: string) {
  try {
    return JSON.parse(json)
  } catch {
    log.warn('company settings field corrupt, using fallback', { field: fieldName })
    toastError(`Firmendaten (${fieldName}) beschädigt — bitte in den Einstellungen prüfen.`)
    return fallback
  }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/services/company.service.test.ts`
Expected: PASS, beide Tests.

- [ ] **Step 5: Gesamten Test-Suite-Lauf + Typecheck verifizieren**

Run: `npm run test:run && npm run typecheck`
Expected: beide grün — insbesondere prüfen, dass kein anderer Aufrufer von `parse`/`tryParse` durch die neue Signatur bricht (es gibt keine externen Aufrufer, beide Funktionen sind modul-privat).

- [ ] **Step 6: Commit**

```bash
git add src/services/company.service.ts src/services/company.service.test.ts
git commit -m "fix(company): korruptes Firmenprofil-JSON loggen und per Toast melden"
```

---

## Abschluss

Nach Task 6: `npm run test:run` und `npm run typecheck` ein letztes Mal über den gesamten Branch laufen lassen, dann PR gegen `feature/v2-redesign` öffnen (Muster wie PR #12).
