// ─────────────────────────────────────────────────────────────────────────────
// Privat-Dokumente — getrennt vom Customer-Files-Archiv (files.store).
// MVP: Metadata + Data-URL in localStorage. Bei groesseren Files (> 5 MB)
// wird der Inhalt nicht persistiert (warnDataLossOnLargeFiles=true), nur die
// Metadaten — der User soll dann die App via Tauri-Filesystem nutzen.
// Spaeter: echte Datei-Ablage ueber Tauri's app data dir.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DocCategory = 'vertraege' | 'finanzen' | 'gesundheit' | 'persoenlich'

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  vertraege:   'Verträge',
  finanzen:    'Finanzen',
  gesundheit:  'Gesundheit',
  persoenlich: 'Persönlich',
}

export interface PrivateDoc {
  id:         string
  name:       string         // Anzeige-Name (frei)
  filename:   string         // Original-Filename
  category:   DocCategory
  mime:       string
  size:       number         // Bytes
  /** Data-URL — bei Files unter dem Limit. Sonst undefined (Metadata-only). */
  dataUrl?:   string
  uploadedAt: string         // ISO
}

interface State {
  docs: PrivateDoc[]
  add:    (input: Omit<PrivateDoc, 'id' | 'uploadedAt'>) => string
  rename: (id: string, name: string) => void
  recategorize: (id: string, category: DocCategory) => void
  remove: (id: string) => void
}

const uid = () => `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const usePrivateDocsStore = create<State>()(
  persist(
    (set) => ({
      docs: [],
      add: (input) => {
        const doc: PrivateDoc = {
          ...input,
          id: uid(),
          uploadedAt: new Date().toISOString(),
        }
        set(s => ({ docs: [doc, ...s.docs] }))
        return doc.id
      },
      rename: (id, name) =>
        set(s => ({ docs: s.docs.map(d => d.id === id ? { ...d, name } : d) })),
      recategorize: (id, category) =>
        set(s => ({ docs: s.docs.map(d => d.id === id ? { ...d, category } : d) })),
      remove: (id) => set(s => ({ docs: s.docs.filter(d => d.id !== id) })),
    }),
    { name: 'cynera-private-docs-v1' },
  )
)

// 5 MB Limit — Data-URLs darueber blasen den localStorage zu schnell auf.
export const MAX_INLINE_BYTES = 5 * 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
