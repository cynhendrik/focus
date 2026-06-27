/**
 * TaskComposer — create-then-assign invariant tests
 *
 * Key invariant: when a member mention is picked the task is CREATED without an
 * `assignee` field in the upsert payload, and setAssignee is called AFTERWARDS
 * with (created.id, memberId).  That null→X UPDATE is what fires the DB
 * notification trigger; embedding assignee in the create payload would break it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMembersStore } from '@/store/members.store'

// ─── Hoisted state (accessible inside vi.mock factories before normal imports) ──
const { h } = vi.hoisted(() => ({
  h: {
    onUpdate: null as ((opts: { editor: any }) => void) | null,
    editorState: { text: '', pos: 1 },
  },
}))

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@tiptap/react', () => ({
  useEditor: (opts: any) => {
    h.onUpdate = opts?.onUpdate ?? null
    return {
      getText: () => h.editorState.text,
      commands: {
        setContent:      (c: string)  => { h.editorState.text = c },
        clearContent:    ()            => { h.editorState.text = '' },
        setTextSelection: (p: number) => { h.editorState.pos  = p },
      },
      // Lazy getter so state.selection.from reflects updates made by pickMention
      get state() { return { selection: { from: h.editorState.pos } } },
      view: { coordsAtPos: () => ({ bottom: 100, left: 100, top: 80 }) },
    }
  },
  EditorContent: () => null,
}))

vi.mock('@tiptap/starter-kit',           () => ({ default: { configure: () => ({}) } }))
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: () => ({}) } }))

// ─── Actual component import (after mocks are registered) ─────────────────────
import { TaskComposer } from './TaskComposer'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MEMBER  = { id: 'u1', displayName: 'Mia Berg', email: 'mia@x.de' }
const ACCOUNT = { id: 'a1', name: 'Acme GmbH', isPrivate: false, industry: 'Bau' }
/** Minimal resolved todo returned by the mock upsert */
const CREATED = { id: 'todo-99' } as any

// ─── Helper: simulate typing into the fake editor ─────────────────────────────

/**
 * Update the fake editor's text and cursor position, then trigger the
 * component's onUpdate callback (as tiptap would) inside act() so React
 * processes any resulting state updates before the caller continues.
 */
async function simulateType(text: string) {
  h.editorState.text = text
  h.editorState.pos  = text.length + 1   // ProseMirror: 1-indexed; cursor at end
  await act(async () => {
    h.onUpdate?.({
      editor: {
        getText:  () => h.editorState.text,
        get state() { return { selection: { from: h.editorState.pos } } },
        view: { coordsAtPos: () => ({ bottom: 100, left: 100 }) },
      },
    })
  })
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TaskComposer create-then-assign invariant', () => {
  let mockUpsert:      ReturnType<typeof vi.fn>
  let mockSetAssignee: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset fake editor between tests
    h.editorState.text = ''
    h.editorState.pos  = 1
    h.onUpdate         = null

    mockUpsert      = vi.fn().mockResolvedValue(CREATED)
    mockSetAssignee = vi.fn().mockResolvedValue(undefined)

    useTodosStore.setState({
      upsert:      mockUpsert      as never,
      setAssignee: mockSetAssignee as never,
    })
    useAccountsStore.setState({ accounts: [ACCOUNT] as never })
    useMembersStore.setState({
      profiles:  { [MEMBER.id]: MEMBER },
      memberIds: [MEMBER.id],
    })
  })

  afterEach(cleanup)

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it(
    'member pick: upsert payload has NO assignee/assigneeId field; ' +
    'setAssignee is called once with (created.id, memberId)',
    async () => {
      render(<TaskComposer />)

      // 1. Type "@Mia" → onUpdate detects mention query "Mia", opens popover
      await simulateType('@Mia')

      // 2. Trigger the global keyboard-enter picker (as if user pressed Enter in popover).
      //    filterTaskCandidates("Mia") → [Mia Berg (member)] → pickMention picks it.
      //    pickMention sets editor content to "@Mia " and adds to mentions state.
      await act(async () => {
        ;(window as any).__cyneraPickMention?.()
      })

      // 3. Type the full task title (closes popover; updates text state)
      await simulateType('@Mia Aufgabe')

      // 4. Submit
      fireEvent.click(screen.getByRole('button', { name: /Enter/i }))

      // 5. Wait for the async upsert to resolve
      await waitFor(() => expect(mockUpsert).toHaveBeenCalled())

      // Assert A — upsert payload must NOT contain assignee or assigneeId
      const payload = mockUpsert.mock.calls[0][0]
      expect(payload).not.toHaveProperty('assignee')
      expect(payload).not.toHaveProperty('assigneeId')

      // Assert B — setAssignee IS called separately with correct arguments
      await waitFor(() => expect(mockSetAssignee).toHaveBeenCalled())
      expect(mockSetAssignee).toHaveBeenCalledWith('todo-99', 'u1')
      expect(mockSetAssignee).toHaveBeenCalledTimes(1)
    },
  )

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it(
    'customer pick: upsert payload has customerId; setAssignee is NEVER called',
    async () => {
      render(<TaskComposer />)

      // 1. Type "@Acme" → query "Acme"; filterTaskCandidates skips "Mia Berg" → picks "Acme GmbH"
      await simulateType('@Acme')

      // 2. Pick via Enter
      await act(async () => {
        ;(window as any).__cyneraPickMention?.()
      })

      // 3. Full title
      await simulateType('@Acme Angebot')

      // 4. Submit
      fireEvent.click(screen.getByRole('button', { name: /Enter/i }))

      // 5. Wait for upsert
      await waitFor(() => expect(mockUpsert).toHaveBeenCalled())

      // Assert A — upsert payload carries the resolved customerId
      const payload = mockUpsert.mock.calls[0][0]
      expect(payload.customerId).toBe('a1')
      // No assignee in payload (no member was mentioned)
      expect(payload).not.toHaveProperty('assignee')

      // Assert B — setAssignee must NOT have been called
      expect(mockSetAssignee).not.toHaveBeenCalled()
    },
  )
})
