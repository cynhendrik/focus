# Projekt-Detail: Phase löschen + Notiz hinzufügen

## Kontext

Nutzer-Feedback nach dem ersten Ausprobieren von „Projekte" (2026-07-06): drei konkrete Lücken — keine Phase löschbar, keine Notiz hinzufügbar, kein Bild-Upload fürs Moodboard. Diese Spec deckt die ersten zwei ab (beide unstrittig, reines UI-Wiring auf bereits bestehender Datenschicht). Das Moodboard/Bild-Upload ist bewusst ausgeklammert — dafür existiert aktuell **kein Cloud-Speicher-Pfad** (beide vorhandenen Datei-Systeme sind rein lokal, keine Projekt-Verknüpfung), das ist eine echte Architektur-Entscheidung, die noch mit dem User geklärt werden muss, bevor daran gebaut wird.

## A. Phase löschen

**Backend existiert bereits vollständig:** `useProjectsStore().deletePhase(id, projectId): Promise<void>` blockt serverseitig das Löschen der aktuellen Phase (wirft einen Fehler). Tasks/Notizen, deren `projectPhaseId` auf eine gelöschte (nicht-aktuelle) Phase zeigte, werden dabei weder gelöscht noch umgehängt — sie werden einfach unsichtbar in der aktuellen Phasen-Ansicht (kein Absturz, akzeptierter Zustand für diese Runde, wie schon beim Rest der Phasen-Logik).

**UI:** Im `Stepper` bekommt jede NICHT-aktuelle Phase ein kleines Lösch-Icon (Papierkorb, `lucide-react` `Trash2`) unter dem Phasennamen. Klick → Zwei-Klick-Bestätigung inline (Muster: `DealModal.tsx`s `confirmDelete`-State, hier pro Phase im `Stepper` selbst verwaltet, da mehrere Phasen gleichzeitig gerendert werden). Die aktuelle Phase bekommt kein Lösch-Icon (Backend würde es ohnehin ablehnen — UI zeigt die Option gar nicht erst an, statt einen Fehler zu produzieren).

Ein fehlgeschlagener Löschversuch (z.B. Race-Condition in einem geteilten Workspace, wenn sich `current_phase_id` zwischenzeitlich geändert hat) zeigt eine kurze Fehlermeldung unterhalb des Steppers.

## B. Notiz hinzufügen

**Backend existiert bereits vollständig:** `Activity`/`CreateActivityPayload.projectId` funktioniert für `type: 'note'` genauso wie für `type: 'task'` (verifiziert bis in die SQL-Schicht). Die Notiz-Erstellung läuft über `useActivitiesStore().create(payload): Promise<void>` — denselben Weg, den `ActivityModal.tsx` (Kunden-Notizen) bereits nutzt, hier zusätzlich mit `projectId: project.id`.

**UI:** Inline-Formular im Notizen-Panel (Muster: `NewPhaseForm`/`NewTaskForm` — Textarea statt Input, da Notizen mehrzeilig sind, kein `@`-Tagging). Nach dem Anlegen wird die Aktivitäten-Liste neu geladen (bestehendes `refreshActivities`), die neue Notiz erscheint sofort oben in der Liste.

## Nicht im Scope

- Moodboard/Bild-Upload — zurückgestellt, echte Architektur-Entscheidung (lokal-only vs. Cloud-Speicher-Aufbau) offen.
- Bearbeiten/Löschen bestehender Notizen (nur Anlegen in dieser Runde).
- Umhängen von Aufgaben/Notizen einer gelöschten Phase auf eine andere Phase (das „Verwaisen" wird akzeptiert, siehe oben).

## Akzeptanzkriterien

- Jede nicht-aktuelle Phase im Stepper hat ein Lösch-Icon mit Zwei-Klick-Bestätigung; die aktuelle Phase hat keins.
- Ein fehlgeschlagener Löschversuch zeigt eine sichtbare Fehlermeldung, keine stille Fehlfunktion.
- Im Notizen-Panel kann eine neue, mehrzeilige Notiz angelegt werden; sie erscheint sofort in der Liste.
- `npx vitest run` und `npx tsc --noEmit` bleiben grün.
