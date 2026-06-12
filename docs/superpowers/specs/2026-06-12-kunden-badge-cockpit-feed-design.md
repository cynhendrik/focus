# Kunden-Badge + Cockpit-Feed Design
**Datum:** 2026-06-12

## Zusammenfassung

Zwei zusammenhängende Features:
1. **Badge in der Kundenliste** — zeigt die Summe aller offenen Punkte pro Kunde (Todos, Mails, Follow-ups, Rechnungen) als kleine Zahl auf dem Kunden-Row.
2. **Cockpit-Feed** — ersetzt die "Cy fragen"-Sektion im Kunden-Cockpit durch einen strukturierten Feed mit Aufgaben, Mails und offenen Posten für diesen Kunden.

---

## Feature 1: Badge in der Kundenliste

### Hook: `useCustomerOpenCount`

**Datei:** `src/hooks/useCustomerOpenCount.ts`

```ts
function useCustomerOpenCount(customerId: string): number
```

Liest aus vier bestehenden Stores und gibt die Gesamtanzahl offener Punkte zurück:

| Quelle | Filter | Store |
|--------|--------|-------|
| Todos | `status !== 'done'` + `customerId === customerId` | `useTodosStore` |
| Mails | `isRead === false` + `customerId === customerId` | `useMailStore` |
| Follow-ups | alle Einträge für `customerId` | `useCrmStore` |
| Rechnungen | `status === 'overdue' \|\| status === 'open'` + `accountId === customerId` | `useFinanceStore` |

Gibt `0` zurück wenn keine offenen Punkte existieren.

### Badge im `ClientListRow`

**Datei:** `src/routes/ClientsRoute.tsx` (Modifikation von `ClientListRow`)

- Badge erscheint rechts vom Signal-Chip in der Kunden-Zeile
- Nur sichtbar wenn `count > 0`
- Stil: runde Pille, `background: var(--accent)`, `color: var(--accent-ink)`, `font-size: 11px`, `min-width: 18px`, `height: 18px`
- Zahlen > 99 werden als `99+` angezeigt

---

## Feature 2: Cockpit-Feed (ersetzt "Cy fragen")

### Komponente: `CustomerFeedPane`

**Datei:** `src/components/customer/tabs/CustomerFeedPane.tsx`

Props:
```ts
interface Props {
  accountId: string
}
```

Liest direkt aus bestehenden Stores:
- `useTodosStore` — `allTodos` gefiltert nach `customerId`
- `useMailStore` — `emails` gefiltert nach `customerId`, nur `isRead === false`
- `useCrmStore` — `allFollowUps` gefiltert nach `customerId`
- `useFinanceStore` — `invoices` gefiltert nach `accountId`, nur `overdue` oder `open`

### Drei Sektionen

**1. Aufgaben**
- Zeigt offene Todos (`status !== 'done'`) für diesen Kunden
- Sortiert: Priorität p1 → p4, dann nach `updatedAt` desc
- Pro Item: Titel, Prioritäts-Chip (p1=rot, p2=orange, p3=grün, p4=grau), Bucket-Label (Heute / In Bearbeitung / Backlog)
- Leer: "Keine offenen Aufgaben"

**2. Mails**
- Ungelesene Mails, max 5, neueste zuerst
- Pro Item: Absender-Name, Betreff (gekürzt auf 60 Zeichen), relativer Zeitstempel
- Leer: "Keine ungelesenen Mails"

**3. Offen**
- Überfällige + offene Rechnungen: Rechnungsnummer, Betrag (formatiert), Fälligkeitsdatum (rot wenn überfällig)
- Follow-ups: Typ-Icon, Beschreibung, Datum
- Sortierung: Rechnungen zuerst (überfällig vor offen), dann Follow-ups nach Datum
- Leer: "Nichts Offenes"

### Gesamt-Leer-Zustand

Wenn alle drei Sektionen leer sind → einziger Placeholder:
```
✓ Alles erledigt
```

### Integration in `CockpitPane`

**Datei:** `src/components/customer/tabs/CockpitPane.tsx`

- Die gesamte "Cy fragen"-Sektion (Briefing-State, generateBriefing, NextMoveCard, Aktions-Buttons) wird entfernt
- `<CustomerFeedPane accountId={accountId} />` tritt an ihre Stelle
- Alle zugehörigen State-Variablen (`briefing`, `briefingStatus`, `generateBriefing`) und Imports können entfernt werden

---

## Was nicht enthalten ist

- Aktionen direkt im Feed (Todo abhaken, Mail beantworten) — nur Übersicht, kein Aktionsmodus
- KI-Priorisierung (kein Claude-Aufruf, rein rule-based)
- Pagination — max 5 Mails, alle Todos/Follow-ups/Rechnungen
