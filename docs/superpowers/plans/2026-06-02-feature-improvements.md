# Feature Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6 mittlere Features (1-3 Tage gesamt) die Daten besser vernetzen: AI-Fallback, Kalender-Sync, Timeline, Geburtstags-Reminder, Mail-Anhang-Automation, Deal-Won-Invoice-Trigger.

**Architecture:** Jeder Task ist unabhängig. Keine Breaking Changes. Neue Hooks/Services wo nötig. Alle Features nutzen bestehende Stores.

**Tech Stack:** React 18, TypeScript, Tauri (invoke), Zustand, `src-tauri/src/engine/` für Backend-Logik

---

## Task 8: AI Fallback-Briefing — Graceful Degradation

**Context:** Wenn die Anthropic API nicht erreichbar ist oder kein API-Key vorhanden ist, zeigt `CockpitPane` einen Fehler und zeigt nichts. Es gibt keine Fallback-Logik. Lösung: lokale Heuristiken als Fallback-Briefing.

**Files:**
- Modify: `src/lib/ai/briefing.ts` — `generateBriefing` mit Fallback
- Create: `src/lib/ai/fallback-briefing.ts` — rein lokale Briefing-Generierung
- Modify: `src/components/customer/tabs/CockpitPane.tsx` — Error-Handling verbessern

- [ ] **Lies bestehenden generateBriefing-Code:**
```bash
grep -n "generateBriefing\|catch\|MissingApiKey" src/lib/ai/briefing.ts | head -20
```

- [ ] **Erstelle `src/lib/ai/fallback-briefing.ts`:**

```ts
import type { DossierInput } from './briefing'
import type { CustomerBriefing } from './briefing'

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function generateFallbackBriefing(input: DossierInput): CustomerBriefing {
  const { customer, invoices, deals, todos, emails, followUps } = input

  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const openInvoices    = invoices.filter(i => i.status === 'open')
  const openDeals       = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost')
  const openTodos       = todos.filter(t => t.status !== 'done')
  const unreadMails     = emails.filter(e => !e.isRead)
  const dueFU           = followUps.filter(f => f.status !== 'erledigt' && f.dueDate <= new Date().toISOString())

  // Headline
  const parts: string[] = []
  if (openDeals.length > 0) {
    const topDeal = openDeals.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
    parts.push(`${openDeals.length} offener Deal${openDeals.length > 1 ? 's' : ''} (größter: ${fmtMoney(topDeal.value ?? 0)})`)
  }
  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((s, i) => s + i.total, 0)
    parts.push(`${overdueInvoices.length} überfällige Rechnung${overdueInvoices.length > 1 ? 'en' : ''} (${fmtMoney(total)})`)
  }
  if (emails.length > 0) {
    const lastMail = emails.sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]
    parts.push(`letzter Kontakt vor ${daysAgo(lastMail.sentAt)} Tagen`)
  }

  const headline = parts.length > 0
    ? `${customer.name}: ${parts.join(', ')}.`
    : `${customer.name} — keine aktuellen Aktivitäten in den letzten 90 Tagen.`

  // Highlights
  const highlights: CustomerBriefing['highlights'] = []

  if (overdueInvoices.length > 0) {
    highlights.push({
      title: 'Überfällige Rechnungen',
      text: `${overdueInvoices.length} Rechnung${overdueInvoices.length > 1 ? 'en' : ''} offen: ${fmtMoney(overdueInvoices.reduce((s, i) => s + i.total, 0))}`,
      tone: 'bad',
    })
  }
  if (openDeals.length > 0) {
    highlights.push({
      title: `${openDeals.length} offene Deal${openDeals.length > 1 ? 's' : ''}`,
      text: `Gesamtwert: ${fmtMoney(openDeals.reduce((s, d) => s + (d.value ?? 0), 0))}`,
      tone: openDeals.some(d => (d.value ?? 0) > 10000) ? 'ok' : 'info',
    })
  }
  if (openInvoices.length > 0) {
    highlights.push({
      title: 'Offene Rechnungen',
      text: `${openInvoices.length} ausstehend: ${fmtMoney(openInvoices.reduce((s, i) => s + i.total, 0))}`,
      tone: 'warn',
    })
  }
  if (unreadMails.length > 0) {
    highlights.push({
      title: `${unreadMails.length} ungelesene Mail${unreadMails.length > 1 ? 's' : ''}`,
      text: unreadMails[0]?.subject ?? 'Neue Nachrichten',
      tone: 'warn',
    })
  }

  // Signals
  const signals: CustomerBriefing['signals'] = []
  const lastContact = emails.length > 0
    ? daysAgo(emails.sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0].sentAt)
    : null
  if (lastContact !== null && lastContact > 30) {
    signals.push({ text: `Kein Kontakt seit ${lastContact} Tagen`, severity: lastContact > 60 ? 'alert' : 'warning' })
  }

  // Next steps
  const nextSteps: CustomerBriefing['nextSteps'] = []
  if (overdueInvoices.length > 0) {
    nextSteps.push({ action: 'Zahlungserinnerung schicken', reason: `${overdueInvoices.length} Rechnung${overdueInvoices.length > 1 ? 'en' : ''} überfällig` })
  }
  if (dueFU.length > 0) {
    nextSteps.push({ action: `Follow-Up bei ${customer.name}`, reason: `${dueFU.length} fälliger Follow-Up` })
  }
  if (openTodos.length > 0) {
    nextSteps.push({ action: openTodos[0].title, reason: `${openTodos.length} offene Aufgabe${openTodos.length > 1 ? 'n' : ''}` })
  }
  if (nextSteps.length === 0) {
    nextSteps.push({ action: 'Kontakt aufnehmen', reason: 'Regelmäßige Check-ins pflegen die Kundenbeziehung' })
  }

  return { headline, highlights, signals, nextSteps }
}
```

- [ ] **Modifiziere `generateBriefing` in `briefing.ts` mit Fallback:**

```ts
// Exportiere DossierInput für Fallback-Import
// Ergänze am Ende von generateBriefing:
export async function generateBriefing(input: DossierInput): Promise<CustomerBriefing> {
  const apiKey = getApiKey()
  if (!apiKey) {
    // Fallback: lokale Heuristiken statt API-Fehler
    const { generateFallbackBriefing } = await import('./fallback-briefing')
    return generateFallbackBriefing(input)
  }
  try {
    // ... existing API call code ...
  } catch (err) {
    // Bei Netzwerkfehler: Fallback
    if (err instanceof MissingApiKeyError) throw err
    const { generateFallbackBriefing } = await import('./fallback-briefing')
    return generateFallbackBriefing(input)
  }
}
```

- [ ] **Zeige Fallback-Indikator in CockpitPane:**
```bash
grep -n "generateBriefing\|briefing\|error\|catch" src/components/customer/tabs/CockpitPane.tsx | head -20
```

Füge `isFallback` State hinzu und zeige einen kleinen Hinweis:
```tsx
// Im catch/finally Block:
{isFallback && (
  <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
    ⚡ Lokale Analyse (kein API-Key)
  </div>
)}
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/lib/ai/fallback-briefing.ts src/lib/ai/briefing.ts src/components/customer/tabs/CockpitPane.tsx
git commit -m "feat(ai): add local fallback briefing when API unavailable"
```

---

## Task 9: Kalender-Todo Sync vervollständigen — Event löschen → Todo markieren

**Context:** Wenn ein Kalender-Event gelöscht wird, bleibt das verlinkte Todo für immer im Status 'open'. Es wird nie abgehakt oder auf 'done' gesetzt.

**Files:**
- Read: `src/store/calendar.store.ts` — `remove()` Funktion
- Read: `src/store/todos.store.ts` — `syncTodoFromCalendar` Pattern
- Modify: `src/store/calendar.store.ts` — bei Event-Löschung Todo-Status updaten

- [ ] **Lies `remove()` in calendar.store.ts:**
```bash
grep -n -A 20 "remove.*event\|async remove" src/store/calendar.store.ts | head -40
```

- [ ] **Lies `deleteLinkedEvent` Pattern in todos.store.ts:**
```bash
grep -n "deleteLinked\|calendarEventId\|fromTodoSync" src/store/todos.store.ts | head -20
```

- [ ] **Exportiere `unlinkTodoFromCalendar` aus todos.store.ts:**

```ts
// In src/store/todos.store.ts — neue exportierte Funktion hinzufügen:
export async function unlinkTodoFromCalendar(eventId: string): Promise<void> {
  const state = useTodosStore.getState()
  const todo = state.allTodos.find(t => t.calendarEventId === eventId)
  if (!todo) return
  // Setze scheduledAt auf undefined, entferne calendarEventId-Link
  await state.upsert({
    id: todo.id,
    title: todo.title,
    priority: todo.priority,
    // calendarEventId bleibt leer → Todo hat keinen Kalender-Link mehr
  })
}
```

- [ ] **Rufe `unlinkTodoFromCalendar` in `calendar.store.remove()` auf:**

```ts
// In src/store/calendar.store.ts — in der remove()-Funktion nach dem Backend-Call:
import { unlinkTodoFromCalendar } from './todos.store'

// In remove():
async remove(id, workspaceId, opts = {}) {
  // ... bestehender Code ...
  await invoke('delete_calendar_event', { id, workspaceId })
  // NEU: Todo unlinken wenn nicht vom Todo-Sync ausgelöst
  if (!opts.fromTodoSync) {
    await unlinkTodoFromCalendar(id)
  }
  set(s => ({ events: s.events.filter(e => e.id !== id) }))
}
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/store/calendar.store.ts src/store/todos.store.ts
git commit -m "fix(calendar): unlink todo when calendar event is deleted"
```

---

## Task 10: Activity-Timeline Tab in CustomerRoute

**Context:** Aktivitäten, Deals, Rechnungen und Todos existieren als separate Tabs. Eine chronologische Gesamthistorie fehlt. Nutzer muss 4 Tabs durchklicken um den Kundenverlauf zu verstehen.

**Files:**
- Create: `src/components/customer/tabs/TimelinePane.tsx` (ersetze/erweitere existierende wenn vorhanden)
- Modify: `src/routes/CustomerRoute.tsx` — neuen Tab einbinden

- [ ] **Prüfe ob TimelinePane.tsx existiert:**
```bash
ls src/components/customer/tabs/
```

- [ ] **Lese CustomerRoute.tsx Tab-Struktur:**
```bash
grep -n "Tab\|tab\|CustomerTab\|pane" src/routes/CustomerRoute.tsx | head -30
```

- [ ] **Erstelle/Überschreibe `src/components/customer/tabs/TimelinePane.tsx`:**

```tsx
import { useMemo } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useDealsStore } from '@/store/deals.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { TrendingUp, CreditCard, CheckSquare, Mail, Zap } from 'lucide-react'

interface Props { customerId: string; accountId?: string }

type TimelineItem = {
  id: string
  date: string
  type: 'activity' | 'deal' | 'invoice' | 'todo' | 'mail'
  title: string
  subtitle?: string
  amount?: number
  color: string
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function TimelinePane({ customerId, accountId }: Props) {
  const activities = useActivitiesStore(s => s.activities)
  const deals      = useDealsStore(s => s.deals)
  const invoices   = useFinanceStore(s => s.invoices)
  const todos      = useTodosStore(s => s.allTodos)
  const emails     = useMailStore(s => s.emails)

  const items = useMemo((): TimelineItem[] => {
    const all: TimelineItem[] = []

    activities
      .filter(a => a.accountId === (accountId ?? customerId))
      .forEach(a => all.push({
        id: a.id, date: a.createdAt ?? a.updatedAt ?? '',
        type: 'activity', title: a.title ?? a.type,
        subtitle: a.body?.slice(0, 80), color: 'oklch(60% 0.15 260)',
      }))

    deals
      .filter(d => d.accountId === (accountId ?? customerId))
      .forEach(d => all.push({
        id: d.id, date: d.createdAt ?? '',
        type: 'deal', title: d.title,
        subtitle: `Stage: ${d.stage}`, amount: d.value,
        color: 'oklch(65% 0.18 140)',
      }))

    invoices
      .filter(i => i.accountId === (accountId ?? customerId))
      .forEach(i => all.push({
        id: i.id, date: i.date,
        type: 'invoice', title: `Rechnung ${i.number ?? ''}`,
        subtitle: i.status, amount: i.total,
        color: 'oklch(60% 0.2 25)',
      }))

    todos
      .filter(t => t.customerId === customerId && t.status === 'done')
      .slice(0, 20)
      .forEach(t => all.push({
        id: t.id, date: t.updatedAt,
        type: 'todo', title: t.title,
        color: 'var(--fg-dim)',
      }))

    emails
      .filter(e => e.customerId === customerId)
      .slice(0, 15)
      .forEach(e => all.push({
        id: e.id, date: e.sentAt,
        type: 'mail', title: e.subject ?? '(kein Betreff)',
        subtitle: e.fromName ?? e.fromAddr,
        color: 'oklch(60% 0.15 240)',
      }))

    return all.sort((a, b) => b.date.localeCompare(a.date))
  }, [activities, deals, invoices, todos, emails, customerId, accountId])

  const ICONS = {
    activity: Zap, deal: TrendingUp, invoice: CreditCard,
    todo: CheckSquare, mail: Mail,
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
        Noch keine Aktivitäten
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, idx) => {
        const Icon = ICONS[item.type]
        const isLast = idx === items.length - 1
        return (
          <div key={item.id} style={{ display: 'flex', gap: 14, position: 'relative' }}>
            {/* Timeline line */}
            {!isLast && (
              <div style={{
                position: 'absolute', left: 15, top: 30, bottom: 0,
                width: 1, background: 'var(--border)',
              }} />
            )}
            {/* Icon */}
            <div style={{
              width: 30, height: 30, borderRadius: 99, flexShrink: 0, zIndex: 1,
              background: `${item.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={14} style={{ color: item.color }} />
            </div>
            {/* Content */}
            <div style={{ flex: 1, paddingBottom: 20, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{item.title}</span>
                {item.amount != null && (
                  <span style={{ fontSize: 12, color: item.color, fontWeight: 700 }}>{fmtMoney(item.amount)}</span>
                )}
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 'auto' }}>
                  {new Date(item.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })}
                </span>
              </div>
              {item.subtitle && (
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{item.subtitle}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Füge "Verlauf"-Tab in CustomerRoute.tsx ein:**
```bash
grep -n "CustomerTab\|'verlauf'\|'timeline'" src/store/ui.store.ts | head -5
grep -n "tabs\|TabButton\|tab.*key" src/routes/CustomerRoute.tsx | head -20
```

Ergänze `'verlauf'` zum `CustomerTab`-Typ falls nicht vorhanden, und füge den Tab hinzu:
```tsx
{ key: 'verlauf', label: 'Verlauf' }
// In der Tab-Render-Logik:
case 'verlauf': return <TimelinePane customerId={customerId} accountId={accountId} />
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/components/customer/tabs/TimelinePane.tsx src/routes/CustomerRoute.tsx src/store/ui.store.ts
git commit -m "feat(customer): add chronological timeline tab"
```

---

## Task 11: Geburtstagskalender + Auto-Reminder

**Context:** `contacts.birthday` (ISO YYYY-MM-DD) ist im Schema definiert aber nie genutzt. Geburtstage sollen im Kalender erscheinen und 1 Tag vorher automatisch ein Todo erstellt werden.

**Files:**
- Create: `src/hooks/useBirthdaySync.ts`
- Modify: `src/components/focus/FocusShell.tsx` oder `src/App.tsx` — Hook mounten
- Modify: `src/routes/CalendarRoute.tsx` — Geburtstags-Events zeigen

- [ ] **Prüfe ob contacts über Tauri geladen werden:**
```bash
grep -n "get_contacts\|ContactsStore\|birthday" src/store/*.ts | head -20
```

- [ ] **Erstelle `src/hooks/useBirthdaySync.ts`:**

```ts
import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Contact } from '@/types/contact.types'

function todayMMDD(): string {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tomorrowMMDD(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useBirthdaySync() {
  const accounts     = useAccountsStore(s => s.accounts)
  const allTodos     = useTodosStore(s => s.allTodos)
  const upsert       = useTodosStore(s => s.upsert)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId)

  useEffect(() => {
    if (!workspaceId || accounts.length === 0) return

    const today    = todayMMDD()
    const tomorrow = tomorrowMMDD()

    const checkBirthdays = async () => {
      for (const account of accounts.slice(0, 50)) { // max 50 Accounts checken
        try {
          const contacts = await invoke<Contact[]>('get_contacts', { accountId: account.id })
          for (const contact of contacts) {
            if (!contact.birthday) continue
            const bMMDD = contact.birthday.slice(5) // "MM-DD"
            if (bMMDD !== tomorrow) continue // Nur morgen

            const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ')
            const title = `🎂 Geburtstag: ${fullName} bei ${account.name}`

            // Nicht doppelt anlegen
            const exists = allTodos.some(t => t.title === title && t.bucket === 'today')
            if (exists) continue

            const tomorrowDate = new Date()
            tomorrowDate.setDate(tomorrowDate.getDate() + 1)
            tomorrowDate.setHours(9, 0, 0, 0)

            await upsert({
              title,
              customerId: account.id,
              priority: 'p2',
              bucket: 'today',
              scheduledAt: tomorrowDate.toISOString(),
              source: 'manual',
              actionType: 'followup',
              checklist: [],
              tags: ['geburtstag'],
            })
          }
        } catch {
          // Kein Kontakt für diesen Account — ignorieren
        }
      }
    }

    checkBirthdays()
    // Täglich prüfen (nur einmal per Session)
  }, [accounts.length, workspaceId])
}
```

- [ ] **Mounte Hook in `src/components/focus/FocusShell.tsx` oder `src/App.tsx`:**

```bash
grep -n "useOverdueTaskSync\|useInvoiceSuggestion" src/components/focus/FocusShell.tsx
```

In FocusShell.tsx oder dem Haupt-App-Layout:
```tsx
import { useBirthdaySync } from '@/hooks/useBirthdaySync'
// In der Komponente:
useBirthdaySync()
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/hooks/useBirthdaySync.ts src/components/focus/FocusShell.tsx
git commit -m "feat(contacts): auto-create birthday reminder todo 1 day before"
```

---

## Task 12: Deal Won → Invoice-Suggestion Trigger

**Context:** Wenn ein Deal auf "won" gesetzt wird, sollte automatisch ein `create_invoice`-Todo erscheinen (wie bei `useInvoiceSuggestionSync` für bestehende Invoice-Suggestions). Aktuell muss der Nutzer manuell von Pipeline zu Finance wechseln.

**Files:**
- Create: `src/hooks/useDealWonInvoiceSync.ts`
- Modify: `src/components/focus/FocusShell.tsx` — Hook einbinden

- [ ] **Lies useInvoiceSuggestionSync als Vorlage:**
```bash
cat src/hooks/useInvoiceSuggestionSync.ts
```

- [ ] **Erstelle `src/hooks/useDealWonInvoiceSync.ts`:**

```ts
import { useEffect } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { log } from '@/lib/logger'

export function useDealWonInvoiceSync() {
  const deals    = useDealsStore(s => s.deals)
  const invoices = useFinanceStore(s => s.invoices)
  const allTodos = useTodosStore(s => s.allTodos)
  const upsert   = useTodosStore(s => s.upsert)
  const accounts = useAccountsStore(s => s.accounts)

  useEffect(() => {
    if (deals.length === 0) return

    const wonDeals = deals.filter(d => d.stage === 'won')
    const processed = new Set<string>()

    for (const deal of wonDeals) {
      if (processed.has(deal.id)) continue

      // Prüfe ob bereits eine Rechnung für diesen Deal existiert
      const hasInvoice = invoices.some(i => i.dealId === deal.id)
      if (hasInvoice) continue

      // Prüfe ob bereits ein offenes Todo für diesen Deal existiert
      const hasTodo = allTodos.some(
        t => t.sourceRef === deal.id && t.actionType === 'create_invoice' && t.status !== 'done',
      )
      if (hasTodo) continue

      processed.add(deal.id)

      const account = accounts.find(a => a.id === deal.accountId)
      const customerName = account?.name ?? 'Kunde'
      const amountStr = deal.value
        ? deal.value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '?'

      upsert({
        customerId:  deal.accountId,
        title:       `Rechnung für „${deal.title}" erstellen`,
        status:      'open',
        priority:    'p1',
        bucket:      'today',
        source:      'finance',
        actionType:  'create_invoice',
        sourceRef:   deal.id,
        checklist:   [],
        tags:        [],
        notes:       `Deal gewonnen (${amountStr} €) — noch nicht abgerechnet. Kunde: ${customerName}`,
      }).catch((err: unknown) =>
        log.warn('Failed to create invoice task for won deal', { dealId: deal.id, err }),
      )
    }
  }, [deals, invoices, allTodos, upsert, accounts])
}
```

- [ ] **Einbinden in FocusShell.tsx:**
```tsx
import { useDealWonInvoiceSync } from '@/hooks/useDealWonInvoiceSync'
// In der Komponente:
useDealWonInvoiceSync()
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/hooks/useDealWonInvoiceSync.ts src/components/focus/FocusShell.tsx
git commit -m "feat(deals): auto-create invoice todo when deal is won"
```
