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

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))

// jsdom does not implement the Blob URL APIs. Polyfill with distinguishable
// per-call values (not a constant string) so tests can assert that the
// specific blob URL that was created is the one that gets revoked.
let mockObjectUrlCounter = 0
URL.createObjectURL = vi.fn(() => `blob:mock-url-${mockObjectUrlCounter++}`)
URL.revokeObjectURL = vi.fn()
