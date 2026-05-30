import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { parseTaskText } from './prefix-parser'
import { Plus, Send } from 'lucide-react'

const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

interface Props { customerId?: string }

export function TaskComposer({ customerId }: Props = {}) {
  const upsert   = useTodosStore(s => s.upsert)
  const accounts = useAccountsStore(s => s.accounts)
  const [text, setText] = useState('')

  const placeholder = customerId
    ? 'Neue Task… "!! ~45m @10:00 #call Logo finalisieren"'
    : 'Was muss erledigt werden? "!! ~45m @10:00 #call +TechCorp …"'

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, bulletList: false, orderedList: false,
        listItem: false, blockquote: false, codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: '',
    onUpdate: ({ editor }) => setText(editor.getText()),
    editorProps: {
      attributes: {
        class: 'tasks-composer-editor',
        style: 'outline:none; min-height:24px; padding:8px 4px; font-size:14px; color:var(--fg);',
      },
    },
  })

  const draft = useMemo(() => parseTaskText(text), [text])

  const resolvedCustomerId = useMemo(() => {
    if (customerId) return customerId
    if (!draft.customerHint) return undefined
    const lower = draft.customerHint.toLowerCase()
    const match = accounts.find(c => c.name.toLowerCase().includes(lower))
    return match?.id
  }, [customerId, draft.customerHint, accounts])

  const canSubmit = !!(draft.title.trim() || draft.tags.length || draft.customerHint)

  const submit = async () => {
    if (!editor || !canSubmit) return
    const todayStr = new Date().toISOString().slice(0, 10)
    await upsert({
      title:          draft.title.trim() || '(ohne Titel)',
      priority:       draft.priority ?? 'p3',
      scheduledAt:    draft.scheduledAt,
      plannedMinutes: draft.plannedMinutes,
      tags:           draft.tags,
      customerId:     resolvedCustomerId,
      bucket:         draft.scheduledAt && draft.scheduledAt.slice(0, 10) === todayStr
                      ? 'today' : 'backlog',
    })
    editor.commands.clearContent()
    setText('')
  }

  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && editor.isFocused) {
        e.preventDefault()
        submit()
      }
    }
    const dom = editor.view.dom as HTMLElement
    dom.addEventListener('keydown', handler)
    return () => dom.removeEventListener('keydown', handler)
    // submit captures `draft` and `resolvedCustomerId` via closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, draft, resolvedCustomerId])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '14px 16px',
      background: 'var(--surface-2)', borderRadius: 14,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'oklch(50% 0 0 / 0.06)', color: 'var(--fg-muted)',
          flexShrink: 0, marginTop: 4,
        }}>
          <Plus size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditorContent editor={editor} />
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 99,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 12.5, fontWeight: 600,
            opacity: canSubmit ? 1 : 0.4,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          Hinzufügen
          <Send size={12} />
        </button>
      </div>

      {/* Live-Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
        {draft.scheduledAt && (
          <Chip color="accent">
            📅 {new Date(draft.scheduledAt).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
            {' · '}
            {new Date(draft.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}
          </Chip>
        )}
        {draft.priority && <Chip color="warn">● {PRIO_LABEL[draft.priority]}</Chip>}
        {draft.plannedMinutes && <Chip color="muted">⏱ {draft.plannedMinutes}m</Chip>}
        {draft.tags.map(t => <Chip key={t} color="muted">#{t}</Chip>)}
        {!customerId && draft.customerHint && (
          <Chip color={resolvedCustomerId ? 'accent' : 'danger'}>
            +{draft.customerHint}
            {!resolvedCustomerId && ' (nicht gefunden)'}
          </Chip>
        )}
        {!draft.scheduledAt && !draft.priority && !draft.plannedMinutes && !draft.tags.length && !draft.customerHint && (
          <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
            {customerId
              ? '! Priorität · ~Zeit · @ wann · # Tag'
              : '! Priorität · ~Zeit · @ wann · # Tag · + Kunde'}
          </span>
        )}
      </div>
    </div>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color: 'accent' | 'warn' | 'muted' | 'danger' }) {
  const bg = color === 'accent' ? 'var(--accent-soft)'
            : color === 'warn'  ? 'oklch(85% 0.13 60 / 0.18)'
            : color === 'danger' ? 'oklch(70% 0.18 25 / 0.18)'
            : 'oklch(50% 0 0 / 0.08)'
  const fg = color === 'accent' ? 'var(--accent-ink)'
            : color === 'warn'  ? 'oklch(50% 0.15 60)'
            : color === 'danger' ? 'oklch(50% 0.2 25)'
            : 'var(--fg-muted)'
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 99,
      background: bg, color: fg, fontWeight: 600,
      fontSize: 11, letterSpacing: '0.01em',
    }}>
      {children}
    </span>
  )
}
