import { useEffect, useImperativeHandle, useState, forwardRef } from 'react'
import type { Editor, Range } from '@tiptap/core'
import {
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks,
  Code, Quote, Minus, Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface SlashCommandItem {
  title: string
  description: string
  icon: LucideIcon
  /** Keywords to match against the slash query. */
  keywords: string[]
  /** Apply this command. The query range is the typed "/foo" string. */
  command: (props: { editor: Editor; range: Range }) => void
}

export const SLASH_ITEMS: SlashCommandItem[] = [
  {
    title: 'Text',
    description: 'Normaler Absatz',
    icon: Type,
    keywords: ['paragraph', 'text', 'absatz'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
  },
  {
    title: 'Überschrift 1',
    description: 'Große Headline',
    icon: Heading1,
    keywords: ['h1', 'headline', 'titel', 'überschrift'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Überschrift 2',
    description: 'Sektion',
    icon: Heading2,
    keywords: ['h2', 'überschrift', 'sektion'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Überschrift 3',
    description: 'Unterabschnitt',
    icon: Heading3,
    keywords: ['h3', 'unter'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Liste',
    description: 'Bullet-Liste',
    icon: List,
    keywords: ['bullet', 'liste', 'punkte'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Nummerierte Liste',
    description: 'Schritte 1, 2, 3 …',
    icon: ListOrdered,
    keywords: ['ordered', 'numbered', 'liste', 'reihenfolge', 'schritte'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Aufgaben',
    description: 'Checkboxen zum Abhaken',
    icon: ListChecks,
    keywords: ['task', 'aufgabe', 'todo', 'checkbox', 'haken'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Zitat',
    description: 'Hervorgehobener Block mit Akzent-Strich',
    icon: Quote,
    keywords: ['quote', 'zitat', 'callout'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Codeblock',
    description: 'Monospace mit Hintergrund',
    icon: Code,
    keywords: ['code', 'codeblock', 'block'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Trennlinie',
    description: 'Horizontaler Divider',
    icon: Minus,
    keywords: ['divider', 'hr', 'linie', 'trenner'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

export function filterItems(query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter(it =>
    it.title.toLowerCase().includes(q)
    || it.keywords.some(k => k.includes(q))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// React component for the floating menu

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SlashMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0)

  useEffect(() => { setSelected(0) }, [items])

  const pick = (i: number) => {
    const it = items[i]
    if (it) command(it)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowUp') {
        setSelected(prev => (prev + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected(prev => (prev + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter') {
        pick(selected)
        return true
      }
      return false
    },
  }), [items, selected])

  if (items.length === 0) {
    return (
      <div className="tt-slash-menu">
        <div className="tt-slash-empty">Kein Block gefunden.</div>
      </div>
    )
  }

  return (
    <div className="tt-slash-menu">
      {items.map((it, i) => {
        const Icon = it.icon
        return (
          <div
            key={it.title}
            className="tt-slash-item"
            data-selected={i === selected}
            onMouseEnter={() => setSelected(i)}
            onClick={() => pick(i)}
          >
            <div className="tt-slash-icon">
              <Icon size={15} />
            </div>
            <div className="tt-slash-body">
              <strong>{it.title}</strong>
              <span>{it.description}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'
