import { useState } from 'react'
import type { NoteDoc } from '@/types/notes-module.types'
import { NoteDocModal } from './NoteDocModal'

interface Props {
  docs:      NoteDoc[]
  accountId: string
  onCreate:  (title: string, content: string) => Promise<void>
  onUpdate:  (id: string, title: string, content: string) => Promise<void>
  onDelete:  (id: string) => Promise<void>
}

export function PinnedDocsRow({ docs, accountId, onCreate, onUpdate, onDelete }: Props) {
  const [openDoc, setOpenDoc] = useState<NoteDoc | 'new' | null>(null)

  return (
    <>
      {/* Reference migration: design-token utilities instead of inline styles.
          JS onMouseEnter hovers replaced by `hover:` classes (no re-render,
          works with keyboard focus too). */}
      <div className="mb-7">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-fg-dim">
          <span>📌 Angeheftet</span>
          <div className="h-px flex-1 bg-white/[0.07]" />
        </div>

        <div className="flex flex-wrap gap-2">
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setOpenDoc(doc)}
              className="flex items-center gap-2 rounded-[9px] border border-white/[0.07] bg-surface-2 px-3 py-2 transition-colors hover:border-white/[0.12] hover:bg-surface-3"
            >
              <span className="text-[13px]">📋</span>
              <div className="text-left">
                <div className="text-xs font-semibold text-fg">{doc.title}</div>
              </div>
            </button>
          ))}

          <button
            onClick={() => setOpenDoc('new')}
            className="flex items-center gap-1.5 rounded-[9px] border border-dashed border-white/10 bg-transparent px-3 py-2 text-xs text-fg-dim transition-colors hover:border-accent hover:text-accent"
          >
            + Dokument
          </button>
        </div>
      </div>

      {openDoc !== null && (
        <NoteDocModal
          doc={openDoc === 'new' ? null : openDoc}
          accountId={accountId}
          onSave={async (title, content) => {
            if (openDoc === 'new') await onCreate(title, content)
            else await onUpdate(openDoc.id, title, content)
          }}
          onDelete={openDoc !== 'new' ? async () => { await onDelete(openDoc.id) } : null}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </>
  )
}
