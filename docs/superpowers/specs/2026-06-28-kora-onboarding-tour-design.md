# KORA-Erststart-Tour mit flüchtigen Fake-Daten — Design-Spec

**Datum:** 2026-06-28
**Branch-Kontext:** `feature/erechnung-2026-06-21` (= aktueller Default-Stand nach FF-Merge)
**Status:** Design freigegeben (User-Entscheidungen unten), bereit für Plan

## Problem / Ziel

Ein neuer Nutzer landet nach dem Login in einem **leeren** Workspace (0/0/0-Dashboard, CORRA-Queue rendert bei leer gar nicht, keine Daten → KORA kann seinen Wert nicht zeigen → Churn am Tag 1, siehe [[launch-fixes-2026-06-28]]). Ziel: **KORA führt einmalig durch die App, mit temporären Schau-Daten, die am Ende der Führung verschwinden** — kein separater Demo-Workspace, kein „Fake-Kunden selbst löschen". Danach steht der Nutzer im sauberen, leeren Workspace und weiß, was wo hingehört.

## Getroffene Entscheidungen (User)

| Frage | Entscheidung |
|---|---|
| Form | **Geführte Tour mit flüchtigen Fake-Daten** (NICHT separater Demo-Workspace, NICHT Auto-Seed in echte Daten, NICHT Demo-Video). |
| Flüchtigkeit | Fake-Daten leben **nur im Speicher** (Stores direkt gesetzt, **nie** über Gateways → nichts in SQLite/Cloud). Tour-Ende → verworfen, echte (leere) Daten geladen. **Nichts zu löschen.** |
| Start | **Angeboten, nicht erzwungen**: beim 1. Login eine Karte „KORA zeigt dir die App (2 Min)" mit Start/Später. Später über Hilfe „Tour wiederholen". |
| Tiefe | **Voll, 5 Stopps**: Dashboard → Kunde (geöffnete Akte) → Finanzen → Leads → KORA. |
| KORA-Text | **Geskriptet** (feste Texte pro Stopp, kein Live-KI-Call). |
| „Spotlight" | Abgedunkelter Hintergrund + KORA-Sprechblase pro Bereich; **kein** pixelgenaues Element-Cutout (v1). |

## Bestands-Fakten (verifiziert 2026-06-28)

- Erststart-Sequenz nach Auth (`App.tsx`): Splash → (Login) → WorkspacePicker → NamePrompt → WelcomeIntro → CompanyStep → OnboardingCard. Onboarding-State in `onboarding.store.ts` (`welcomeSeen`, `companyDone`, `bootstrapped`). **Die Tour reiht sich NACH dieser Sequenz ein.**
- Workspace-Lade-Effekt `App.tsx:165-208`: lädt bei `activeWorkspaceId` zwei Wellen (init/customers/crm/calendar/todos + idle: pipeline/leads/deals/members/verträge). Feuert nur bei Änderung von `activeWorkspaceId` + (stabilen) Load-Fns. → bei stehender Auswahl kein erneutes Feuern.
- Realtime (`useWorkspaceRealtime`) ist **nur in geteilten** Workspaces aktiv (`if (!isShared) return`). Ein frischer lokaler Workspace hat **kein** Realtime → keine Fremd-Überschreibung der Fixtures.
- Stores, die die Tour-Stopps füllen: `accounts.store`/`customers.store` (Kunden+Leads), `todos.store` (Aufgaben), `finance.store` (Rechnungen/KPIs), `leads.store`+`pipeline.store` (Pipeline), `crm.store` (Follow-ups/Timeline). Alle setzen ihren State per `useXStore.setState(...)` direkt setzbar (zustand).
- Empty-States heute: Clients/Tasks/Journal haben CTAs; **Dashboard (0/0/0, Queue rendert bei leer nicht), Leads („Leer"), Finanzen (kein CTA)** fehlen brauchbare Empty-States.
- Default `appView='dashboard'`; Navigation per `useUiStore.setAppView` / `openCustomerAt(id, tab)`.

## Design

### 1. `tour.store.ts` (Zustandsmaschine)
```ts
interface TourState {
  active: boolean
  step: number            // 0..STOPS.length-1
  seen: boolean           // persistiert → Angebot nur 1×
  offer: () => void       // zeigt die Angebots-Karte (wenn !seen)
  start: () => void       // active=true, step=0, Fixtures rein, tourMode an
  next: () => void
  prev: () => void
  skip: () => void        // = finish (seen=true)
  finish: () => void      // active=false, Fixtures raus, echte Daten laden, seen=true
}
```
Persistiert wird nur `seen` (`partialize`). `active`/`step` sind transient.

### 2. Tour-Fixtures (`src/lib/tour/fixtures.ts`)
Typkonforme Schau-Daten (echte Store-Typen, damit die Ansichten normal rendern):
- **3 Kunden + 1 Lead** (`Account`/`Customer`): 1 aktiver Kunde mit bezahlter Rechnung, 1 Kunde mit **überfälliger** Rechnung, 1 normaler Kunde, 1 Lead in einer Pipeline-Phase.
- **2–3 Aufgaben** (`Todo`): 1 heute fällig, 1 überfällig, 1 erledigt.
- **2 Rechnungen** (`Invoice`): 1 bezahlt, 1 überfällig (→ Dashboard-Umsatz + Mahnwesen leuchten).
- **1–2 Timeline-/Follow-up-Einträge** für die geöffnete Kundenakte.
Alle IDs mit erkennbarem Präfix (`tour-…`). Reine Datenobjekte, keine Seiteneffekte.

### 3. Fixture-Injektion/Verwerfen (`src/lib/tour/apply.ts`)
- `applyTourFixtures()`: setzt die relevanten Stores **direkt** (`useAccountsStore.setState`, `useTodosStore.setState`, `useFinanceStore.setState`, `useLeadsStore.setState`, `useCrmStore.setState`) auf die Fixtures. **Kein** Gateway-Aufruf → nichts wird persistiert.
- `clearTourFixtures(workspaceId)`: setzt die Stores leer und stößt die **echten** Lade-Funktionen an (die in einem frischen Workspace leer zurückkommen).
- **Kritische Eigenschaft (getestet):** zwischen `apply` und `clear` wird **kein** Gateway-`create/upsert/update` aufgerufen → garantiert nichts auf der Platte.

### 4. Lade-Unterdrückung während der Tour (das Risiko)
Der Workspace-Lade-Effekt (`App.tsx:165-208`) darf die Fixtures nicht überschreiben. Lösung: am Anfang des Effekts `if (useTourStore.getState().active) return`. Da der Effekt ohnehin nur bei `activeWorkspaceId`-Wechsel feuert und die Tour die Auswahl nicht ändert, ist das primär defensiv — wird aber als eigener, getesteter Schritt behandelt. `finish()` ruft danach die echten Loads (über `clearTourFixtures`).

### 5. `TourGuide`-Overlay (`src/components/tour/TourGuide.tsx`)
Global in `App.tsx` gemountet; rendert nur wenn `active`. Step-Liste `STOPS`:
| # | View-Aktion | KORA-Text (geskriptet, gekürzt) |
|---|---|---|
| 0 | `setAppView('dashboard')` | „Das ist dein Tag — Umsatz, fällige Aufgaben, meine Queue." |
| 1 | `openCustomerAt(tourCustomerId,'verlauf')` | „Die Kundenakte: Timeline, Aufgaben, Notizen, Finanzen an einem Ort." |
| 2 | `setAppView('invoices')` | „Finanzen: Rechnungen, Angebote, Mahnwesen — die rote ist überfällig." |
| 3 | `setAppView('leverage_leads')` | „Akquise: Leads wandern durch die Phasen." |
| 4 | `setAppView('corra')` | „Und ich bin immer hier — frag mich nach deinem Tag. Jetzt du!" |
Pro Stopp: abgedunkelter Backdrop + KORA-Sprechblase (Avatar/Stil wie KORA) mit Text + **Weiter/Zurück/Überspringen** + Fortschritt (z. B. „2/5"). Letzter Stopp: Button „Los geht's" → `finish()`. Navigation macht die Tour selbst beim Step-Wechsel.

### 6. Angebots-Karte (`src/components/tour/TourOfferCard.tsx`)
Nach der Onboarding-Sequenz, wenn `!seen && !active`: dezente Karte/Modal „KORA zeigt dir die App (2 Min)" mit **Start** (→ `start()`) und **Später** (→ `finish()`-ohne-Tour, setzt `seen`). Mountet in `App.tsx` nach `OnboardingCard`.

### 7. Echte Empty-States (Teil A — der „jetzt du"-Zustand nach der Tour)
- **Dashboard:** statt 0/0/0 ohne Aktion → eine „Leg los"-Karte mit Buttons „Ersten Kunden anlegen" / „Tour wiederholen"; die CORRA-Queue bekommt einen echten Leer-Hinweis statt gar nichts.
- **Leads:** leere Spalte „Leer" → „Ersten Lead anlegen"-CTA.
- **Finanzen:** leere Liste → „Erste Rechnung"-CTA (rollenabhängig wie bestehend).

### 8. „Tour wiederholen"
Eintrag im Hilfe-Drawer (`help-content`), ruft `useTourStore.getState().start()`.

## Edge-Cases
- **Tour in geteiltem Workspace gestartet:** Realtime ist aktiv → könnte Fixtures überschreiben. Lösung: Tour-Angebot nur im **frischen/leeren** Kontext zeigen; `start()` ist robust, aber die Lade-Unterdrückung (§4) deckt den Effekt ab. Realtime-Events auf einem leeren Workspace sind unwahrscheinlich; falls doch, ist der Schaden rein visuell (verschwindet bei finish). Akzeptiert für v1.
- **Abbruch (App-Schließen mitten in der Tour):** Fixtures sind nur im Speicher → beim Neustart weg; `seen` ist evtl. noch false → Angebot kcommt erneut. Akzeptiert.
- **Nutzer hat schon echte Daten** (kehrt zurück, klickt „Tour wiederholen"): Tour überschreibt die Ansicht temporär mit Fixtures; `finish` lädt die **echten** Daten neu zurück. Echte Daten werden nie angefasst (kein Gateway-Write).

## Tests
- `tour.store`: `start`→active/step0; `next/prev` Grenzen; `skip/finish`→active=false, seen=true.
- **Flüchtigkeit (kritisch):** `applyTourFixtures` füllt Stores; **kein** Gateway-`create/upsert` wird gerufen (Gateways gemockt, Aufrufzahl 0); `clearTourFixtures` leert + ruft echte Loads.
- Lade-Effekt: bei `active` überspringt der Workspace-Load (Fixtures bleiben).
- `TourGuide`: rendert bei `active`, zeigt den Text des aktuellen Steps, „Weiter" erhöht step + navigiert (setAppView gerufen), letzter Step „Los geht's" → finish.
- `TourOfferCard`: sichtbar bei `!seen`, „Start"→`start`, „Später"→`seen=true` ohne Tour.
- Empty-States: Dashboard/Leads/Finanzen rendern bei leer einen CTA.

## Bewusst NICHT im Scope
Separater Demo-Workspace, Auto-Seed in echte Daten, Demo-Video, Live-KI-Erzählung, pixelgenaues Element-Spotlight, Mehrsprachigkeit der Tour-Texte, A/B-Varianten. Keine DB-/Cloud-Änderung. (Die tiefere „KORA handelt"-Führung kommt mit der KORA-Sekretärin separat.)
