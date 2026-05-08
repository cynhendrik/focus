import { useEffect, useState } from 'react'
import { useFilesStore } from '@/store/files.store'

interface Props {
  customerId: string
}

export function AblagePane({ customerId }: Props) {
  const {
    folders, files, activeFolderId,
    loadForCustomer, loadFiles, setActiveFolder,
    createFolder, removeFolder, removeFile,
  } = useFilesStore()

  const [newFolderName, setNewFolderName] = useState('')

  useEffect(() => {
    loadForCustomer(customerId)
    loadFiles(customerId, null)
  }, [customerId])

  const activeFolder = folders.find(f => f.id === activeFolderId) ?? null

  const handleSelectFolder = (id: string | null) => {
    setActiveFolder(id)
    loadFiles(customerId, id)
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    await createFolder({ customerId, name })
    setNewFolderName('')
  }

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 0 }}>
      {/* Sidebar — folders */}
      <div className="w-48 flex-shrink-0 flex flex-col gap-1">
        <button
          onClick={() => handleSelectFolder(null)}
          className={`text-left text-sm px-3 py-2 rounded-lg transition-colors
            ${activeFolderId === null ? 'bg-primary text-white' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          Alle Dateien
        </button>
        {folders.map(folder => (
          <div key={folder.id} className="flex items-center group">
            <button
              onClick={() => handleSelectFolder(folder.id)}
              className={`flex-1 text-left text-sm px-3 py-2 rounded-lg transition-colors truncate
                ${activeFolderId === folder.id ? 'bg-primary text-white' : 'text-[var(--text)] hover:bg-[var(--bg1)]'}`}
            >
              📁 {folder.name}
            </button>
            <button
              onClick={() => removeFolder(folder.id)}
              className="opacity-0 group-hover:opacity-100 px-1 text-[var(--text2)] hover:text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex gap-1 mt-2">
          <input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Neuer Ordner…"
            className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleCreateFolder}
            className="px-2 py-1.5 rounded-lg bg-primary text-white text-xs hover:bg-primary-dark"
          >
            +
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <p className="text-xs text-[var(--text2)] mb-3">
          {activeFolder ? `Ordner: ${activeFolder.name}` : 'Alle Dateien'}
        </p>
        {files.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-8">Keine Dateien</p>
        )}
        <div className="flex flex-col gap-1">
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg1)] group"
            >
              <span className="text-lg">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{file.name}</p>
                {file.size !== null && (
                  <p className="text-xs text-[var(--text2)]">{formatBytes(file.size)}</p>
                )}
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
