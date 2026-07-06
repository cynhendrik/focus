# Echtes @-Tagging im Projekt-Aufgaben-Formular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<select>` assignee dropdown in the project task-creation form with the same `@Name`-tagging interaction already used elsewhere in the app (`TaskComposer`/`GlobalQuickComposer`), reusing the existing editor-agnostic mention building blocks.

**Architecture:** A new small, pure-function file (`plain-input-mention.ts`) supplies the logic a plain `<input>` needs that a Tiptap editor normally provides for free (caret pixel position, text splicing). `NewTaskForm` in `ProjectDetailRoute.tsx` is rewired to use this plus the already-existing shared mention components (`MentionPopover.tsx`, `task-mentions.ts`, `TaskMentionPopover.tsx`) unchanged.

**Tech Stack:** React/TypeScript, plain DOM `<input>` + Canvas 2D text measurement (no Tiptap/ProseMirror).

## Global Constraints

- Member-only tagging — `buildTaskMentionCandidates(members, [])` (empty accounts array) so no customer candidates ever appear; the project's customer is already fixed and not user-selectable here.
- No other short-syntax features (`!!` priority, `~30m` duration, `#tag`, soft dates) — this form stays title+assignee only, matching `prefix-parser.ts`'s full feature set being explicitly out of scope.
- The existing shared mention files (`MentionPopover.tsx`, `task-mentions.ts`, `TaskMentionPopover.tsx`) are reused as-is, unmodified — do not change their exported signatures.
- `getInputCaretAnchor` must not throw when `canvas.getContext('2d')` returns `null` (e.g. in a test environment without canvas support) — falls back to the input's left edge.
- `npx tsc --noEmit` and `npx vitest run` (895 pre-existing + new tests from this plan) must stay green after every task.

---

### Task 1: `plain-input-mention.ts` — pure logic + tests

**Files:**
- Create: `src/components/tasks/plain-input-mention.ts`
- Test: `src/components/tasks/plain-input-mention.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `insertMentionMarker(value: string, startOffset: number, cursorOffset: number, marker: string): { value: string; cursor: number }`, `stripResolvedMentions(text: string, mentions: ResolvedInputMention[]): { cleanTitle: string; assigneeId?: string }`, `getInputCaretAnchor(input: HTMLInputElement): { top: number; left: number }`, and the `ResolvedInputMention { marker: string; id: string }` interface — all consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `src/components/tasks/plain-input-mention.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { insertMentionMarker, stripResolvedMentions } from './plain-input-mention'

describe('insertMentionMarker', () => {
  it('inserts the marker at the end of the text', () => {
    const result = insertMentionMarker('Hallo @kla', 6, 10, '@Klara')
    expect(result).toEqual({ value: 'Hallo @Klara ', cursor: 13 })
  })

  it('inserts the marker mid-text and preserves trailing content', () => {
    const result = insertMentionMarker('@kl, bitte', 0, 3, '@Klara')
    expect(result).toEqual({ value: '@Klara , bitte', cursor: 7 })
  })
})

describe('stripResolvedMentions', () => {
  it('strips a single resolved mention and returns its id', () => {
    const result = stripResolvedMentions('Website Texte pruefen @Klara', [{ marker: '@Klara', id: 'm1' }])
    expect(result).toEqual({ cleanTitle: 'Website Texte pruefen', assigneeId: 'm1' })
  })

  it('returns the title unchanged when there are no mentions', () => {
    const result = stripResolvedMentions('Rechnung schreiben', [])
    expect(result).toEqual({ cleanTitle: 'Rechnung schreiben', assigneeId: undefined })
  })

  it('leaves an unresolved @-token untouched as literal text', () => {
    const result = stripResolvedMentions('Kontakt @Someone anrufen', [])
    expect(result).toEqual({ cleanTitle: 'Kontakt @Someone anrufen', assigneeId: undefined })
  })

  it('the last matching mention wins when multiple are present', () => {
    const result = stripResolvedMentions('@Klara @Tom Zusammenfassung', [
      { marker: '@Klara', id: 'm1' },
      { marker: '@Tom', id: 'm2' },
    ])
    expect(result).toEqual({ cleanTitle: 'Zusammenfassung', assigneeId: 'm2' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/tasks/plain-input-mention.test.ts`
Expected: FAIL with "Cannot find module './plain-input-mention'" (file doesn't exist yet).

- [ ] **Step 3: Create `src/components/tasks/plain-input-mention.ts`**

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
 * Bewusst NICHT der volle prefix-parser (kein !!/~30m/#tag/Datum).
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
 * normalen Input -- per Canvas-Textmessung statt ProseMirror-coordsAtPos.
 * Faellt auf die linke Feldkante zurueck, wenn Canvas nicht verfuegbar ist.
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/tasks/plain-input-mention.test.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (895 pre-existing + 6 new = 901), no regressions.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/tasks/plain-input-mention.ts src/components/tasks/plain-input-mention.test.ts
git commit -m "feat(tasks): plain-input-mention -- @-Tagging-Logik fuer normale Input-Felder

Editor-unabhaengige Cursor-Position (Canvas-Textmessung statt ProseMirror
coordsAtPos) + Text-Splicing/Marker-Aufloesung, damit @-Tagging auch ohne
Tiptap-Editor funktioniert. Bewusst kein voller prefix-parser-Funktionsumfang."
```

---

### Task 2: `NewTaskForm` auf @-Tagging umgebaut

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `insertMentionMarker`/`stripResolvedMentions`/`getInputCaretAnchor`/`ResolvedInputMention` (Task 1, `@/components/tasks/plain-input-mention`), `useMentionPopoverState`/`extractMentionQuery` (`@/components/tasks/MentionPopover`), `buildTaskMentionCandidates`/`markerForTask`/`TaskMentionCandidate` (`@/components/tasks/task-mentions`), `TaskMentionPopover`/`filterTaskCandidates` (`@/components/tasks/TaskMentionPopover`).
- Produces: nothing consumed by a later task — final UI change for this plan.

- [ ] **Step 1: Add the new imports**

In `src/routes/ProjectDetailRoute.tsx`, add these import lines alongside the existing ones (after the `import type { MemberProfile } from '@/types/profile.types'` line added in the prior round):

```typescript
import { useMentionPopoverState, extractMentionQuery } from '@/components/tasks/MentionPopover'
import { buildTaskMentionCandidates, markerForTask } from '@/components/tasks/task-mentions'
import type { TaskMentionCandidate } from '@/components/tasks/task-mentions'
import { TaskMentionPopover, filterTaskCandidates } from '@/components/tasks/TaskMentionPopover'
import { insertMentionMarker, stripResolvedMentions, getInputCaretAnchor } from '@/components/tasks/plain-input-mention'
import type { ResolvedInputMention } from '@/components/tasks/plain-input-mention'
```

- [ ] **Step 2: Replace the `NewTaskForm` component**

Find the current `NewTaskForm` function (added in the prior round, currently a title `<input>` + assignee `<select>` + submit button) and replace its ENTIRE body with:

```tsx
function NewTaskForm({ members, onCreate }: {
  members: MemberProfile[]
  onCreate: (title: string, assigneeId: string | undefined) => void
}) {
  const [text, setText] = useState('')
  const [resolvedMentions, setResolvedMentions] = useState<ResolvedInputMention[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { ctx, setCtx, activeIdx, setActiveIdx, close } = useMentionPopoverState()

  const candidates = useMemo(() => buildTaskMentionCandidates(members, []), [members])
  const filtered = useMemo(() => filterTaskCandidates(candidates, ctx.query), [candidates, ctx.query])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setText(value)
    const cursor = e.target.selectionStart ?? value.length
    const found = extractMentionQuery(value.slice(0, cursor))
    if (found) {
      setCtx({ open: true, query: found.query, startOffset: found.startOffset, anchor: getInputCaretAnchor(e.target) })
    } else {
      close()
    }
  }

  const pick = (cand: TaskMentionCandidate) => {
    if (!ctx.open || !inputRef.current) return
    const marker = markerForTask(cand)
    const cursor = inputRef.current.selectionStart ?? text.length
    const { value, cursor: newCursor } = insertMentionMarker(text, ctx.startOffset, cursor, marker)
    setText(value)
    setResolvedMentions(prev => [
      ...prev.filter(m => m.marker.toLowerCase() !== marker.toLowerCase()),
      { marker, id: cand.id },
    ])
    close()
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(newCursor, newCursor))
  }

  const submit = () => {
    const { cleanTitle, assigneeId } = stripResolvedMentions(text, resolvedMentions)
    if (!cleanTitle.trim()) return
    onCreate(cleanTitle.trim(), assigneeId)
    setText('')
    setResolvedMentions([])
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      <input
        ref={inputRef} className="mock-input" value={text} onChange={handleChange}
        placeholder="Neue Aufgabe, @Name zum Zuweisen" style={{ fontSize: 13 }}
        onKeyDown={e => {
          if (ctx.open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(Math.min(activeIdx + 1, filtered.length - 1)); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(Math.max(activeIdx - 1, 0)); return }
            if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx]); return }
            if (e.key === 'Escape') { close(); return }
          }
          if (e.key === 'Enter') submit()
        }}
      />
      <TaskMentionPopover
        open={ctx.open} query={ctx.query} candidates={candidates} anchor={ctx.anchor}
        activeIdx={activeIdx} setActiveIdx={setActiveIdx} onSelect={pick} onClose={close}
      />
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        disabled={!text.trim()}
        onClick={submit}
      >
        + Aufgabe
      </button>
    </div>
  )
}
```

**Note:** `NewTaskForm`'s external props (`members`, `onCreate`) are unchanged — the call site `<NewTaskForm members={members} onCreate={handleCreateTask} />` in the tasks panel needs no modification.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (901 pre-existing after Task 1, no new tests added in this task), no regressions. No dedicated test file for this step — `NewTaskForm` is UI wiring over the already-tested Task 1 logic, matching the established convention that this route's UI compositions (`NewPhaseForm`, the original `NewTaskForm`) have no dedicated test file.

- [ ] **Step 5: Manual smoke test**

If you can launch and interact with the running desktop app: open a project in a shared workspace with at least one other member, type "Website Texte prüfen @" in the new-task field, confirm a popover with member names appears, pick one (click or arrow+Enter), confirm "@Name " appears in the field, click "+ Aufgabe", confirm the task appears in the list with the assignee's name shown and NOT containing the literal "@Name" text. Also test typing a title with no "@" at all and confirm it still creates an unassigned task. If you cannot run/click through the app in your environment, say so explicitly in your report.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): Aufgaben-Formular nutzt echtes @-Tagging statt Dropdown

Ersetzt das Assignee-Dropdown durch dieselbe @Name-Mention-Interaktion,
die TaskComposer/GlobalQuickComposer schon nutzen. Wiederverwendet die
geteilten, editor-unabhaengigen Bausteine (task-mentions.ts, MentionPopover,
TaskMentionPopover) unveraendert; nur Cursor-Position + Text-Splicing kommen
aus der neuen plain-input-mention.ts, da kein Tiptap-Editor im Spiel ist."
```

---

## Final Steps

After both tasks are complete and reviewed: dispatch a task reviewer (standard-capability model given the moderate scope), then proceed to `superpowers:finishing-a-development-branch` for `feat/projekt-aufgabe-at-tagging`.
