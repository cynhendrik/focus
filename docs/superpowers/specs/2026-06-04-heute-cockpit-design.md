# Heute-Cockpit — Design Spec
**Datum:** 2026-06-04  
**Status:** Zur Review

---

## Was wir bauen

Einen globalen Tages-Cockpit der automatisch alle wichtigen Aufgaben des Tages als abarbeitbare Kacheln zeigt — eine nach der anderen, mit wenigen Klicks erledigt.

Das ersetzt den bestehenden Focus-Bereich vollständig. Kein Kunden-Auswahlschritt, keine Seitenleisten, kein Cockpit-Bar unten. Nur die Kachel.

---

## Das Kachel-Konzept

```
┌─────────────────────────────────────────────────┐
│ ● DEIN NÄCHSTER ZUG          ● ○ ○ ○ ○  1 / 5  │
│                                                 │
│  Zahlungserinnerung für 3.600 € schicken        │  ← Headline
│                                                 │
│  → INV-2026-061 ist seit 08.05 überfällig.      │  ← Kontext (aus Daten, kein KI)
│    Müller GmbH hat bisher nicht reagiert.       │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ ✉ E-Mail          ※ CY-ENTWURF · EDIT.  │  │  ← Channel-Tab (Mail / WhatsApp)
│  │──────────────────────────────────────────│  │
│  │ Hey, kleine freundliche Erinnerung…      │  │  ← TipTap Editor, auto-befüllt
│  │ [editierbar]                             │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  [↗ Erinnerung senden]  [✦ Cy neu]  Überspringen → │
└─────────────────────────────────────────────────┘
```

---

## Queue-Logik: Was kommt in die Kacheln?

Der Hook `useHeuteQueue` aggregiert alle Quellen und sortiert nach Priorität:

| Priorität | Quelle | Kachel-Typ | Aktion |
|-----------|--------|-----------|--------|
| 1 | Invoices `status=overdue` | `invoice_reminder` | Mail mit Anhang senden |
| 2 | Todos `bucket=today`, `priority=p1` | `todo` oder `mail_reply` | Abhaken oder Mail senden |
| 3 | EmailHeaders ungelesen mit `customerId` | `mail_reply` | Antwort senden |
| 4 | Todos `bucket=today`, `priority=p2+` | `todo` | Abhaken |
| 5 | CalendarEvents heute | `event` | Info-Kachel, Überspringen |

Maximal 10 Kacheln pro Tag. Events ohne Handlungsbedarf erscheinen nur wenn die Queue sonst leer wäre.

---

## Kachel-Typen

### `invoice_reminder`
- **Headline:** „Zahlungserinnerung für [Betrag] € schicken"
- **Kontext:** Tage überfällig, Kundenname, Rechnungsnummer (aus Daten, kein KI)
- **Body:** TipTap-Editor, KI-Entwurf auto-generiert via `generateCorraDraft({ kind: 'send_reminder' })`
- **Primäraktion:** Mail senden → Invoice-Status bleibt, Todo als done → nächste Kachel
- **Anhang:** Invoice-PDF wenn verfügbar (als Hinweis im UI, tatsächlicher Anhang wenn MailService es unterstützt)

### `todo` (einfache Aufgabe)
- **Headline:** Todo-Titel
- **Kontext:** Kundenname wenn vorhanden, Fälligkeitsdatum
- **Body:** Beschreibung/Notizen wenn vorhanden — kein Editor
- **Primäraktion:** „Erledigt ✓" → Todo auf `done` → nächste Kachel
- **Kein KI-Draft** — einfache Tasks brauchen keinen

### `mail_reply`
- **Headline:** „[Absender] antworten"
- **Kontext:** Betreff der Original-Mail, Datum
- **Body:** TipTap-Editor, KI-Entwurf auto-generiert, Original-Mail darunter (kollabiert)
- **Primäraktion:** Mail senden → Todo als done → nächste Kachel
- Wiederverwendet exakt die Logik von `FocusBodyEmail` (kein Duplikat — eine Komponente)

### `followup`
- Wie `mail_reply`, aber `kind: 'followup'` für den KI-Draft

---

## Komponenten-Struktur

```
HeuteRoute                          ← neuer AppView 'focus' (überschreibt alten)
├── useHeuteQueue()                 ← Hook: baut sortierte Queue aus allen Stores
├── HeuteTile                       ← die eine große Kachel
│   ├── HeuteTileHeader             ← "DEIN NÄCHSTER ZUG" + Progress-Dots
│   ├── HeuteTileHeadline           ← Titel + Kontext-Text
│   ├── HeuteTileBody               ← switcht je nach type:
│   │   ├── TileBodyTodo            ← einfaches Abhaken
│   │   ├── TileBodyMail            ← TipTap + KI-Draft (ersetzt FocusBodyEmail)
│   │   └── TileBodyEvent           ← Info-only, kein Editor
│   └── HeuteTileFooter             ← Primär-Button | Cy neu | Überspringen
└── HeuteEmpty                      ← wenn Queue leer: "Alles erledigt für heute"
```

---

## Was wegfällt

| Entfernt | Ersetzt durch |
|----------|---------------|
| `FocusShell` (Kunden-Auswahl) | entfällt — Queue ist global |
| `FocusSessionView` (3-Panel-Layout) | `HeuteRoute` (1-Kachel-Layout) |
| `FocusWorkSurface` | `HeuteTile` |
| `FocusCustomerPanel` (linkes Panel) | entfällt |
| `FocusBatchSidebar` (rechtes Panel) | Progress-Dots in der Kachel |
| `FocusCockpitBar` (Tab-Bar unten) | entfällt |
| `FocusCorraChat` (CORRA-Panel im Focus) | entfällt (CORRA bleibt eigene Route) |
| `CorraLamp` | entfällt — KI-Draft läuft automatisch |
| `CockpitMailForm`, `CockpitTaskForm`, `CockpitInvoiceForm` | entfällt |

`FocusBodyEmail` wird zu `TileBodyMail` — gleiche Logik, ein Ort.  
`FocusHero` wird zu `HeuteTileHeadline` — vereinfacht.

---

## Was bleibt / nicht angefasst wird

- `CorraRoute` + `CorraChat` — eigene Route, wird separat redesigned
- Alle anderen App-Views (CRM, Finanzen, etc.)
- `generateCorraDraft()` — wird weiter genutzt
- `MailService.sendEmail()` — unverändert
- Alle Stores (`todos`, `invoices`, `mail`, `calendar`) — nur gelesen, nicht verändert

---

## Animations-Verhalten

- Kachel-Wechsel: `AnimatePresence` mit slide-out links / slide-in rechts
- KI-Draft lädt: Skeleton-Placeholder im Editor-Bereich
- "Erledigt": kurze Success-Animation (✓ aufleuchten) dann Übergang

---

## Offene Frage: CORRA-Integration

CORRA als ambient command center (großes zentriertes Input, Chat wandert nach unten-rechts, Response-Widgets in der Mitte) ist eine separate Roadmap-Feature. Wird in eigenem Spec behandelt. Der Heute-Cockpit arbeitet unabhängig davon — CORRA bleibt zunächst seine eigene Route.
