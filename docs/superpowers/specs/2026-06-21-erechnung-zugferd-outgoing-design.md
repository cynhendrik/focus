# E-Rechnung (ZUGFeRD/Factur-X, ausgehend) — Design

**Datum:** 2026-06-21
**Branch:** `feature/erechnung-2026-06-21` (off `feature/v2-fixes-2026-06-18`)
**Verwandt:** [[erechnung-pflicht-missing]], [[product-assessment-2026-06]]

## Problem & Ziel

Cultera Focus erzeugt Rechnungen heute als reines Sicht-PDF (`@react-pdf/renderer` in `src/components/finance/InvoicePDF.tsx`) — **ohne eingebettetes XML, kein PDF/A-3**. Das ist keine strukturierte E-Rechnung. In DE gilt seit 2025 die B2B-E-Rechnungs-Pflicht (Empfang ab 2025, Versand gestaffelt ab 2027/2028; Kunden fordern strukturierte Rechnungen aber schon jetzt).

**Ziel dieser Scheibe (nur AUSGEHEND):** Jede ausgehende Rechnung wird ein **ZUGFeRD/Factur-X-Dokument** = PDF/A-3 mit eingebettetem **EN-16931-konformem CII-XML** (`factur-x.xml`). Mensch sieht eine normale PDF, Systeme lesen das XML.

**Format-Entscheidung (vom User):** ZUGFeRD/Factur-X, Profil EN 16931, **B2B**. Kein XRechnung/B2G in dieser Scheibe.

## Architektur

```
InvoiceWithItems + CompanyProfile + Account
        │
        ├─► cii-invoice.ts   → buildCiiXml(): EN16931 CrossIndustryInvoice (String)
        │      └─ vat-category.ts, unit-codes.ts, country-codes.ts, computeTaxRateGroups (vorhanden)
        │
        ├─► InvoicePDF.tsx (@react-pdf, jetzt mit EINGEBETTETEM TTF-Font) → Sicht-PDF-Bytes
        │
        └─► facturx-embed.ts (pdf-lib) → factur-x.xml als Associated File
                                         + XMP-Metadaten (PDF/A-3 + Factur-X EN16931)
                                         + sRGB-ICC-Profil + OutputIntent
                                         → ZUGFeRD-PDF/A-3 (Uint8Array)
```

`getInvoicePdfBytes()` in `InvoicePDF.tsx` orchestriert künftig: Sicht-PDF rendern → XML bauen → einbetten → fertige Bytes zurück. Aufrufer (`downloadInvoicePDF`, `batchExportInvoicesPDF`) bleiben unverändert.

### Neue Dateien
- `src/lib/erechnung/cii-invoice.ts` — `buildCiiXml(data, profile, account): string`
- `src/lib/erechnung/facturx-embed.ts` — `embedFacturX(pdfBytes, xml): Promise<Uint8Array>`
- `src/lib/erechnung/vat-category.ts` — USt-Kategorie-Mapping
- `src/lib/erechnung/unit-codes.ts` — Einheit→UN/ECE-Code
- `src/lib/erechnung/country-codes.ts` — Land-Freitext→ISO-3166-alpha-2
- `src/lib/erechnung/erechnung-readiness.ts` — Pflichtfeld-Check (Warnungen)
- Tests neben jeder Datei (`*.test.ts`).

### Neue Dependencies
- `pdf-lib` (PDF-Post-Processing: Anhang, XMP, OutputIntent).
- Ein freier TTF-Font (z. B. DejaVu Sans / Liberation Sans) als Asset unter `src/assets/fonts/` für die PDF/A-Font-Einbettung via `@react-pdf` `Font.register`.
- sRGB-ICC-Profil als Asset (klein, gemeinfrei) für den OutputIntent.

## CII-XML (EN 16931, Profil `urn:cen.eu:en16931:2017`)

`buildCiiXml` erzeugt ein `rsm:CrossIndustryInvoice` mit:
- **Kopf:** `ExchangedDocumentContext` (GuidelineSpecifiedDocumentContextParameter = EN16931-URN), `ExchangedDocument` (BT-1 Nr., BT-2 Datum `102`-Format, BT-3 Typcode `380`).
- **Verkäufer (BG-4):** Name, Postanschrift (Straße, PLZ, Ort, Land-ISO), **BT-31 USt-IdNr.** (`schemeID="VA"`) ODER **BT-32 Steuernummer** (`schemeID="FC"`).
- **Käufer (BG-7):** Name, Postanschrift, ggf. USt-IdNr.
- **Zahlung (BG-16):** `PaymentMeans` (Code `58` SEPA-Überweisung, IBAN BT-84), Zahlungsbedingungen (BT-9 Fälligkeit).
- **Positionen (BG-25):** je Position Name (BT-153), Menge + **Einheit-Code** (BT-130), Netto-Einzelpreis (BT-146), USt-Kategorie+Satz (BT-151/BT-152), Positions-Netto (BT-131).
- **USt-Aufschlüsselung (BG-23):** pro Kategorie+Satz: Basis, Steuerbetrag, Kategorie-Code, Satz (aus `computeTaxRateGroups` + Kategorie-Mapping).
- **Summen (BG-22):** LineTotal, TaxBasisTotal, TaxTotal (EUR), GrandTotal, DuePayable.
- Währung durchgängig EUR.

Beträge mit Punkt-Dezimaltrennzeichen, 2 Nachkommastellen. XML wird per String-Template + Escaping erzeugt (kein schweres XML-Lib nötig); ein kleiner `xmlEscape`-Helper.

## Mappings (Datenlücken)

- **USt-Kategorie** (`vat-category.ts`): `standard`/`reduced` → **`S`** (Satz vom Item); `reverse_charge` → **`AE`** (Satz 0, `ExemptionReason` §13b UStG); `kleinunternehmer` → **`E`** (Satz 0, `ExemptionReason` §19 UStG). Funktion: `vatCategory(taxMode, taxRate) → { code, rate, exemptionReason? }`.
- **Einheit** (`unit-codes.ts`): Freitext → UN/ECE-Rec-20-Code. Tabelle: std/stunde/stunden/h/hr → `HUR`; tag/tage/day → `DAY`; stk/stück/stueck/x/pauschale/stk. → `C62`; km → `KMT`; monat/monate → `MON`; leer/unbekannt → Fallback `C62`. Case-insensitiv, getrimmt.
- **Land** (`country-codes.ts`): Freitext → ISO-3166-alpha-2. Tabelle: deutschland/germany/de → `DE`; österreich/austria/at → `AT`; schweiz/switzerland/ch → `CH`; weitere gängige EU. Bereits 2-stelliger Code wird durchgereicht (uppercase). Fallback `DE`.

## Integration & Default-Verhalten

ZUGFeRD ist eine optisch normale PDF mit eingebettetem XML → **kein Nachteil, kein Toggle**. Jede Rechnungs-PDF wird künftig ZUGFeRD. `downloadInvoicePDF` und `batchExportInvoicesPDF` rufen unverändert `getInvoicePdfBytes`, das nun den hybriden Output liefert. Dateiname unverändert.

## Fehlerbehandlung / fehlende Stammdaten

`erechnung-readiness.ts` prüft die EN16931-Pflichtfelder, die aus Stammdaten kommen:
- Verkäufer: Name, Straße, PLZ, Ort, **USt-IdNr. ODER StNr.**
- Zahlung: IBAN
- Käufer: Name + Anschrift

`getInvoicePdfBytes` erzeugt das PDF **immer**, ruft aber `checkErechnungReadiness()` und gibt fehlende Felder zurück. `downloadInvoicePDF` zeigt bei Lücken eine **klare Warn-Toast** („E-Rechnung unvollständig: USt-IdNr./StNr. fehlt — in Einstellungen ergänzen"), statt still eine ungültige E-Rechnung zu erzeugen. Das PDF bleibt nutzbar.

## Design-/UI-Anpassung (an unser System)

- Font-Umstellung des PDFs auf den eingebetteten TTF muss das bestehende Layout (`InvoicePDF.tsx`) optisch erhalten — gleiche Größen/Gewichte; `Helvetica`/`Helvetica-Bold` → registrierte TTF-Familie mit `normal`/`bold`.
- Die Readiness-Warnung nutzt das vorhandene Toast-System (`useDownloadToastStore`/Toast), kein neues UI-Pattern.
- Keine neuen Screens; rein im bestehenden Rechnungs-Export-Flow.

## Tests

- **`cii-invoice.test.ts`** — Golden-/Struktur-Asserts für 4 Fälle: Standard 19 %, gemischte Sätze (19 % + 7 %), Reverse-Charge (AE), Kleinunternehmer (E). Prüft Schlüssel-BT-Werte (Nr., Summen, Kategorie-Codes, IBAN, Einheit-Codes), valides Well-formed-XML.
- **`vat-category.test.ts`**, **`unit-codes.test.ts`**, **`country-codes.test.ts`** — Mapping inkl. Fallbacks.
- **`facturx-embed.test.ts`** — Ergebnis-PDF enthält den Anhang `factur-x.xml`, ein XMP-Metadaten-Stream und einen OutputIntent (Asserts auf den pdf-lib-Strukturen / Byte-Suche nach `factur-x.xml` + `pdfaid`).
- **`erechnung-readiness.test.ts`** — fehlende Felder werden korrekt gemeldet; vollständige Daten → keine Warnung.
- **Manuell (User):** ein Muster-ZUGFeRD einmalig in einem kostenlosen Online-Validator (z. B. ZUGFeRD/Mustang-Validator) prüfen.

## Out of scope (bewusst)

- Eingehende E-Rechnungen (Empfang/Parsing) — eigenes Projekt, braucht erst ein Belege-Modul ([[belege-ausgaben-future]]).
- XRechnung / B2G / Leitweg-ID.
- In-App-Schematron-/veraPDF-Validator.
- E-Rechnung für Angebote.

## Erfolgskriterien

1. Rechnungs-Export erzeugt eine PDF, die ein eingebettetes `factur-x.xml` (EN16931-CII) enthält.
2. Das XML enthält korrekte Pflichtfelder für die 4 getesteten Steuerfälle (Standard, gemischt, Reverse-Charge, Kleinunternehmer).
3. Das PDF trägt PDF/A-3-/Factur-X-XMP-Metadaten + OutputIntent + eingebetteten Font.
4. Fehlen Pflicht-Stammdaten, erscheint eine klare Warnung statt einer still ungültigen Datei.
5. Bestehendes optisches Rechnungslayout bleibt erhalten; alle Tests grün.
6. Ein Muster validiert extern als gültiges ZUGFeRD (manueller User-Check).
