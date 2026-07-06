# Echtes @-Tagging im Projekt-Aufgaben-Formular

## Kontext

Nach dem Merge von „Projekt-Aufgaben anlegen + Mitarbeiter zuweisen" (2026-07-06) fragte der User, ob Mitarbeiter „getaggt" werden können — im Sinne des `@Name`-Tag-Systems, das in `TaskComposer`/`GlobalQuickComposer` bereits existiert (tippen von `@` öffnet ein Popover mit Mitgliedern/Kunden). Das gerade gebaute `NewTaskForm` (in `ProjectDetailRoute.tsx`) nutzt aktuell nur ein simples `<select>`-Dropdown — keine @-Tag-Interaktion.

**Recherche-Befund:** Das @-System ist in seinen Kern-Bausteinen editor-unabhängig (`task-mentions.ts`, `MentionPopover.tsx`s `extractMentionQuery`/`useMentionPopoverState`, `TaskMentionPopover.tsx` als reine Präsentationskomponente) — nur die Cursor-Positions-Berechnung und das Text-Einfügen sind fest an Tiptap/ProseMirror gekoppelt (in `TaskComposer.tsx`/`GlobalQuickComposer.tsx`, nicht in den geteilten Dateien selbst). Für ein normales `<input>`-Feld (kein Rich-Text-Editor) braucht es eigene, kleinere Ersatz-Logik für Cursor-Position und Text-Splicing — die geteilten Bausteine selbst werden unverändert wiederverwendet.

**Nutzer-Entscheidung:** Das bestehende Dropdown wird komplett ersetzt (nicht zusätzlich angeboten) — ein Titel-Feld, `@Name` tippen zum Zuweisen, konsistent mit dem Rest der App.

## Entwurf

### A. Neue, kleine Logik-Datei: `src/components/tasks/plain-input-mention.ts`

Reine, testbare Hilfsfunktionen für @-Tagging in einem normalen `<input>` (keine Tiptap-Abhängigkeit):

```typescript
export interface ResolvedInputMention { marker: string; id: string }

/** Fuegt den gewaehlten Marker ("@Klara ") an Stelle des "@query"-Tokens ein. */
export function insertMentionMarker(
  value: string, startOffset: number, cursorOffset: number, marker: string,
): { value: string; cursor: number } {
  const before = value.slice(0, startOffset)
  const after = value.slice(cursorOffset)
  const inserted = `${marker} `
  return { value: `${before}${inserted}${after}`, cursor: before.length + inserted.length }
}

/**
 * Entfernt aufgeloeste "@Marker"-Tokens aus dem Text und liefert die zugehoerige
 * assigneeId (letzter Treffer gewinnt -- gleiche Konvention wie parseTaskText).
 * Bewusst NICHT der volle prefix-parser (kein !!/~30m/#tag/Datum) -- dieses
 * Formular hat nur ein Titel-Feld, keine der anderen Kurzsyntax-Funktionen.
 */
export function stripResolvedMentions(
  text: string, mentions: ResolvedInputMention[],
): { cleanTitle: string; assigneeId?: string } {
  const mentionMap = new Map(mentions.map(m => [m.marker.toLowerCase(), m.id]))
  let assigneeId: string | undefined
  const parts = text.split(/\s+/).filter(Boolean).filter(token => {
    if (token.toLowerCase().startsWith('@')) {
      const id = mentionMap.get(token.toLowerCase())
      if (id) { assigneeId = id; return false }
    }
    return true
  })
  return { cleanTitle: parts.join(' '), assigneeId }
}

/**
 * Anker-Position (Pixel) fuer das Popover unterhalb des Cursors in einem
 * normalen Input -- per Canvas-Textmessung statt ProseMirror-coordsAtPos
 * (das gibt es nur im Rich-Text-Editor). Faellt auf die linke Feldkante
 * zurueck, wenn Canvas nicht verfuegbar ist (z.B. in Tests).
 */
export function getInputCaretAnchor(input: HTMLInputElement): { top: number; left: number } {
  const rect = input.getBoundingClientRect()
  const style = window.getComputedStyle(input)
  const paddingLeft = parseFloat(style.paddingLeft) || 0
  let offsetX = 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    offsetX = ctx.measureText(input.value.slice(0, input.selectionStart ?? 0)).width
  }
  return { top: rect.bottom + 4, left: rect.left + paddingLeft + offsetX }
}
```

`insertMentionMarker`/`stripResolvedMentions` sind reine Funktionen → eigene Tests (Muster: `task-mentions.test.ts`/`prefix-parser.test.ts` existieren bereits im selben Ordner). `getInputCaretAnchor` bekommt keinen dedizierten Test — DOM-Koordinaten-Berechnung wird in dieser Codebasis nirgends unit-getestet (auch `editor.view.coordsAtPos` in den bestehenden Composern nicht), Verifikation über den manuellen Smoke-Test.

### B. `NewTaskForm` in `ProjectDetailRoute.tsx` umgebaut

Ersetzt Titel-Input + Dropdown durch ein einzelnes Titel-Input mit @-Tagging, verdrahtet mit den bereits bestehenden geteilten Bausteinen `useMentionPopoverState`, `extractMentionQuery`, `buildTaskMentionCandidates` (mit leerem `accounts`-Array, damit nur Mitglieder als Kandidaten erscheinen — Kunden-Tagging ergibt hier keinen Sinn, der Kunde ist durch das Projekt schon fix), `markerForTask`, `filterTaskCandidates`, `TaskMentionPopover`.

Tippt der Nutzer `@Klara` und wählt aus dem Popover (Klick oder Pfeiltasten+Enter), wird `@Klara ` in den sichtbaren Text eingefügt (wie in den bestehenden Composern) und die Zuordnung `{marker: '@Klara', id: <memberId>}` gemerkt. Beim Absenden wird der Marker aus dem finalen Titel entfernt und die `assigneeId` daraus extrahiert — der gespeicherte Titel enthält kein sichtbares `@Klara` mehr (gleiches Verhalten wie die bestehenden Composer).

### C. Verhalten unverändert

- Aufgabe wird weiterhin immer der aktuellen Projekt-Phase zugeordnet (keine Änderung an `handleCreateTask`s `projectPhaseId`-Logik).
- „— Niemand —"-Fall: kein `@`-Tag getippt → `assigneeId` bleibt `undefined`, Aufgabe wird unzugewiesen angelegt (identisch zum bisherigen Dropdown-Verhalten).
- Solo-Workspaces (keine Mitglieder): Kandidatenliste ist leer, Popover öffnet sich bei `@` nie (kein leeres Popover) — das Titel-Feld funktioniert unverändert als reines Textfeld.

## Nicht im Scope

- Kein Kunden-Tagging in diesem Formular (Kunde ist durch das Projekt fix vorgegeben).
- Keine der übrigen Kurzsyntax-Funktionen aus `prefix-parser.ts` (Priorität `!!`, Dauer `~30m`, Tags `#tag`, weiche Datums-Erkennung) — dieses Formular bleibt bewusst auf Titel+Zuweisung beschränkt.
- Keine Extraktion einer wiederverwendbaren „Plain-Input-Mention"-React-Komponente für andere Formulare — aktuell nur ein Konsument (`NewTaskForm`); Wiederverwendung erst bei einem zweiten echten Bedarfsfall.

## Akzeptanzkriterien

- Im „Neue Aufgabe"-Feld öffnet `@` ein Popover mit Mitgliedern (keine Kunden), gefiltert nach Tipptext.
- Auswahl per Klick oder Pfeiltasten+Enter fügt `@Vorname` sichtbar ein; beim Absenden verschwindet der Marker aus dem gespeicherten Titel, die Aufgabe wird dem gewählten Mitglied zugewiesen.
- Ohne `@`-Tag bleibt die Aufgabe unzugewiesen (identisches Verhalten zum bisherigen „— Niemand —").
- `npx vitest run` und `npx tsc --noEmit` bleiben grün; neue Tests für `insertMentionMarker`/`stripResolvedMentions`.
