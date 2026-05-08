import { writeBinaryFile, readBinaryFile, removeFile, createDir, BaseDirectory } from '@tauri-apps/api/fs'

export const createFilesSlice = () => ({
  writeTauriFile: async (tauriPath, uint8Array) => {
    const dir = tauriPath.substring(0, tauriPath.lastIndexOf('/'))
    await createDir(dir, { dir: BaseDirectory.AppData, recursive: true })
    await writeBinaryFile(tauriPath, uint8Array, { dir: BaseDirectory.AppData })
  },
  readTauriFile: async (tauriPath) => {
    return readBinaryFile(tauriPath, { dir: BaseDirectory.AppData })
  },
  deleteTauriFile: async (tauriPath) => {
    await removeFile(tauriPath, { dir: BaseDirectory.AppData }).catch(() => {})
  },
})
