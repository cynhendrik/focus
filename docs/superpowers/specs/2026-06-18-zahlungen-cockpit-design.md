# Zahlungs-Journal + Geld-Cockpit (FOCUS) — Design

2026-06-18. Approved by Hendrik ("go").

## Ziel
Aus „bezahlt/offen" (binär) ein echtes Zahlungs-Journal machen → Teilzahlungen,
echtes offenes AR, und ein Einnahmen-/AR-Cockpit. Lokal-first (SQLite/Tauri).

## B1 — Zahlungs-Journal
- **Tabelle `payments`**: id, workspace_id, invoice_id (FK → invoices ON DELETE CASCADE),
  amount REAL, paid_at TEXT (YYYY-MM-DD), method TEXT?, note TEXT?, created_at TEXT.
  Migration v32 (CURRENT_VERSION 31→32) + schema.rs.
- **db/payment.rs**: Payment + CreatePaymentPayload; create, get_by_invoice,
  get_by_workspace, delete, total_paid(invoice_id). + Tests.
- **commands/payment.rs**: cmd_add_payment, cmd_get_payments(invoiceId),
  cmd_get_payments_by_workspace, cmd_delete_payment. In main.rs registriert.
- **Voll-bezahlt-Logik:** beim Anlegen einer Zahlung Summe prüfen; wenn ≥ invoice.total →
  invoice.status='paid' setzen (damit bestehende Filter greifen). Sonst Status unverändert.
- **Status abgeleitet (kein Enum-Umbau), invoice-status.ts:**
  paid (gezahlt≥total) / partly (0<gezahlt<total) / overdue (isOverdue) / open.
  + remaining(invoice, paid).
- **Frontend:** finance.service (add/get/getByWorkspace/delete); finance.store hält
  `payments: Payment[]`, lädt sie in loadAll; paidAmount/remaining pro Rechnung abgeleitet.
  PaymentModal (Betrag vorbelegt=Rest, Datum heute, Methode/Notiz optional). „Bezahlt"-Button →
  „Zahlung erfassen". Anzeige bezahlt/offen + Teilbezahlt-Chip. In FinanceRoute + FinanzPane.

## B2 — Cockpit (Finanzen → Übersicht erweitern)
- get_finance_kpis nutzt payments: cash_in_month (Σ Zahlungen lfd. Monat),
  open_total = Σ Restbeträge unbezahlt, overdue_total = Σ Rest überfällig, top debtors.
- UI: Kacheln „Diesen Monat eingegangen / Offenes AR / Überfällig / Top-Schuldner".

## Grenzen
- Kein „Raus"/Ausgaben (DATEV-Modul geparkt) → Einnahmen-/AR-Cockpit, kein voller Cashflow.
- Reihenfolge: B1 (mit Tests) → B2.
