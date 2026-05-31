// ─────────────────────────────────────────────────────────────────────────────
// Private Dokumente — Verträge, Finanzen, Gesundheit, Persönlich.
// MVP: Datei wird als Data-URL im localStorage gespeichert (bis 5 MB), bei
// groesseren Files nur Metadaten. Tabs zum Filtern.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { Folder, Plus, Download, Trash2, FileText, Image as ImageIcon, FileArchive, File } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  usePrivateDocsStore,
  DOC_CATEGORY_LABEL,
  formatBytes,
  MAX_INLINE_BYTES,
  type DocCategory, type PrivateDoc,
} from '@/store/private-docs.store'

type Tab = 'alle' | DocCategory

const TABS: { id: Tab; label: string }[] = [
  { id: 'alle',        label: 'Alle' },
  { id: 'vertraege',   label: 'Verträge' },
  { id: 'finanzen',    label: 'Finanzen' },
  { id: 'gesundheit',  label: 'Gesundheit' },
  { id: 'persoenlich', label: 'Persönlich' },
]

function iconFor(mime: string): LucideIcon {
  if (mime.startsWith('image/'))                       return ImageIcon
  if (mime.includes('zip') || mime.includes('rar'))    return FileArchive
  if (mime.includes('pdf') || mime.includes('text'))   return FileText
  return File
}

function shortMime(mime: string): string {
  if (mime === 'application/pdf')                 return 'PDF'
  if (mime.startsWith('image/jpeg'))              return 'JPG'
  if (mime.startsWith('image/png'))               return 'PNG'
  if (mime.includes('zip'))                       return 'ZIP'
  if (mime.includes('word'))                      return 'DOCX'
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLSX'
  return (mime.split('/')[1] ?? mime).slice(0, 4).toUpperCase()
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }).replace('.', '')
}

export function PrivateDocsRoute() {
  const docs = usePrivateDocsStore(s => s.docs)
  const [tab, setTab] = useState<Tab>('alle')
  const filtered = useMemo(
    () => tab === 'alle' ? docs : docs.filter(d => d.category === tab),
    [docs, tab],
  )

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="priv-section-label">
        <Folder size={11} /> Private Dokumente
      </div>

      <h1 className="priv-title">Sicher verwahrt.</h1>
      <p className="priv-subtitle">
        Verträge, Finanzielles, Gesundheit — getrennt vom Client-Archiv und nur für
        dich sichtbar.
      </p>

      {/* ── Tabs + Upload ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18, gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '7px 13px', borderRadius: 8,
                background: tab === t.id ? 'oklch(100% 0 0 / 0.05)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: tab === t.id ? 'var(--priv-fg)' : 'var(--priv-fg-dim)',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                transition: 'color 140ms, background 140ms',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <UploadButton defaultCategory={tab === 'alle' ? 'persoenlich' : tab} />
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '36px 24px', borderRadius: 12,
          border: '1px dashed var(--priv-border)',
          color: 'var(--priv-fg-dim)', fontSize: 12.5,
          textAlign: 'center',
        }}>
          Nichts in dieser Kategorie. Klick „+ Hochladen" und leg los.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {filtered.map(d => <DocCard key={d.id} doc={d} />)}
        </div>
      )}
    </div>
  )
}

// ── DocCard ─────────────────────────────────────────────────────────────────

function DocCard({ doc }: { doc: PrivateDoc }) {
  const remove = usePrivateDocsStore(s => s.remove)
  const Ic = iconFor(doc.mime)
  const [hover, setHover] = useState(false)

  const download = () => {
    if (!doc.dataUrl) return
    const a = document.createElement('a')
    a.href = doc.dataUrl
    a.download = doc.filename
    a.click()
  }

  return (
    <div
      className="priv-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: 16, position: 'relative' }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: 'oklch(100% 0 0 / 0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--priv-fg-muted)', marginBottom: 12,
      }}>
        <Ic size={16} />
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--priv-fg)',
        marginBottom: 4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {doc.name}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--priv-fg-dim)', marginBottom: 10,
      }}>
        {DOC_CATEGORY_LABEL[doc.category]}
      </div>
      <div style={{
        display: 'flex', gap: 8,
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--priv-fg-dim)',
      }}>
        <span>{shortMime(doc.mime)}</span>
        <span>·</span>
        <span>{formatBytes(doc.size)}</span>
        <span>·</span>
        <span>{monthLabel(doc.uploadedAt)}</span>
      </div>

      {hover && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          display: 'flex', gap: 4,
        }}>
          {doc.dataUrl && (
            <button onClick={download} title="Download" style={iconBtnStyle}>
              <Download size={11} />
            </button>
          )}
          <button onClick={() => remove(doc.id)} title="Loeschen" style={iconBtnStyle}>
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6,
  background: 'oklch(100% 0 0 / 0.04)', border: 'none', cursor: 'pointer',
  color: 'var(--priv-fg-dim)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ── Upload-Button ──────────────────────────────────────────────────────────

function UploadButton({ defaultCategory }: { defaultCategory: DocCategory }) {
  const add = usePrivateDocsStore(s => s.add)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) {
      let dataUrl: string | undefined
      if (f.size <= MAX_INLINE_BYTES) {
        dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result))
          r.onerror = () => rej(r.error)
          r.readAsDataURL(f)
        })
      }
      add({
        name: f.name.replace(/\.[^.]+$/, ''),
        filename: f.name,
        category: defaultCategory,
        mime: f.type || 'application/octet-stream',
        size: f.size,
        dataUrl,
      })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <button onClick={() => fileRef.current?.click()} className="priv-btn-ghost">
        <Plus size={12} /> Hochladen
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={onPick}
      />
    </>
  )
}
