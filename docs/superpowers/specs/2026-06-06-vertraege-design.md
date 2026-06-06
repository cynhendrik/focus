# Wiederkehrende Verträge — Design Spec
**Datum:** 2026-06-06
**Status:** Approved

---

## Was wir bauen

Wiederkehrende Rechnungsvorlagen ("Verträge") für Retainer-Kunden. Kein Vertragsdokument, kein PDF — nur eine interne Vorlage die automatisch Rechnungs-Entwürfe erstellt wenn das Abrechnungsdatum erreicht ist.

---

## Datenmodell

```ts
export type VertragStatus = 'active' | 'paused' | 'ended'
export type IntervalUnit  = 'days' | 'weeks' | 'months' | 'years'

export interface Vertrag {
  id:              string
  accountId:       string
  title:           string
  intervalValue:   number       // z.B. 1, 3, 6
  intervalUnit:    IntervalUnit // 'months' etc.
  startDate:       string       // ISO date — erster Abrechnungstag
  nextBillingDate: string       // ISO date — wann nächste Rechnung fällig
  endDate:         string | null
  status:          VertragStatus
  taxMode:         TaxMode      // aus finance.types
  notes:           string
  items:           VertragItem[]
  createdAt:       string
}

export interface VertragItem {
  title:     string
  quantity:  number
  unitPrice: number
  taxRate:   number
}
```

Persistenz: localStorage (`cynera-vertraege-v1`) — gleiche Pattern wie Aufträge.

---

## Auto-Erstellung

Beim App-Start und beim Öffnen des Finance-Tabs wird `checkAndCreateDueInvoices()` aufgerufen:

```
für jeden aktiven Vertrag:
  wenn nextBillingDate <= heute:
    createInvoice(vertrag) via FinanceService.createInvoice()
    nextBillingDate = nextBillingDate + interval
    (wiederholen bis nextBillingDate > heute — falls mehrere Perioden übersprungen)
  Toast: "X Rechnung(en) aus Verträgen erstellt (Entwurf)"
```

Die erstellten Rechnungen sind `status: 'draft'` und landen direkt in Finanzen → Rechnungen.

---

## UI

### Verträge-Tab in Finanzen

Neuer Tab neben "Rechnungen" und "Angebote". Zeigt alle Verträge als Karten:

```
[Retainer SEO-Beratung]          [AKTIV]
Müller GmbH · alle 1 Monate
2.000€ netto · nächste: 01.07.2026
[Bearbeiten] [Pausieren/Fortsetzen] [Löschen]
```

Status-Badges: `AKTIV` (lime), `PAUSIERT` (grau), `BEENDET` (grau)

### VertragForm Modal

Felder:
- **Kunde** — Dropdown aus accounts
- **Bezeichnung** — Freitext (z.B. "Retainer SEO")
- **Intervall** — Zahl-Input + Einheit-Dropdown (Tage / Wochen / Monate / Jahre)
- **Startdatum** — Date-Input (= erster Abrechnungstag = nextBillingDate initial)
- **Enddatum** — optional, Checkbox "Kein Enddatum"
- **Positionen** — gleiche Item-Struktur wie InvoiceForm (Titel, Menge, Preis, Steuer)
- **Notizen** — optional

### Kein separater Nav-Eintrag

Verträge leben als Tab in Finanzen, kein eigener Sidebar-Punkt.

---

## Dateistruktur

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `src/types/vertrag.types.ts` | Create | Typen: Vertrag, VertragItem, Payloads |
| `src/store/vertraege.store.ts` | Create | Zustand + localStorage, CRUD, checkAndCreate |
| `src/components/finance/VertragForm.tsx` | Create | Modal: Vertrag anlegen/bearbeiten |
| `src/components/finance/VertraegeTab.tsx` | Create | Tab-Inhalt: Karten-Liste + Neu-Button |
| `src/routes/FinanceRoute.tsx` | Modify | Neuer Tab "Verträge" + checkAndCreate beim Mount |

---

## Abgrenzung

- Kein PDF-Export für Verträge
- Keine E-Mail-Versendung aus dem Vertrag heraus (Rechnung wird als Entwurf erstellt, dann normal via Rechnungs-Flow versendet)
- Kein Unterschriften-Workflow
- Wenn App mehrere Tage nicht geöffnet war und 3 Perioden übersprungen wurden → alle 3 Rechnungen werden beim nächsten Start als Entwürfe erstellt
