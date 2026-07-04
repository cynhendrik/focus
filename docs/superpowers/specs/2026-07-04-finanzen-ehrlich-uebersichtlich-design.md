# Finanzen ehrlich & übersichtlich — Design

**Datum:** 2026-07-04
**Status:** Freigegeben (User-Review im Chat)
**Leitidee:** Ehrliche Zahlen, ein Blick genügt. Vier Bausteine, die dieselben
Ableitungen teilen, damit Dashboard, Liste und Cockpit sich nie widersprechen.

## Kontext / Probleme heute

1. **Rechnungsliste (FinanceRoute):** Filter-Chips ohne Zähler. Der
   „Überfällig"-Chip filtert auf `status === 'overdue'`, aber dieser Status
   wird nie gesetzt (Überfälligkeit wird aus `dueDate` abgeleitet) → Filter
   ist immer leer. „Offen" zeigt auch Überfällige — widerspricht den
   Cockpit-Kacheln, die sauber trennen (`FinanceRoute.tsx:452-453` vs. `:499-503`).
2. **Rechnungs-PDF (InvoicePDF):** Positionszeilen im englischen Zahlenformat
   („1200.00 €", Menge „2.5") via `toFixed(2)` (`InvoicePDF.tsx:224-226`),
   Summen darunter korrekt deutsch. Rechnungsnummer doppelt (unter Titel +
   Meta-Block). Meta-Reihenfolge unlogisch (Zahlungsziel vor Rechnungsdatum);
   „Zahlungsziel" redundant zu „Fällig am".
3. **Mein Tag „Geld unterwegs":** zeigt nur überfällige Rechnungen
   (`DashboardRoute.tsx:143-148`), klingt aber nach allen offenen Forderungen;
   nutzt `i.total` statt Restbetrag (Teilzahlungen ignoriert).
4. **Pipeline-Potenzial unsichtbar + ungepflegt:** Deal-Werte existieren im
   Modell, aber `convertToDeal` legt Deals hart mit `value: 0` an
   (`leads.store.ts:147`) und kein Dialog fragt nach einem Betrag → jede
   Potenzial-Anzeige wäre heute eine tote 0.

## Baustein 1 — Rechnungsliste: semantische Filter mit Zählern

Neue pure Lib **`src/lib/finance/invoice-filters.ts`**:

- `invoiceCategory(invoice): 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled'`
  — EINE Ableitung: `paid`/`cancelled`/`draft` aus Status; sonst `overdue`,
  wenn `isOverdue(invoice)` (bestehende Ableitung aus `lib/invoice-status`),
  sonst `open`.
- `invoiceFilterCounts(invoices)` → Zähler je Kategorie + `all`
  (= alles außer draft/cancelled, wie heutiges „Alle").

FinanceRoute nutzt beides: Chips zeigen „Offen 3 · Überfällig 1 · Bezahlt 12 ·
Storniert 2", Filterung und Cockpit-Kacheln laufen über dieselbe
`invoiceCategory`-Funktion. Verhalten von „Alle" bleibt (ohne Entwürfe/Stornos).

## Baustein 2 — PDF-Politur (InvoicePDF, ggf. OfferPDF)

- **Zahlenformat:** Positions-Einzelpreis und -Betrag über den vorhandenen
  de-DE-Formatter (wie die Summen); Menge deutsch mit bis zu 2 Nachkommastellen,
  ohne nachlaufende Nullen („2,5", „4"). Formatter als pure Funktionen
  (z. B. `src/lib/finance/pdf-format.ts`), von Invoice- und Offer-PDF geteilt,
  wenn OfferPDF dasselbe `toFixed`-Muster hat.
- **Nummern-Dublette:** Rechnungsnummer bleibt prominent unter dem
  „RECHNUNG"-Titel; der „RECHNUNGSNR."-Eintrag im Meta-Block entfällt.
- **Meta-Block:** Reihenfolge Rechnungsdatum → Leistungsdatum → Fällig am;
  „Zahlungsziel" entfällt (steckt in „Fällig am" und im Zahlungssatz).
- Bestehende PDF-Byte-Regressionstests bleiben grün; InvoicePreview (In-App)
  bekommt dieselbe Formatierung, falls sie das Muster teilt.

## Baustein 3 — Ehrliche Forderungs-Kachel auf Mein Tag

Neue pure Lib **`src/lib/finance/receivables.ts`**:

- `receivables(invoices, payments)` → `{ open: number, overdue: number }` —
  Restbeträge (`remaining` minus erfasster Zahlungen) aller nicht bezahlten,
  nicht stornierten, nicht Entwurf-Rechnungen; Aufteilung per `invoiceCategory`.
  Gesnoozte Rechnungen zählen mit (Snooze vertagt die Mahnung, nicht die
  Forderung) — Abweichung vom heutigen Dashboard-Verhalten, bewusst.

Dashboard-Kachel „GELD UNTERWEGS": Hauptwert = `open + overdue` (alle offenen
Forderungen), Unterzeile „davon X € überfällig" (nur wenn > 0), „hot"-Stil
weiterhin an Überfälligkeit gekoppelt. Klick auf die Kachel navigiert nach
Finanzen. FinanceRoute-Cockpit nutzt dieselbe Lib (ersetzt lokale
openTotal/overdueTotal-Memos).

## Baustein 4 — Pipeline-Potenzial

- **Anzeige:** viertes Puls-Segment „PIPELINE" auf Mein Tag = Summe der
  `value` aller offenen Deals (Stage weder `isWon` noch `isLost` — Auflösung
  über die Stage-Flags, nicht Namen). Pure Funktion
  `pipelinePotential(deals, stages)` in eigener Datei
  `src/lib/finance/pipeline-potential.ts`. Kein Stage-Gewichtungsfaktor
  (bewusst: Pseudo-Präzision).
- **Erfassung:** Optionales Feld „Geschätzter Auftragswert (€)" in
  QualifyModal und ConvertLeadChoice (nur im „Kunde + Deal"-Zweig).
  `convertToDeal` bekommt einen optionalen `value`-Parameter (Default 0 —
  bestehende Aufrufer unverändert). Leads selbst bekommen KEINEN Wert.

## Nicht in dieser Runde

Ausgaben/Belege-Modul, Bank-/Zahlungsabgleich, E-Rechnung eingehend,
Stage-gewichtete Forecasts, Wert-Nachpflege-UI für bestehende Deals
(Deal-Wert bleibt wie bisher über die Pipeline editierbar, falls vorhanden).

## Tests

TDD auf alle neuen puren Funktionen: `invoiceCategory`-Grenzfälle (heute
fällig = nicht überfällig; Teilzahlung ändert Kategorie nicht),
`invoiceFilterCounts`, `receivables` (Restbeträge, Storno/Entwurf/Bezahlt
ausgeschlossen), `pipelinePotential` (won/lost via Flags ausgeschlossen,
umbenannte Stages), PDF-Formatter (de-DE, Mengenformat). Bestehende Suiten
(PDF-Bytes, InvoicePreview, FinanceRoute-bezogene Tests) bleiben grün.
