# Focus Cockpit Bar — Design Spec

**Datum:** 2026-06-03  
**Status:** Approved

## Zusammenfassung

Der Focus-Modus bekommt eine persistent sichtbare **Cockpit Bar** am unteren Rand der Mittel-Spalte. Sie ermöglicht es, direkt aus einer Kunden-Session heraus Tasks, Rechnungen und E-Mails zu erstellen — ohne den Kontext zu verlassen. Der Kunde ist immer vorausgefüllt. CORRA denkt kontextbasiert mit (Lampe-Indikator).

---

## Architektur

```
FocusSessionView
  ├── FocusCustomerPanel (links, 220px) — unverändert
  ├── col-center (flex:1)
  │     ├── cards-area (flex:1, scrollbar) — Focus-Karten, unverändert
  │     └── FocusCockpitBar (flex-shrink:0) — NEU
  └── FocusBatchSidebar (rechts, 260px) — unverändert
```

`FocusCockpitBar` sitzt **unterhalb** der Focus-Karten, **oberhalb** des unteren Fensterrandes. Permanenter Bestandteil der Session-Ansicht — kein Toggle, kein Modal.

### Props

```ts
interface FocusCockpitBarProps {
  customerId: string | undefined
  customerName: string
}
```

Beide Werte kommen aus `FocusSessionView` — immer vorhanden während einer Session.

---

## Komponenten

| Datei | Typ | Verantwortung |
|---|---|---|
| `src/components/focus/FocusCockpitBar.tsx` | NEU | Outer shell mit Tabs + Mode-Routing |
| `src/components/focus/cockpit/CockpitTaskForm.tsx` | NEU | Task-Erstellungsformular |
| `src/components/focus/cockpit/CockpitInvoiceForm.tsx` | NEU | Schnell-Rechnung-Formular |
| `src/components/focus/cockpit/CockpitMailForm.tsx` | NEU | Freier E-Mail-Composer |
| `src/components/focus/cockpit/CorraLamp.tsx` | NEU | Lampen-Indikator + Draft-Generator |

---

## Tab 1: Task erstellen

### Felder
- **Titel** — TipTap single-line (kein Return), Placeholder "Neue Aufgabe…"
- **Priorität** — 4 Pills: P1 (Dringend) / P2 (Hoch) / P3 (Normal, default) / P4 (Niedrig)
- **Fällig am** — `<input type="date">`, optional, kein Default

### Verhalten
- Kunde vorausgefüllt als nicht-editierbarer `@`-Chip
- "Task erstellen" Button → `useTodosStore.upsert({ customerId, title, priority, dueDate, bucket: 'today' })`
- Nach Erfolg: Form leert sich, Toast "Task erstellt", neuer Tile erscheint sofort in `FocusBatchSidebar`
- CORRA-Lampe: **aus** (kein Bedarf im Task-Modus)

---

## Tab 2: Rechnung erstellen

### Felder
- **Beschreibung** — TipTap single-line, Placeholder "Leistung beschreiben…"
- **Betrag** — `<input type="number">` + "€"-Label
- **Fällig am** — `<input type="date">`, Default: heute + 14 Tage

### Verhalten
- Kunde vorausgefüllt (nicht editierbar)
- "Rechnung erstellen" Button → `FinanceService.createInvoice({ workspaceId, createdBy: userId, accountId: customerId, date: today, dueDate, status: 'draft' })` + ein `InvoiceItem` mit `title: beschreibung, total: betrag` via `updateInvoice`
- Nach Erfolg: Toast "Rechnung erstellt (Entwurf)" + `useFinanceStore.loadAll()` triggern
- CORRA-Lampe: **leuchtet** sobald `betrag > 0` — generiert auf Klick eine optionale Begleit-Mail (öffnet E-Mail-Tab mit vorausgefülltem Draft)

---

## Tab 3: E-Mail schreiben

### Felder
- **An** — Kontakt des Kunden, vorausgefüllt via `invoke('get_contacts', { accountId: customerId })` (primäre E-Mail), editierbar per `<input>`
- **Betreff** — `<input>` single-line
- **Body** — TipTap Editor (mehrzeilig, mind. 3 Zeilen sichtbar), Formatierung: Bold, Italic

### Verhalten
- "Senden" Button → `MailService.sendEmail({ accountId: mailAccounts[0].id, to: [empfaenger], subject, bodyText })`
- Kein Mail-Konto: Toast "Kein E-Mail-Konto konfiguriert"
- Nach Erfolg: Toast "E-Mail gesendet", Form leert sich
- CORRA-Lampe: **leuchtet** sobald `betreff.length > 3`

---

## CorraLamp — Zustände & Verhalten

### Zustände

```ts
type LampState = 'off' | 'ready' | 'loading'
```

| Zustand | Visuell | Bedeutung |
|---|---|---|
| `off` | `Lightbulb` Icon, grau (#484858) | Kein Kontext — nichts zu tun |
| `ready` | `Lightbulb` Icon, lila pulsierend (`oklch(60% 0.25 280)`) | CORRA kann helfen — warte auf Klick |
| `loading` | `Loader` Icon, spinning | Draft wird generiert |

### Wann `ready`
- **E-Mail-Modus**: `betreff.trim().length > 3`
- **Rechnung-Modus**: `betrag > 0` (generiert Begleit-Mail-Draft)
- **Task-Modus**: immer `off`

### Klick-Logik (E-Mail-Modus)

```ts
const draft = await generateCorraDraft({
  kind: 'followup',
  customerName,
  topic: betreff,
  notes: [letzte Aktivität title, offener Deal title].filter(Boolean).join(', '),
})
// → füllt TipTap-Body
```

### Klick-Logik (Rechnung-Modus)

```ts
const draft = await generateCorraDraft({
  kind: 'invoice',
  customerName,
  amount: betrag,
  dealTitle: beschreibung,
})
// → wechselt Tab zu "E-Mail", setzt Betreff auf "Rechnung: {beschreibung}",
//   füllt Body mit draft. Empfänger-Feld bleibt editierbar.
```

### Platzierung

Oben rechts im `FocusCockpitBar` Header, neben den Mode-Tabs. Sichtbar aber nicht aufdringlich — 28×28px Kreis-Button.

---

## Integration in FocusSessionView

`FocusSessionView.tsx` erhält `FocusCockpitBar` am Ende der center-Spalte:

```tsx
<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
  {/* cards-area — existierend */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
    {/* ... Focus-Karten ... */}
  </div>

  {/* Cockpit Bar — NEU */}
  <FocusCockpitBar
    customerId={customerId}
    customerName={customerName}
  />
</div>
```

---

## Daten-Abhängigkeiten

| Store / Service | Verwendung |
|---|---|
| `useTodosStore` | Task erstellen via `upsert()` |
| `useFinanceStore` + `FinanceService` | Rechnung erstellen via `createInvoice()`, `loadAll()` nach Erfolg |
| `useWorkspaceStore` | `activeWorkspaceId` für Invoice-Payload |
| `useAuthStore` | `user.id` als `createdBy` für Invoice-Payload |
| `useMailStore` | Mail-Konto abrufen (`accounts[0]`) |
| `MailService` | E-Mail senden |
| `useActivitiesStore` | Letzter Kontakt für CORRA-Kontext |
| `useDealsStore` | Offener Deal-Titel für CORRA-Kontext |
| `useToastStore` | Erfolgs-/Fehler-Toasts |
| `generateCorraDraft` (corra.ts) | Draft-Generierung in CorraLamp |

---

## Was NICHT in diesem Scope ist

- Anruf loggen (bewusst entfernt)
- ⌘K Command Palette (separate Feature-Idee für später)
- Rechnung direkt versenden aus dem Cockpit Bar (nur Entwurf erstellen — vollständige Rechnung via FocusCardInvoice oder Finanzen-Modul)
- Rich-Text-Formatierung im Task-Titel oder Betreff
- Mehrere Empfänger im E-Mail-Composer
