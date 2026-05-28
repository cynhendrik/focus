# Demo-Modus — Design Spec

**Datum:** 2026-05-28  
**Status:** Approved  
**Autor:** cynhendrik  

---

## Ziel

Die App soll auf Knopfdruck vollständig befüllt wirken — für Investor-Pitches und Kunden-Präsentationen. Kein echtes Supabase-Konto, kein Internet erforderlich. Alle Daten sind fiktiv und in-memory.

---

## Persona

**Workspace: „Cynera Consulting GmbH"**  
Strategische Unternehmensberatung, 8 Berater, DACH-Fokus. Hochpreisige Dienstleistungen: Strategie, Transformation, Workshops, Retainer.

---

## Architektur

### Ordnerstruktur

```
src/demo/
  data/
    customers.demo.ts     ← 55 Kunden (Unternehmensberatung, DACH)
    finance.demo.ts       ← Rechnungen, Angebote, KPIs
    mail.demo.ts          ← E-Mail-Accounts, Ordner, Nachrichten
    calendar.demo.ts      ← Events: Workshops, Strategy Calls, QBRs
    todos.demo.ts         ← Tasks & Checklisten
    notes.demo.ts         ← Meeting-Notes, Projekt-Notizen
    pipeline.demo.ts      ← Deals in verschiedenen Stages
    leads.demo.ts         ← 15 Leads im Trichter
    activities.demo.ts    ← Letzte Kundeninteraktionen
    crm.demo.ts           ← CRM-Einträge, Follow-ups
    workspace.demo.ts     ← Firma & Workspace-Metadaten
  demo.store.ts           ← isDemoMode Flag (Zustand)
  demo.loader.ts          ← befüllt alle Stores in einem Aufruf
```

### Demo Store (`demo.store.ts`)

```ts
interface DemoState {
  isDemoMode: boolean
  activateDemo: () => Promise<void>
  deactivateDemo: () => void
}
```

- `activateDemo()` ruft `demo.loader.ts` auf und setzt `isDemoMode = true`
- `deactivateDemo()` leert alle Stores und setzt `isDemoMode = false`, navigiert zum Login

### Demo Loader (`demo.loader.ts`)

Ruft `loadDemoData()` auf jedem Store auf, in definierter Reihenfolge:

```
workspace → auth (fake user) → customers → finance → mail →
calendar → todos → notes → pipeline → leads → activities → crm
```

### Store-Integration

Jeder betroffene Store bekommt eine `loadDemoData()`-Methode:

```ts
loadDemoData: () => {
  set({ customers: DEMO_CUSTOMERS, isLoading: false })
}
```

Bestehende `init()`-Methoden bleiben unverändert. Im Demo-Modus wird `init()` nicht aufgerufen.

---

## Demo-Daten

### Kunden (55 Stück)

Mix aus Status (`aktiv`, `lead`, `inaktiv`, `lost`) und Prioritäten (`high`, `normal`, `low`).  
Beispiele:
- Müller & Partner Holding AG — aktiv, high, Strategie-Retainer, München
- Bauer Logistik GmbH — aktiv, high, Transformationsprojekt, Hamburg
- Steiner Pharma SE — aktiv, normal, Compliance-Workshop, Frankfurt
- Hoffmann Digital GmbH — lead, normal, Angebot läuft, Berlin
- Krause Automotive GmbH — inaktiv, low, reaktivierbar, Stuttgart
- … 50 weitere mit vollständigen Feldern: Email, Telefon, Adresse, Tags, Goals, Notizen, LeadScore

### Finance

**Rechnungen (12):**
- Mix: `paid` (7), `open` (3), `overdue` (2)
- Betrag: €4.500 – €48.000
- Kunden aus der Kundenliste verknüpft

**Angebote (6):**
- 4 `sent`, 1 `draft`, 1 `suggestion` (KI-generiert)
- Betrag: €8.000 – €65.000

**KPIs:**
```ts
{
  mrr: 284000,
  openInvoicesTotal: 127500,
  overdueTotal: 23400,
  avgPaymentDays: 18,
  paymentRate: 0.94,
  topCustomer: 'Müller & Partner Holding AG',
}
```

### Mail

**Accounts (2):**
- `h.weber@cynera-consulting.de` (primär)
- `team@cynera-consulting.de` (team)

**Nachrichten (45):**
- Posteingang: Client-Requests, Projekt-Updates, Rechnungsbestätigungen
- Gesendet: Antworten, Angebote als Anhang
- Mix aus gelesen/ungelesen, einige verknüpft mit Kunden

### Kalender

**Events (20 im aktuellen Monat):**
- QBR Müller & Partner Holding AG
- Strategy Workshop Bauer Logistik (ganztägig)
- Onboarding Call Steiner Pharma
- Team-Retrospektive (intern)
- Executive Briefing Hoffmann Digital
- Angebotspräsentation Krause Automotive
- … weitere Meetings, Calls, Deadlines

### Tasks / Todos

**18 Todos:**
- „Q2 Report für Müller AG finalisieren" — high priority, fällig morgen
- „Angebot Hoffmann Digital nachfassen" — normal
- „Strategie-Deck für Steiner vorbereiten" — high
- „Team-Meeting vorbereiten" — normal
- … Mix aus offen, in Bearbeitung, erledigt

### Notes

**12 Notizen:**
- „Meeting-Protokoll: QBR Müller AG — 2026-05-15" (Markdown mit Stichpunkten)
- „Projektstatus: Transformation Bauer Logistik"
- „Ideen: Neues Beratungsprodukt Digital Readiness"
- … Mix aus Kunden-Notizen und internen Notes

### Pipeline

**8 Deals in 4 Stages:**
| Stage | Deals | Volumen |
|-------|-------|---------|
| Qualifizierung | 2 | €45.000 |
| Angebot | 3 | €138.000 |
| Verhandlung | 2 | €96.000 |
| Abschluss | 1 | €48.000 |

### Leads

**15 Leads:**
- Verschiedene Herkunft: Referral, LinkedIn, Konferenz, Website
- Mix aus warm/cold, mit letztem Kontakt-Datum und Score

### Activities

**30 Aktivitäten:**
- Calls, Emails, Meetings, Notizen — verknüpft mit Kunden
- Letzte 60 Tage

---

## UI

### Login-Screen

Unterhalb des Login-Formulars, abgetrennt durch eine `or`-Divider:

```
─────── oder ───────
[  ⚡ Demo starten →  ]   (outlined button, secondary)
```

Klick → `activateDemo()` → navigate to `/dashboard`

### Demo-Banner

Schmaler Balken am oberen Rand der App (über der Sidebar, unter dem Titlebar):

```
⚡ Demo-Modus  —  Alle Daten sind fiktiv und dienen nur zur Veranschaulichung.   [Beenden ×]
```

- Farbe: Amber (`bg-amber-500/10`, `border-amber-500/30`, Text `amber-700`)
- Höhe: ~32px, `text-xs`
- „Beenden ×" → `deactivateDemo()` → navigate to `/login`

---

## Was nicht im Demo-Modus funktioniert

- Schreibaktionen persistieren nicht über Session-Ende hinaus (Kunden anlegen etc. bleibt bis Reload)
- Mail-Sync und echte IMAP-Verbindung deaktiviert
- Supabase wird nicht aufgerufen
- Keine echten Dateianhänge in der Ablage

---

## Abgrenzung

- Kein separater Build erforderlich — dieselbe App
- Keine Änderungen an bestehenden Store-Interfaces
- Keine neuen Routen — alle bestehenden Routen funktionieren
- Demo-Daten sind rein TypeScript, kein DB-Seed, kein Netzwerk

---

## Out of Scope

- Interaktiver Demo-Guide / Onboarding-Tour
- Persistente Demo-Daten zwischen Sessions
- Demo-spezifische UI-Varianten (außer Banner + Login-Button)
