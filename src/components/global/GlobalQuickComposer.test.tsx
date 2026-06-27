/**
 * GlobalQuickComposer — create-then-assign invariant
 *
 * Mirrors the TaskComposer invariant: when a member mention is picked in
 * task-mode the task is CREATED without an `assignee` / `assigneeId` field in
 * the upsert payload, and setAssignee is called AFTERWARDS with
 * (created.id, memberId). That null→X UPDATE is what fires the DB
 * notification trigger; embedding the assignee in the create payload would
 * break it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMembersStore } from '@/store/members.store'
import { useGlobalComposerStore } from '@/store/global-composer.store'
import { useUiStore } from '@/store/ui.store'

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
        setContent:       (c: string)  => { h.editorState.text = c },
        clearContent:     ()            => { h.editorState.text = '' },
        setTextSelection: (p: number)  => { h.editorState.pos  = p },
        focus:            ()            => {},
      },
      get state() { return { selection: { from: h.editorState.pos } } },
      view: { coordsAtPos: () => ({ bottom: 100, left: 100, top: 80 }) },
    }
  },
  EditorContent: () => null,
}))

vi.mock('@tiptap/starter-kit',           () => ({ default: { configure: () => ({}) } }))
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: () => ({}) } }))

// Render AnimatePresence and motion.div as plain wrappers — no animation in tests.
vi.mock('framer-motion', async () => {
  const { createElement, Fragment } = await import('react')
  return {
    AnimatePresence: ({ children }: any) => createElement(Fragment, null, children),
    motion: {
      div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: any) =>
        createElement('div', rest, children),
    },
  }
})

// ─── Actual component import (after mocks are registered) ─────────────────────
import { GlobalQuickComposer } from './GlobalQuickComposer'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MEMBER  = { id: 'u1', displayName: 'Mia Berg', email: 'mia@x.de' }
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

describe('GlobalQuickComposer create-then-assign invariant', () => {
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
    useAccountsStore.setState({ accounts: [] as never })
    useMembersStore.setState({
      profiles:  { [MEMBER.id]: MEMBER },
      memberIds: [MEMBER.id],
    })
    // Open the panel so ComposerInner renders
    useGlobalComposerStore.setState({ open: true })
    // Neither 'corra' (hides bubble) nor 'clients' (would pin a customer)
    useUiStore.setState({ appView: 'dashboard' as any, selectedCustomerId: null as any })
  })

  afterEach(cleanup)

  it(
    'task-mode member pick: upsert payload has NO assignee/assigneeId field; ' +
    'setAssignee is called once with (created.id, memberId)',
    async () => {
      render(<GlobalQuickComposer />)

      // 1. Type "! @Mia" — leading ! = task-mode; @Mia opens the mention popover
      //    with query "Mia". extractMentionQuery("! @Mia") → { query: "Mia", startOffset: 2 }
      await simulateType('! @Mia')

      // 2. Trigger the global keyboard-enter picker (as if user pressed Enter in popover).
      //    filterTaskCandidates("Mia") → [Mia Berg (member)] → pickMention picks her,
      //    adds { marker: "@Mia", kind: "member", id: "u1" } to mentions state.
      await act(async () => {
        ;(window as any).__cyneraPickMentionGlobal?.()
      })

      // 3. Type the full task title — mention is already registered in state;
      //    no space immediately after @Mia → popover stays closed.
      await simulateType('! @Mia Aufgabe')

      // 4. Submit via the Enter button
      fireEvent.click(screen.getByRole('button', { name: /Enter/i }))

      // 5. Wait for the async upsert to resolve
      await waitFor(() => expect(mockUpsert).toHaveBeenCalled())

      // Assert A — upsert payload must NOT contain assignee or assigneeId
      const payload = mockUpsert.mock.calls[0][0]
      expect(payload).not.toHaveProperty('assignee')
      expect(payload).not.toHaveProperty('assigneeId')

      // Assert B — setAssignee IS called separately with the correct arguments
      await waitFor(() => expect(mockSetAssignee).toHaveBeenCalled())
      expect(mockSetAssignee).toHaveBeenCalledWith('todo-99', 'u1')
      expect(mockSetAssignee).toHaveBeenCalledTimes(1)
    },
  )
})
