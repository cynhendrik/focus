import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('@tauri-apps/api/fs', () => ({
  writeBinaryFile: vi.fn().mockResolvedValue(undefined),
  readBinaryFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  removeFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
  BaseDirectory: { AppData: 'AppData' },
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/appdata'),
}))
