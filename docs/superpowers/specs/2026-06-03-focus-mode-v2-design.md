# Focus Mode v2 — Kunden-Session + Batch-Grid

**Datum:** 2026-06-03  
**Status:** Approved

## Zusammenfassung

Der Focus-Modus wird von einem flachen Prioritäts-Stack zu einem **Kunden-Session-System** umgebaut. Statt Tasks quer über alle Kunden abzuarbeiten, wählt der User einen Kunden, arbeitet alle seine Tasks durch (Batch-Grid), dann den nächsten. CORRA liefert dabei proaktiv Kunden-Kontext.

---

## Flow

```
Focus öffnen
    → Kunden-Auswahl-Screen (neu)
        → Kunden-Karte klicken
            → Session-View: Links Kunde | Mitte aktive Karte | Rechts Mini-Batch
                → Task erledigt/übersprungen → nächster Task im Mini-Batch
                    → Alle Tasks erledigt → zurück zur Kunden-Auswahl
                        → nächsten Kunden wählen
```

---

## Screen 1 — Kunden-Auswahl

**Komponente:** `FocusCustomerSelect.tsx` (neu)

- Ersetzt den direkten Einstieg in `FocusWorkspace`
- Zeigt alle Kunden die heute mindestens 1 offenen Task haben
- Sortierung: dringende Kunden (überfällige Rechnungen, Mahnungen) zuerst, dann nach Priorität des höchsten Tasks
- Jede Kunden-Karte zeigt:
  - Avatar (Initialen), Name, Umsatz, Letzter-Kontakt-Info
  - Liste aller Tasks mit Icon (€ / ✉ / ↗ / ↻ / ✓), Titel, Betrag
  - Dringlichkeits-Badge (DRINGEND · ÜBERFÄLLIG · NORMAL · NIEDRIG)
  - Task-Anzahl als große Zahl
  - "Starten →" Button
- TopBar zeigt: "X Kunden · Y Tasks" + Schließen

**Daten-Quelle:** `useFocusStack` gruppiert nach `customerId` — neue Hilfsfunktion `groupFocusByCustomer(stack)`.  
Kunden ohne `customerId` (task-only) landen in einer Gruppe "Allgemein" am Ende.

---

## Screen 2 — Session-View (3-Spalten)

**Komponente:** `FocusSessionView.tsx` (neu), ersetzt `FocusWorkspace` wenn ein Kunde aktiv ist.

### Linke Spalte — `FocusCustomerPanel.tsx` (neu, 220px)

Bleibt während der ganzen Session stabil (kein Kunden-Wechsel).

- Kunden-Avatar + Name + Tag ("Aktiv · Session")
- **Session-Fortschrittsanzeige:** Balken + "X von Y" für die Kunden-Tasks
- KPI-Kacheln (aus vorhandenem Store): Kunde seit, Umsatz, Kontakt-Rhythmus, Letzter Kontakt
- Kontakt-Block: E-Mail + Telefon (aus `contacts.store`)
- Aktivitäts-Timeline: letzte 3-4 Aktivitäten (aus `activities.store`)
- "← Alle Kunden" Button unten → zurück zur Auswahl

### Mittlere Spalte — bestehende FocusCards (umgebaut, max 520px)

Zeigt die aktive Task-Karte des Kunden — weiterhin die vorhandenen Card-Typen:
- `FocusCardReminder` — Zahlungserinnerung mit E-Mail/WhatsApp Compose + CY-Entwurf
- `FocusCardFollowUp` — Follow-up / Antwort schreiben
- `FocusCardInvoice` — Rechnung erstellen & senden
- `FocusCardDefault` — generische Task

**Neu auf allen Cards:**
- CORRA-Kontext-Hint Box (lila) über dem Compose-Bereich: proaktiver Hinweis basierend auf Kundenhistorie (Zahlungsverhalten, letzter Kontakt, offene Deals)
- Schnellnotiz-Zeile unter den Actions: "Schnellnotiz hinzufügen…" öffnet inline Textarea, wird via `activities.store.create` als Activity mit `type: 'note'` gespeichert

**TopBar (erweitert):**
- "X/Y bei [Kundenname]" Zähler + "dann: [nächster Kunde] →"
- Focus-Timer (laufende Zeit pro Session)
- CORRA-Toggle + Schließen

### Rechte Spalte — `FocusBatchSidebar.tsx` (neu, 260px)

Zeigt **alle Tasks des aktuellen Kunden** als Mini-Kacheln — nicht die globale Queue.

- Header: "[Kundenname] — alle Tasks" + "X/Y" Badge
- Today-Stats-Strip: Erledigt / Offen / Mails (heute gesamt)
- Mini-Kacheln für jeden Kunden-Task:
  - Icon + Typ-Label + Titel + Betrag
  - Aktuell aktiver Task: grün hervorgehoben + Puls-Dot
  - Einfache Tasks (kein E-Mail-Compose nötig, z.B. CRM aktualisieren): "Sofort ✓" Button direkt in der Kachel
  - Erledigte Tasks: ausgegraut (opacity 0.38)
- CORRA-Erkennungs-Block unten: 2-3 proaktive Hinweise zum Kunden

---

## Kanal-Picker (E-Mail + WhatsApp)

`FocusCardReminder` und `FocusCardFollowUp` erhalten neben E-Mail einen zweiten Kanal: **WhatsApp**.

- WhatsApp-Tab im Compose-Bereich wählbar
- Bei WhatsApp: kein Betreff-Feld, kürzerer Body-Text (CORRA generiert WhatsApp-optimierten Draft)
- Senden via `invoke('send_whatsapp', ...)` — Tauri-Kommando (muss backend-seitig implementiert werden, vorerst als Stub/Toast "Coming soon")

---

## useFocusStack — Erweiterung

Bestehender Hook bleibt unverändert (für Backward-Compat). Neue Hilfsfunktion:

```ts
// src/hooks/useFocusStack.ts — Ergänzung
export interface CustomerFocusGroup {
  customerId: string | null   // null = "Allgemein"
  customerName: string
  tasks: Todo[]
  urgency: 'critical' | 'high' | 'normal' | 'low'
}

export function groupFocusByCustomer(stack: Todo[], accounts: Account[]): CustomerFocusGroup[]
```

Urgency-Logik:
- `critical`: hat Task mit `actionType === 'send_reminder'` und dunningLevel >= 1
- `high`: hat überfällige Rechnung oder P1-Task
- `normal`: Standard
- `low`: nur P4-Tasks

---

## FocusShell — Routing

`FocusShell.tsx` bekommt einen neuen State: `activeCustomerId: string | null`.

- `null` → zeige `FocusCustomerSelect`
- gesetzt → zeige `FocusSessionView` mit diesem Kunden
- Wenn alle Tasks eines Kunden erledigt/übersprungen → `activeCustomerId = null` (zurück zur Auswahl)

---

## CORRA-Kontext-Hint

Funktion `generateCorraContextHint(customer, todos, invoices, activities): string` in `src/lib/ai/corra.ts`.

Input-Kontext:
- Zahlungshistorie (durchschnittliche Zahlungsdauer aus vergangenen Rechnungen)
- Letzter Kontakt + Kanal
- Offene Deals
- Letzte Aktivität (war es positiv/negativ?)

Output: 1 Satz Hinweis für den Nutzer (auf DE), z.B.:
- "Acme zahlt normalerweise in 3 Tagen — Tag 24 ist ungewöhnlich. Ton: freundlich."
- "Letzter Kontakt war vor 47 Tagen. Erst nachfassen bevor du mahnst."

---

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/focus/FocusShell.tsx` | State für activeCustomerId, Routing |
| `src/components/focus/FocusCustomerSelect.tsx` | **NEU** — Kunden-Auswahl Screen |
| `src/components/focus/FocusSessionView.tsx` | **NEU** — 3-Spalten Session |
| `src/components/focus/FocusCustomerPanel.tsx` | **NEU** — Linke Spalte |
| `src/components/focus/FocusBatchSidebar.tsx` | **NEU** — Rechte Mini-Kacheln |
| `src/components/focus/FocusCardReminder.tsx` | + CORRA-Hint, + WhatsApp-Tab |
| `src/components/focus/FocusCardFollowUp.tsx` | + CORRA-Hint, + WhatsApp-Tab |
| `src/components/focus/FocusCardDefault.tsx` | + CORRA-Hint, + Schnellnotiz |
| `src/components/focus/FocusCardInvoice.tsx` | + CORRA-Hint |
| `src/hooks/useFocusStack.ts` | + `groupFocusByCustomer` |
| `src/lib/ai/corra.ts` | + `generateCorraContextHint` |
| `src/components/focus/FocusWorkspace.tsx` | Wird von FocusSessionView abgelöst — Card-Routing (Reminder/Invoice/FollowUp/Default) zieht in FocusSessionView um |

---

## Was NICHT in diesem Scope ist

- WhatsApp-Backend-Integration (Stub / "Coming soon" Toast reicht)
- Drag & Drop Reorder in der Kunden-Auswahl
- Automatisches Starten der dringendsten Session (bewusste Entscheidung beim User)
