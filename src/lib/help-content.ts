import type { AppView } from '@/store/ui.store'
import { useTourStore } from '@/store/tour.store'

export interface HelpEntry { title: string; body: string; view?: AppView; action?: () => void }
export interface HelpCategory { id: string; label: string; entries: HelpEntry[] }

/** Kurze Erklärungen aller Funktionen — Quelle für den HelpDrawer. */
export const HELP_CONTENT: HelpCategory[] = [
  {
    id: 'erste_schritte', label: 'Erste Schritte',
    entries: [
      { title: 'Tour wiederholen', body: 'KORA führt dich noch einmal durch die App.', action: () => useTourStore.getState().start() },
    ],
  },
  {
    id: 'kunden', label: 'Kunden & Kontakte',
    entries: [
      { title: 'Kunden anlegen', body: 'Lege Firmen und Personen an, pflege Status, Priorität, Tags und Kontaktdaten. Jeder Kunde hat eine eigene Akte mit Aktivitäten, Notizen, Dateien und Finanzen.', view: 'clients' },
      { title: 'Aktivitäten-Timeline', body: 'In der Kundenakte siehst du unter „Aktivitäten" die komplette Historie: Mails, Calls, Notizen, Aufgaben und KPIs auf einen Blick.', view: 'clients' },
    ],
  },
  {
    id: 'notizen', label: 'Notizen',
    entries: [
      { title: 'Notizen festhalten', body: 'Schreibe freie Notizen — global oder direkt an einem Kunden. Ideal für Gesprächsnotizen und Ideen.', view: 'notes' },
    ],
  },
  {
    id: 'aufgaben', label: 'Aufgaben & Aktivitäten',
    entries: [
      { title: 'Aufgaben erstellen', body: 'Lege To-dos mit Priorität, Fälligkeit und Buckets (Heute/In Arbeit) an. Per ⌘⇧N schnell erfassen.', view: 'dashboard' },
      { title: 'Heute-Cockpit', body: 'Die „Heute"-Ansicht bündelt fällige Aufgaben, Mails und Follow-Ups als priorisierte Queue.', view: 'dashboard' },
    ],
  },
  {
    id: 'leads', label: 'Leads & Pipeline',
    entries: [
      { title: 'Leads qualifizieren', body: 'Erfasse Leads, qualifiziere oder disqualifiziere sie und wandle sie in Deals um.', view: 'leverage_leads' },
      { title: 'Pipeline', body: 'Ziehe Deals durch deine Pipeline-Stufen bis zum Abschluss (Won/Lost).', view: 'leverage_pipeline' },
    ],
  },
  {
    id: 'finanzen', label: 'Rechnungen & Angebote',
    entries: [
      { title: 'Rechnung schreiben', body: 'Erstelle Rechnungen mit Positionen, exportiere als PDF und verwalte das Mahnwesen bei Überfälligkeit.', view: 'invoices' },
      { title: 'Angebote', body: 'Schreibe Angebote und überführe sie bei Annahme direkt in eine Rechnung.', view: 'invoices' },
    ],
  },
  {
    id: 'zeit', label: 'Zeiterfassung',
    entries: [
      { title: 'Zeit erfassen', body: 'Erfasse Arbeitszeiten pro Kunde/Auftrag mit Timer und rechne Aufträge stundenbasiert ab.', view: 'zeitmanagement' },
    ],
  },
  {
    id: 'mail', label: 'Mail',
    entries: [
      { title: 'Postfach verbinden', body: 'Binde dein IMAP-Postfach ein und bearbeite Mails direkt in der App — verknüpft mit Kunden.', view: 'posteingang' },
    ],
  },
  {
    id: 'kalender', label: 'Kalender',
    entries: [
      { title: 'Termine', body: 'Plane Termine und sieh sie im Kalender; verknüpfe sie mit Kunden und Aufgaben.', view: 'calendar' },
    ],
  },
  {
    id: 'corra', label: 'Corra / KI',
    entries: [
      { title: 'KORA KI-Assistent', body: 'KORA bereitet dir vor jedem Call ein KI-Briefing und priorisiert deinen Tag. Öffne ihn über die Seitenleiste (⌘K).', view: 'corra' },
    ],
  },
  {
    id: 'dateien', label: 'Dateien & Ablage',
    entries: [
      { title: 'Dateien ablegen', body: 'Lege Dokumente pro Kunde ab und nutze die Workspace-Ablage für rechnungsbezogene PDFs.', view: 'clients' },
    ],
  },
]
