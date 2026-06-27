# Vereinheitlichtes `@` (Mitglieder + Kunden) + Zuweisen beim Anlegen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@` im Task- und Quick-Capture-Composer bietet **Mitglieder (oben) → Trennlinie → Kunden**; Mitglied-Pick weist die Aufgabe zu (Inbox-Benachrichtigung + Sprung), Kunde-Pick verknüpft sie (wie bisher).

**Architecture:** Tagged-Union-Mention-Kandidaten (`member`|`customer`) + ein gruppiertes Popover (Vorlage: `ChatMentionPopover`), genutzt von beiden Task-Composern. Der Parser löst Mitglied-Marker → `assigneeId`, Kunde-Marker → `customerId`. Zuweisung passiert NICHT im Create-Payload, sondern per Folge-`setAssignee` (UPDATE) → der bestehende `tg_task_assignment_fanout`-Trigger benachrichtigt (keine Migration, keine Spam bei der „Teilen"-Migration).

**Tech Stack:** TypeScript (strict), React, TipTap, Zustand, Vitest. `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-28-unified-mention-assign-design.md`. Verbindlich.
- **Reihenfolge im Popover:** **Mitglieder zuerst**, dann **Trennlinie**, dann **Kunden**.
- **Mitglied-Pick → `assignee`** (Zuweisung); **Kunde-Pick → `customerId`** (Verknüpfung, wie bisher). Ein Assignee (letzter Mitglied-Pick gewinnt); eine Kundenverknüpfung (erster gewinnt, bestehendes Verhalten).
- **Mitglied-Zuweisung erfordert Pick** (kein Tipp-Fuzzy); Kunden-Tipp-Fallback (`resolveMention`) bleibt unverändert.
- **KEINE Trigger-/DB-Migration.** Composer: `upsert` (create, **ohne** `assignee`) → dann `useTodosStore.getState().setAssignee(newId, assigneeId)` (UPDATE → Trigger). Create-Payload **nie** `assignee` setzen (sonst UPDATE nicht „distinct").
- **Chat-Composer + `ChatMentionPopover` NICHT anfassen.** Nur Task-Seite.
- **`tsc` sauber + bestehende Tests grün.** UI deutsch.

## File Structure

- `src/components/tasks/task-mentions.ts` — `TaskMentionCandidate`, `buildTaskMentionCandidates`, `markerForTask`. (Create) + `.test.ts`
- `src/components/tasks/TaskMentionPopover.tsx` — gruppiertes Popover (Mitglieder/Trennlinie/Kunden) + `filterTaskCandidates`. (Create)
- `src/components/tasks/prefix-parser.ts` — `ParseContext.mentions` taggen + `TaskDraft.assigneeId`. (Modify) + `prefix-parser.test.ts` (Modify/Create)
- `src/components/tasks/TaskComposer.tsx` — Kandidaten members+customers, Popover, Pick mit kind, Submit create→setAssignee. (Modify)
- `src/components/global/GlobalQuickComposer.tsx` — dito für Task-Modus. (Modify)

---

## Task 1: `task-mentions.ts` — Kandidaten-Builder + Tests

**Files:**
- Create: `src/components/tasks/task-mentions.ts`
- Test: `src/components/tasks/task-mentions.test.ts`

**Interfaces:**
- Consumes: `MemberProfile` (`@/types/profile.types`), `Account` (`@/types/account.types`).
- Produces:
  - `TaskMentionCandidate = { kind: 'member' | 'customer'; id: string; name: string; sub?: string }`
  - `buildTaskMentionCandidates(members: MemberProfile[], accounts: Account[]): TaskMentionCandidate[]` — Mitglieder zuerst, dann nicht-private Kunden.
  - `markerForTask(c: TaskMentionCandidate): string` — `@<Vorname>`.

- [ ] **Step 1: Failing test `src/components/tasks/task-mentions.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { buildTaskMentionCandidates, markerForTask } from './task-mentions'

const members = [{ id: 'u1', displayName: 'Mia Berg', email: 'mia@x.de' }] as any
const accounts = [
  { id: 'a1', name: 'Acme GmbH', industry: 'Bau', isPrivate: false },
  { id: 'a2', name: 'Privat', industry: null, isPrivate: true },
] as any

describe('buildTaskMentionCandidates', () => {
  it('lists members first, then non-private customers', () => {
    const c = buildTaskMentionCandidates(members, accounts)
    expect(c.map(x => x.kind)).toEqual(['member', 'customer'])
    expect(c[0]).toMatchObject({ kind: 'member', id: 'u1', name: 'Mia Berg' })
    expect(c[1]).toMatchObject({ kind: 'customer', id: 'a1', name: 'Acme GmbH' })
  })
})

describe('markerForTask', () => {
  it('uses @firstname for members and customers', () => {
    expect(markerForTask({ kind: 'member', id: 'u1', name: 'Mia Berg' })).toBe('@Mia')
    expect(markerForTask({ kind: 'customer', id: 'a1', name: 'Acme GmbH' })).toBe('@Acme')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/components/tasks/task-mentions.test.ts`).

- [ ] **Step 3: `src/components/tasks/task-mentions.ts`**
```ts
import type { MemberProfile } from '@/types/profile.types'
import type { Account } from '@/types/account.types'

export interface TaskMentionCandidate {
  kind: 'member' | 'customer'
  id:   string
  name: string
  sub?: string
}

/** Mitglieder zuerst (Zuweisung), dann nicht-private Kunden (Verknüpfung). */
export function buildTaskMentionCandidates(members: MemberProfile[], accounts: Account[]): TaskMentionCandidate[] {
  const memberCands: TaskMentionCandidate[] = members.map(m => ({
    kind: 'member', id: m.id, name: m.displayName, sub: m.email ?? undefined,
  }))
  const customerCands: TaskMentionCandidate[] = accounts
    .filter(a => !a.isPrivate)
    .map(a => ({ kind: 'customer', id: a.id, name: a.name, sub: a.industry ?? undefined }))
  return [...memberCands, ...customerCands]
}

/** Anzeige-Marker: @Vorname (erstes Wort). */
export function markerForTask(c: TaskMentionCandidate): string {
  return `@${c.name.split(' ')[0]}`
}
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Step 6: Commit**
```bash
git add src/components/tasks/task-mentions.ts src/components/tasks/task-mentions.test.ts
git commit -m "feat(mention): task mention candidates (members + customers)"
```

---

## Task 2: `TaskMentionPopover.tsx` — gruppiertes Popover

**Files:**
- Create: `src/components/tasks/TaskMentionPopover.tsx`

**Interfaces:**
- Consumes: `TaskMentionCandidate` (Task 1).
- Produces:
  - `filterTaskCandidates(candidates, query): TaskMentionCandidate[]` (case-insensitive Name-Match, max 8).
  - `TaskMentionPopover` (props: `open`, `query`, `candidates`, `anchor: {top,left}|null`, `activeIdx`, `setActiveIdx`, `onSelect`, `onClose`) — fixed-position (wie `MentionPopover`), Gruppen-Header **„Mitglieder"** zuerst, dann **Trennlinie + „Kunden"**.

- [ ] **Step 1: `src/components/tasks/TaskMentionPopover.tsx`** (Vorlage: `src/components/team/ChatMentionPopover.tsx` für die Gruppen-Logik, `src/components/tasks/MentionPopover.tsx` für das fixed-position-Anchoring)
```tsx
import { useEffect, useMemo } from 'react'
import { Users, Building2 } from 'lucide-react'
import type { TaskMentionCandidate } from './task-mentions'

interface Props {
  open: boolean
  query: string
  candidates: TaskMentionCandidate[]
  anchor: { top: number; left: number } | null
  activeIdx: number
  setActiveIdx: (i: number) => void
  onSelect: (c: TaskMentionCandidate) => void
  onClose: () => void
}

/** Gefilterte flache Liste (Reihenfolge = Tastatur-Navigation). Max 8. */
export function filterTaskCandidates(candidates: TaskMentionCandidate[], query: string): TaskMentionCandidate[] {
  const q = query.trim().toLowerCase()
  const list = q ? candidates.filter(c => c.name.toLowerCase().includes(q)) : candidates
  return list.slice(0, 8)
}

export function TaskMentionPopover({ open, query, candidates, anchor, activeIdx, setActiveIdx, onSelect, onClose }: Props) {
  const filtered = useMemo(() => filterTaskCandidates(candidates, query), [candidates, query])
  useEffect(() => { setActiveIdx(0) }, [filtered.length, setActiveIdx])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-task-mention]')) onClose() }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open || !anchor || filtered.length === 0) return null

  return (
    <div data-task-mention style={{
      position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 1100,
      minWidth: 260, maxHeight: 280, overflowY: 'auto',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-2)', padding: 4,
    }}>
      {filtered.map((c, i) => {
        const showHeader = i === 0 || filtered[i - 1].kind !== c.kind
        const active = i === activeIdx
        return (
          <div key={`${c.kind}-${c.id}`}>
            {showHeader && (
              <div style={{
                padding: '6px 10px 4px', fontSize: 9.5, fontWeight: 700,
                color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', gap: 6,
                borderTop: c.kind === 'customer' ? '1px solid var(--border)' : undefined,
                marginTop: c.kind === 'customer' ? 4 : 0, paddingTop: c.kind === 'customer' ? 8 : 6,
              }}>
                {c.kind === 'member' ? <Users size={11} /> : <Building2 size={11} />}
                {c.kind === 'member' ? 'Mitglieder' : 'Kunden'}
              </div>
            )}
            <div
              data-task-mention-row={i}
              onMouseDown={e => { e.preventDefault(); onSelect(c) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 7, cursor: 'pointer',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {c.sub && <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{c.sub}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: tsc sauber. Step 3: Commit**
```bash
git add src/components/tasks/TaskMentionPopover.tsx
git commit -m "feat(mention): grouped task mention popover (Mitglieder | Kunden)"
```

---

## Task 3: prefix-parser — `assigneeId` + getaggte Mentions

**Files:**
- Modify: `src/components/tasks/prefix-parser.ts`
- Test: `src/components/tasks/prefix-parser.test.ts` (anlegen falls nicht vorhanden)

**Interfaces:**
- Produces: `TaskDraft.assigneeId?: string`; `ParseContext.mentions?: Array<{ marker: string; kind: 'member' | 'customer'; id: string }>`. Member-Marker → `assigneeId` (letzter gewinnt), Customer-Marker → `customerId` (erster gewinnt); `resolveMention`-Fallback → `customerId` (unverändert).

- [ ] **Step 1: Failing test** — `src/components/tasks/prefix-parser.test.ts` (ergänzen/anlegen):
```ts
import { describe, it, expect } from 'vitest'
import { parseTaskText } from './prefix-parser'

describe('parseTaskText mentions', () => {
  it('member marker -> assigneeId, customer marker -> customerId', () => {
    const d = parseTaskText('@Mia @Acme Angebot finalisieren', {
      mentions: [
        { marker: '@Mia', kind: 'member', id: 'u1' },
        { marker: '@Acme', kind: 'customer', id: 'a1' },
      ],
    })
    expect(d.assigneeId).toBe('u1')
    expect(d.customerId).toBe('a1')
    expect(d.title).toBe('Angebot finalisieren')
  })

  it('typed customer fallback still resolves customerId', () => {
    const d = parseTaskText('@Klara anrufen', { resolveMention: q => q === 'Klara' ? 'a9' : undefined })
    expect(d.customerId).toBe('a9')
    expect(d.assigneeId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `prefix-parser.ts` anpassen**:
  (a) `TaskDraft` um `assigneeId?: string` ergänzen (nach `customerId`).
  (b) `ParseContext.mentions` neu typisieren:
```ts
  mentions?: Array<{ marker: string; kind: 'member' | 'customer'; id: string }>
```
  (c) Mention-Map + `@`-Auflösung ersetzen. Die Zeile `const mentionMap = new Map<string, string>() …` ersetzen durch:
```ts
  const mentionMap = new Map<string, { kind: 'member' | 'customer'; id: string }>()
  for (const m of ctx.mentions ?? []) mentionMap.set(m.marker.toLowerCase(), { kind: m.kind, id: m.id })
```
  Den `if (token.startsWith('@')) { … }`-Block ersetzen durch:
```ts
    if (token.startsWith('@')) {
      const picked = mentionMap.get(token.toLowerCase())
      if (picked) {
        if (picked.kind === 'member') draft.assigneeId = picked.id          // letzter gewinnt
        else if (!draft.customerId)   draft.customerId = picked.id          // erster gewinnt
        continue
      }
      const fallback = ctx.resolveMention?.(token.slice(1))                  // nur Kunden
      if (fallback) { if (!draft.customerId) draft.customerId = fallback; continue }
      titleParts.push(token.slice(1))
      continue
    }
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber + volle Suite grün** (bestehende prefix-parser/Composer-Tests). **Step 6: Commit**
```bash
git add src/components/tasks/prefix-parser.ts src/components/tasks/prefix-parser.test.ts
git commit -m "feat(mention): parser resolves member->assigneeId, customer->customerId"
```

---

## Task 4: `TaskComposer` — Mitglieder+Kunden, zuweisen beim Anlegen

**Files:**
- Modify: `src/components/tasks/TaskComposer.tsx`

**Interfaces:**
- Consumes: `buildTaskMentionCandidates`/`markerForTask` (Task 1), `TaskMentionPopover`/`filterTaskCandidates` (Task 2), getaggte `mentions` (Task 3), `useMembersStore`, `useTodosStore.setAssignee`.

- [ ] **Step 1: Kandidaten = Mitglieder + Kunden**
  Import ergänzen:
```ts
  import { useMembersStore } from '@/store/members.store'
  import { buildTaskMentionCandidates, markerForTask, type TaskMentionCandidate } from './task-mentions'
  import { TaskMentionPopover, filterTaskCandidates } from './TaskMentionPopover'
```
  `const accounts = useAccountsStore(s => s.accounts)` behalten; ergänzen `const members = useMembersStore(s => s.members())`. Die `candidates`-`useMemo` ersetzen:
```ts
  const candidates: TaskMentionCandidate[] = useMemo(
    () => buildTaskMentionCandidates(members, accounts),
    [members, accounts],
  )
```
  Den `mentions`-State auf die getaggte Form umstellen:
```ts
  const [mentions, setMentions] = useState<Array<{ marker: string; kind: 'member' | 'customer'; id: string }>>([])
```

- [ ] **Step 2: Popover-Komponente tauschen** — die `<MentionPopover … />`-Verwendung (am Ende des JSX) durch `<TaskMentionPopover … />` ersetzen (gleiche Props: `open`, `query`, `candidates`, `anchor`, `activeIdx`, `setActiveIdx`, `onSelect={pickMention}`, `onClose`). `extractMentionQuery`/`useMentionPopoverState` weiterhin aus `./MentionPopover` importieren (unverändert).

- [ ] **Step 3: `pickMention` auf kind umstellen** — Marker via `markerForTask`, Eintrag mit kind+id:
```ts
  const pickMention = (cand: TaskMentionCandidate) => {
    if (!editor) return
    const m = mentionStateRef.current
    if (!m.ctx.open) return
    const marker = markerForTask(cand)
    const fullText = editor.getText()
    const pos = editor.state.selection.from
    const textOffset = posToTextOffset(editor, pos)
    const before = fullText.slice(0, m.ctx.startOffset)
    const after  = fullText.slice(textOffset)
    editor.commands.setContent(`${before}${marker} ${after}`)
    editor.commands.setTextSelection(textOffsetToPos(editor, (before + marker + ' ').length))
    setMentions(prev => [...prev.filter(p => p.marker.toLowerCase() !== marker.toLowerCase()), { marker, kind: cand.kind, id: cand.id }])
    m.close()
  }
```
  Die `__cyneraPickMention`-Picker-Funktion (window-Hack) auf `filterTaskCandidates(candidates, q)` umstellen statt der bisherigen customer-Filterung (Logik sonst identisch).

- [ ] **Step 4: Submit — anlegen, dann zuweisen** — in `persistTaskAndOptionalEvent` den `upsert(...)`-Aufruf so anpassen, dass der Rückgabewert genutzt wird und danach `setAssignee` läuft. `assignee` NICHT in den upsert-Payload geben. `useTodosStore` Selektor `const setAssignee = useTodosStore(s => s.setAssignee)` ergänzen. Nach dem bestehenden `await upsert({...})`:
```ts
    const created = await upsert({
      title:          eventOverride?.title ?? title,
      priority:       sourceDraft.priority ?? 'p3',
      scheduledAt:    sourceDraft.scheduledAt,
      plannedMinutes: eventOverride?.plannedMinutes ?? sourceDraft.plannedMinutes,
      tags:           sourceDraft.tags,
      customerId:     eventOverride?.customerId ?? effectiveCustomerId,
      calendarEventId,
      actionType:     sourceDraft.actionType,
      bucket:         sourceDraft.scheduledAt && sourceDraft.scheduledAt.slice(0, 10) === todayStr ? 'today' : 'backlog',
    })
    if (sourceDraft.assigneeId) {
      try { await setAssignee(created.id, sourceDraft.assigneeId) } catch { /* Store loggt; Aufgabe bleibt erstellt */ }
    }
```
  (`upsert` gibt den erstellten `Todo` zurück — bestehende Signatur.)

- [ ] **Step 5: tsc sauber + volle Suite grün.** **Step 6: Commit**
```bash
git add src/components/tasks/TaskComposer.tsx
git commit -m "feat(mention): TaskComposer @ assigns members + links customers"
```

---

## Task 5: `GlobalQuickComposer` — dito im Task-Modus

**Files:**
- Modify: `src/components/global/GlobalQuickComposer.tsx`

**Interfaces:**
- Wie Task 4, im `ComposerInner`. Note-Modus (kein `!`) bleibt unverändert (keine Zuweisung für Notizen).

- [ ] **Step 1: Imports + Kandidaten** — ergänzen:
```ts
  import { useMembersStore } from '@/store/members.store'
  import { buildTaskMentionCandidates, markerForTask, type TaskMentionCandidate } from '@/components/tasks/task-mentions'
  import { TaskMentionPopover, filterTaskCandidates } from '@/components/tasks/TaskMentionPopover'
  import { useTodosStore } from '@/store/todos.store'
```
  `const members = useMembersStore(s => s.members())`; `candidates` ersetzen:
```ts
  const candidates: TaskMentionCandidate[] = useMemo(() => buildTaskMentionCandidates(members, accounts), [members, accounts])
```
  `mentions`-State auf getaggte Form (wie Task 4 Step 1).

- [ ] **Step 2: Popover tauschen** — `<MentionPopover … />` → `<TaskMentionPopover … />` (gleiche Props). `extractMentionQuery`/`useMentionPopoverState` bleiben aus `@/components/tasks/MentionPopover`.

- [ ] **Step 3: `pickMention` + window-Picker** — wie Task 4 Step 3 (mit `markerForTask`, kind+id, `filterTaskCandidates` im `__cyneraPickMentionGlobal`).

- [ ] **Step 4: Submit (Task-Modus) — anlegen, dann zuweisen** — `const setAssignee = useTodosStore(s => s.setAssignee)`. Im `persist(...)` (Task-Zweig) den `await upsert({...})` Rückgabewert nutzen, `assignee` NICHT im Payload, danach:
```ts
    const created = await upsert({ /* … bestehende Felder, customerId wie gehabt … */ })
    if (sourceDraft.assigneeId) {
      try { await setAssignee(created.id, sourceDraft.assigneeId) } catch { /* Store loggt */ }
    }
```
  Note-Modus (`saveQuickNote`) unverändert lassen.

- [ ] **Step 5: tsc sauber + volle Suite grün.** **Step 6: Commit**
```bash
git add src/components/global/GlobalQuickComposer.tsx
git commit -m "feat(mention): Quick-Capture @ assigns members + links customers"
```

---

## Abschluss-Verifikation

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün (task-mentions, prefix-parser, bestehende Composer-Tests).
- [ ] **Manuell (2 Logins, geteilter Workspace):** Quick Capture `! @Mia Angebot finalisieren morgen 14:00` → Aufgabe angelegt, **Mia zugewiesen**, terminiert; Mia bekommt **Inbox-„Zugewiesen" + Sprung**. `@Kunde` verknüpft weiter den Kunden. Popover zeigt **Mitglieder oben, Linie, Kunden**.

## Self-Review (gegen Spec)
- §1 Tagged-Union-Kandidaten + Builder → Task 1 ✅. §2 gruppiertes Popover (Mitglieder→Linie→Kunden) → Task 2 ✅. §3 Parser `assigneeId`/`customerId` → Task 3 ✅. §4 Persistenz create→setAssignee (kein assignee im Create) → Task 4/5 ✅. §5 keine Trigger-Migration (Folge-UPDATE) → Task 4/5 ✅. §6 Namensgleichheit via zwei Gruppen + pick-basierte (kind+id) Auflösung → Task 1–3 ✅.
- Chat unangetastet; `MentionPopover.tsx` bleibt (liefert `extractMentionQuery`/`useMentionPopoverState`); nur die Render-Komponente wird in den Task-Composern getauscht.
- YAGNI: kein `#`-Sigil, keine Mehrfach-Zuweisung, kein `@Aufgabe` im Task-Composer, ColumnQuickAdd unverändert.

## Execution Handoff
**Plan gespeichert unter `docs/superpowers/plans/2026-06-28-unified-mention-assign.md`. Subagent-Driven (empfohlen) oder Inline?**
