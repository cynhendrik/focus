# Focus Arbeitsraum — Design Spec
_2026-06-01_

## Ziel

Ein globaler Fokus-Modus als eigene Route, der alle actionable Tasks aus dem gesamten System (Finanzen, Clients, später Mail) als geführten Card-Deck darstellt. Der Nutzer arbeitet sich Karte für Karte durch — kein Vergessen mehr.

---

## Datenmodell

Keine DB-Migration. Drei neue Felder im bestehenden `payload`-JSON der `activities`-Tabelle:

```ts
source?:     'manual' | 'finance'
actionType?: 'send_reminder'
sourceRef?:  string  // z.B. Invoice-ID
```

Änderungen in TypeScript: `Todo` type + `activityToTodo()` + `TodoService.upsert()`.

---

## Task-Generator: useOverdueTaskSync

- Liest `useFinanceStore.invoices` (reaktiv)
- Für jede `invoice.status === 'overdue'`: prüft ob offener Task mit `sourceRef === invoice.id` existiert
- Falls nicht: erstellt Task `"Zahlungserinnerung an [Kundenname]"`, `priority: 'p1'`, `bucket: 'today'`, `source: 'finance'`, `actionType: 'send_reminder'`, `sourceRef: invoice.id`
- Hook wird nur in `FocusRoute` gemountet

---

## Navigation

- `AppView` bekommt `'focus'`
- Sidebar: "Fokus" mit Zap-Icon, unter "Heute", Shortcut `W`
- Badge: Anzahl offener Tasks im globalen Focus-Stack
- Neue Datei: `src/routes/FocusRoute.tsx`

---

## UI Layout

Zwei-Panel-Layout:
- **Links (flex: 1):** Card-Deck — Header ("DEIN NÄCHSTER ZUG" + Dots-Pagination), aktuelle Karte, Aktions-Buttons
- **Rechts (280px):** "Als Nächstes"-Queue mit den nächsten Tasks

### Card-Varianten

**FocusCardDefault** — normaler Task:
- Priorität-Label, Kundenname, Titel (H1 36px)
- Checklist falls vorhanden
- Notes falls vorhanden

**FocusCardReminder** — für `actionType === 'send_reminder'`:
- Label "FINANZEN", Kundenname, Betrag
- Titel: "Zahlungserinnerung an [Kunde] schicken"
- Kontext-Zeile: "Rechnung [Nummer] ist seit [X] Tagen überfällig."
- E-Mail-Entwurf: editierbare Textarea (kein AI, Template aus Invoice-Daten)
- Button: "Erinnerung senden" → SMTP → Task done

### Aktions-Buttons (beide Varianten)

- Primary: "Erledigt · weiter" (SPACE)
- Secondary: "Morgen" (M)  
- Tertiary: "Überspringen →"

---

## Send Reminder Flow

1. Template auto-befüllt:
   - Betreff: `Zahlungserinnerung · Rechnung [Nr] · [Betrag] €`
   - Body: freundliche Erinnerung mit Rechnungsdaten
2. User kann Text editieren
3. Klick "Erinnerung senden":
   - SMTP-Invoke mit Empfänger aus `accounts`-Store (account.email)
   - Task wird `done`
   - Nächste Karte
4. Fehlerfall: Toast-Meldung, Task bleibt offen

---

## Komponenten

| Datei | Zweck |
|---|---|
| `src/routes/FocusRoute.tsx` | Top-level Route |
| `src/components/focus/FocusWorkspace.tsx` | Layout-Container (2 Panels) |
| `src/components/focus/FocusCardDefault.tsx` | Standard-Task-Karte |
| `src/components/focus/FocusCardReminder.tsx` | Zahlungserinnerungs-Karte |
| `src/components/focus/FocusQueueSidebar.tsx` | "Als Nächstes"-Liste |
| `src/hooks/useGlobalFocusStack.ts` | Globaler Focus-Stack (kein customerId-Filter) |
| `src/hooks/useOverdueTaskSync.ts` | Task-Generator für überfällige Rechnungen |

---

## Was NICHT gebaut wird (V1)

- AI-Drafts (Cy) — kommt später
- Mail-Event → Task (kommt später)
- Mahnsystem als separates Modul — nicht nötig
- WhatsApp — nicht gewünscht
