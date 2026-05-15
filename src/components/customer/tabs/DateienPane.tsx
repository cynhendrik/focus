import { useRef } from 'react'
import { useFilesStore } from '@/store/files.store'

const MAX_BYTES = 50 * 1024 * 1024

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return '📎'
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType === 'application/pdf') return '📄'
  return '📎'
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Props { customerId: string }

export function DateienPane({ customerId }: Props) {
  const folders        = useFilesStore(s => s.folders)
  const files          = useFilesStore(s => s.files)
  const activeFolderId = useFilesStore(s => s.activeFolderId)
  const isLoading      = useFilesStore(s => s.isLoading)
  const error          = useFilesStore(s => s.error)
  const setActiveFolder = useFilesStore(s => s.setActiveFolder)
  const loadFiles      = useFilesStore(s => s.loadFiles)
  const createFolder   = useFilesStore(s => s.createFolder)
  const removeFolder   = useFilesStore(s => s.removeFolder)
  const importFile     = useFilesStore(s => s.importFile)
  const removeFile     = useFilesStore(s => s.removeFile)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectFolder = async (id: string | null) => {
    setActiveFolder(id)
    await loadFiles(customerId, id)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß (max. 50 MB)')
      return
    }
    const buffer = await file.arrayBuffer()
    const data = Array.from(new Uint8Array(buffer))
    await importFile({
      customerId,
      folderId: activeFolderId,
      name: file.name,
      data,
      mimeType: file.type || null,
    })
    e.target.value = ''
  }

  const addFolder = async () => {
    const name = prompt('Ordnername:')
    if (!name?.trim()) return
    await createFolder({ customerId, name: name.trim(), parentId: activeFolderId })
  }

  return (
    <div className="flex h-full">
      {/* Folder tree */}
      <div className="w-48 border-r border-[var(--border)] p-4 flex flex-col gap-1 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">Ordner</p>
          <button onClick={addFolder} className="text-xs text-primary hover:text-primary-dark">+</button>
        </div>

        <button
          onClick={() => selectFolder(null)}
          className={`w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors
            ${activeFolderId === null ? 'bg-primary/10 text-primary' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          Alle Dateien
        </button>

        {folders.map(folder => (
          <div key={folder.id} className="flex items-center gap-1 group">
            <button
              onClick={() => selectFolder(folder.id)}
              className={`flex-1 text-left text-sm px-2 py-1.5 rounded-lg transition-colors truncate
                ${activeFolderId === folder.id ? 'bg-primary/10 text-primary' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
            >
              📁 {folder.name}
            </button>
            <button
              onClick={() => removeFolder(folder.id)}
              className="text-[var(--text2)] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* File grid */}
      <div className="flex-1 p-5 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-[var(--text2)]">
            {files.length} Datei{files.length !== 1 ? 'en' : ''}
          </p>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark"
            >
              + Datei hinzufügen
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error.message}</p>}
        {isLoading && <p className="text-sm text-[var(--text2)]">Lädt…</p>}

        {files.length === 0 && !isLoading ? (
          <div className="text-center py-16">
            <p className="text-[var(--text2)] text-sm">Keine Dateien</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {files.map(file => (
              <div
                key={file.id}
                className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg1)] flex flex-col gap-2 group relative"
              >
                <span className="text-3xl">{fileIcon(file.mimeType)}</span>
                <p className="text-sm font-medium text-[var(--text)] truncate">{file.name}</p>
                {file.size && <p className="text-xs text-[var(--text2)]">{formatSize(file.size)}</p>}
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute top-2 right-2 text-[var(--text2)] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
