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
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>📌 Angeheftet</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setOpenDoc(doc)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'var(--bg2)', cursor: 'pointer', transition: 'all 140ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                e.currentTarget.style.background = 'var(--bg3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.background = 'var(--bg2)'
              }}
            >
              <span style={{ fontSize: 13 }}>📋</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{doc.title}</div>
              </div>
            </button>
          ))}

          <button
            onClick={() => setOpenDoc('new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 9,
              border: '1px dashed rgba(255,255,255,0.1)',
              background: 'transparent', cursor: 'pointer', color: 'var(--fg-dim)',
              fontSize: 12, fontFamily: 'inherit', transition: 'all 140ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(181,240,35,0.3)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.color = 'var(--fg-dim)'
            }}
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
