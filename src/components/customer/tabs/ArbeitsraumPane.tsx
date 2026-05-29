import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import { useEffect, useRef, useState } from 'react'
import { Check, Cloud } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { SlashCommands } from '@/components/customer/arbeitsraum/slashExtension'

interface Props { customerId: string }

const STORAGE_PREFIX = 'arbeitsraum:v1:'
const SAVE_DEBOUNCE_MS = 500

function storageKey(customerId: string): string {
  return `${STORAGE_PREFIX}${customerId}`
}

function loadDoc(customerId: string): string | null {
  try {
    return localStorage.getItem(storageKey(customerId))
  } catch {
    return null
  }
}

function saveDoc(customerId: string, json: string): void {
  try {
    localStorage.setItem(storageKey(customerId), json)
  } catch {
    /* quota / unavailable — ignore */
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved'

export function ArbeitsraumPane({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [charCount, setCharCount] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Überschrift…'
          return 'Schreibe etwas — oder „/" für Block-Auswahl.'
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      SlashCommands,
    ],
    editorProps: {
      attributes: {
        class: 'tt-editor',
        spellcheck: 'true',
      },
    },
    content: loadDoc(customerId) ?? '',
    onUpdate({ editor }) {
      setStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveDoc(customerId, JSON.stringify(editor.getJSON()))
        setStatus('saved')
        if (statusTimer.current) clearTimeout(statusTimer.current)
        statusTimer.current = setTimeout(() => setStatus('idle'), 1400)
      }, SAVE_DEBOUNCE_MS)
      setCharCount(editor.storage.characterCount.characters())
    },
  })

  // Switch documents when customer changes
  useEffect(() => {
    if (!editor) return
    const raw = loadDoc(customerId)
    if (raw) {
      try { editor.commands.setContent(JSON.parse(raw)) }
      catch { editor.commands.clearContent() }
    } else {
      editor.commands.clearContent()
    }
    setCharCount(editor.storage.characterCount.characters())
  }, [customerId, editor])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (statusTimer.current) clearTimeout(statusTimer.current)
  }, [])

  if (!editor) return null

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '8px 16px 80px' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 16, gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="card-label">Arbeitsraum</span>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
            letterSpacing: '-0.025em', margin: 0,
          }}>
            {customer?.name ?? 'Kunde'}
          </h2>
        </div>

        {/* Save status + char count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--fg-dim)', fontSize: 11.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          <SaveIndicator status={status} />
          {charCount > 0 && <span>{charCount.toLocaleString('de-DE')} Zeichen</span>}
        </div>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Cloud size={11} /> speichere…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ok)' }}>
        <Check size={11} /> gespeichert
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <Cloud size={11} /> automatisch gesichert
    </span>
  )
}
