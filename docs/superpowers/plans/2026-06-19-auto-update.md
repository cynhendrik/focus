# Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cultera Focus prüft beim Start und periodisch auf neue Versionen über GitHub Releases und bietet dem Nutzer per Banner an, das signierte Update zu laden und neu zu starten.

**Architecture:** Tauri-2-Updater-Plugin lädt eine signierte `latest.json` von GitHub Releases. Eine reine Zustandsmaschine (`update.store.ts`) hält den Phasenzustand; ein Service (`updater.ts`) kapselt das Plugin (no-op außerhalb Tauri); ein Banner (`UpdateBanner.tsx`, Stil des bestehenden `DownloadToast`) rendert pro Phase. Release-Auslieferung läuft über ein manuelles Publish-Gate (CI legt Entwurfs-Release an).

**Tech Stack:** Tauri 2 (`tauri-plugin-updater`, `tauri-plugin-process`), React 18, Zustand, Vitest, `@testing-library/react`, GitHub Actions (`tauri-action`).

**Spec:** `docs/superpowers/specs/2026-06-19-auto-update-design.md`

---

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `src-tauri/Cargo.toml` | Rust-Plugin-Deps | Modify |
| `src-tauri/src/main.rs` | Plugin-Registrierung im Builder | Modify (`:117`) |
| `src-tauri/capabilities/main.json` | Updater/Process-Permissions | Modify |
| `src-tauri/tauri.conf.json` | Updater-Endpoint + pubkey | Modify |
| `.github/workflows/build.yml` | Signing-Env-Vars in CI | Modify |
| `package.json` | JS-Plugin-Deps | Modify (via `npm i`) |
| `src/store/update.store.ts` | Reine Phasen-Zustandsmaschine | Create |
| `src/store/update.store.test.ts` | Store-Tests | Create |
| `src/services/updater.ts` | Plugin-Orchestrierung (Tauri-only) | Create |
| `src/services/updater.test.ts` | Service-Tests (Plugin gemockt) | Create |
| `src/components/ui/UpdateBanner.tsx` | Banner-UI pro Phase | Create |
| `src/components/ui/UpdateBanner.test.tsx` | Banner-Render-Tests | Create |
| `src/App.tsx` | Check-Timing + Banner-Mount | Modify (`:285`) |

---

## Prerequisite (manueller Entwickler-Schritt — NICHT vom Agenten ausführbar)

Diese drei Schritte erledigt **Hendrik** vor oder parallel zu Task 2. Der Agent fügt in Task 2 einen Platzhalter ein und markiert ihn.

1. Keypair erzeugen (im Repo-Root):
   ```bash
   npm run tauri signer generate -- -w ./cultera-focus-updater.key
   ```
   Ein Passwort vergeben. Ausgabe: `cultera-focus-updater.key` (privat) + `cultera-focus-updater.key.pub` (öffentlich). **Die `.key`-Datei NICHT committen** (liegt unter `.gitignore`-Schutz prüfen).
2. Inhalt von `cultera-focus-updater.key.pub` → in `tauri.conf.json` unter `plugins.updater.pubkey` einsetzen (ersetzt den Platzhalter aus Task 2).
3. GitHub-Secrets im Repo `cynhendrik/focus` setzen (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` = vollständiger Inhalt der `.key`-Datei
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = das vergebene Passwort

---

## Task 1: Plugins installieren & registrieren

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs:117`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `package.json` (via npm)

- [ ] **Step 1: JS-Plugins installieren**

```bash
npm i @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

- [ ] **Step 2: Rust-Plugins zu `Cargo.toml` hinzufügen**

In `src-tauri/Cargo.toml` im `[dependencies]`-Block (nach der `tauri = { ... }`-Zeile) ergänzen:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 3: Plugins im Builder registrieren**

In `src-tauri/src/main.rs` die Zeile `tauri::Builder::default()` (`:117`) so erweitern, dass die Plugins VOR `.setup(` registriert werden:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
```

- [ ] **Step 4: Permissions in `capabilities/main.json` ergänzen**

Im `permissions`-Array (nach `"core:image:default"`) ergänzen:

```json
    "core:image:default",
    "updater:default",
    "process:allow-restart"
```

- [ ] **Step 5: Rust-Build verifizieren**

Run: `cd src-tauri && cargo build`
Expected: Kompiliert ohne Fehler; `tauri-plugin-updater` und `tauri-plugin-process` erscheinen in der Build-Ausgabe.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/capabilities/main.json package.json package-lock.json
git commit -m "feat(update): add updater + process plugins"
```

---

## Task 2: Updater-Endpoint in tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: `plugins.updater`-Section ergänzen**

In `src-tauri/tauri.conf.json` nach dem `bundle`-Block (vor der schließenden `}`) einen `plugins`-Block hinzufügen. Der `pubkey` ist ein PLATZHALTER, den Hendrik im Prerequisite-Schritt 2 mit dem echten Public Key ersetzt:

```jsonc
  "bundle": {
    ...
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/cynhendrik/focus/releases/latest/download/latest.json"
      ],
      "pubkey": "PLATZHALTER_PUBKEY_AUS_PREREQUISITE_SCHRITT_2"
    }
  }
```

- [ ] **Step 2: Config-Validität verifizieren**

Run: `cd src-tauri && cargo build`
Expected: Kompiliert ohne Fehler (Config wird beim Build geparst). Hinweis: Mit Platzhalter-pubkey schlägt erst ein echter `check()`-Aufruf zur Laufzeit fehl — das ist erwartet, bis Hendrik den echten Key einsetzt.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(update): configure updater endpoint (GitHub Releases)"
```

---

## Task 3: CI-Signing in build.yml

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Signing-Env-Vars im tauri-action-Step ergänzen**

In `.github/workflows/build.yml` im `env:`-Block des „Tauri bauen"-Steps (nach der `GITHUB_TOKEN`-Zeile) ergänzen:

```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          VITE_LOCAL_MODE: 'true'
```

(`releaseDraft: true` und alle übrigen Zeilen bleiben unverändert — das ist das manuelle Publish-Gate.)

- [ ] **Step 2: YAML-Syntax verifizieren**

Run: `npx --yes js-yaml .github/workflows/build.yml > /dev/null && echo OK`
Expected: `OK` (gültiges YAML).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci(update): sign updater artifacts in build workflow"
```

---

## Task 4: update.store.ts (Phasen-Zustandsmaschine)

**Files:**
- Create: `src/store/update.store.ts`
- Test: `src/store/update.store.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/store/update.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUpdateStore } from './update.store'

const fakeUpdate = { version: '2.1.0', downloadAndInstall: async () => {} }

describe('update.store', () => {
  beforeEach(() => useUpdateStore.getState().reset())

  it('startet im idle-Zustand', () => {
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.version).toBe('')
    expect(s.progress).toBe(0)
  })

  it('setAvailable speichert Version + Update und setzt phase=available', () => {
    useUpdateStore.getState().setAvailable(fakeUpdate)
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('available')
    expect(s.version).toBe('2.1.0')
    expect(s.update).toBe(fakeUpdate)
  })

  it('Download-Fluss: downloading → progress → ready', () => {
    const st = useUpdateStore.getState()
    st.setAvailable(fakeUpdate)
    st.setDownloading()
    expect(useUpdateStore.getState().phase).toBe('downloading')
    st.setProgress(80)
    expect(useUpdateStore.getState().progress).toBe(80)
    st.setReady()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.progress).toBe(100)
  })

  it('setError setzt phase=error mit Nachricht', () => {
    useUpdateStore.getState().setError('kaputt')
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('error')
    expect(s.errorMsg).toBe('kaputt')
  })

  it('dismiss merkt die Version und geht zurück zu idle', () => {
    const st = useUpdateStore.getState()
    st.setAvailable(fakeUpdate)
    st.dismiss()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.dismissedVersion).toBe('2.1.0')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/store/update.store.test.ts`
Expected: FAIL mit „Failed to resolve import './update.store'" o. ä.

- [ ] **Step 3: Store implementieren**

`src/store/update.store.ts`:

```ts
import { create } from 'zustand'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'ready' | 'error'

/** Strukturelle Minimal-Form des Tauri-`Update`-Objekts — entkoppelt Store/Service
 *  vom Plugin, damit der Store ohne Plugin-Mock testbar bleibt. Das echte
 *  `Update` aus `@tauri-apps/plugin-updater` ist hierauf zuweisbar. */
export interface PendingUpdate {
  version: string
  downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>
}

interface UpdateState {
  phase: UpdatePhase
  version: string
  progress: number          // 0–100
  errorMsg: string
  dismissedVersion: string | null
  update: PendingUpdate | null

  setAvailable: (update: PendingUpdate) => void
  setDownloading: () => void
  setProgress: (pct: number) => void
  setReady: () => void
  setError: (msg: string) => void
  dismiss: () => void
  reset: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  phase: 'idle',
  version: '',
  progress: 0,
  errorMsg: '',
  dismissedVersion: null,
  update: null,

  setAvailable: (update) => set({ phase: 'available', version: update.version, update, progress: 0 }),
  setDownloading: () => set({ phase: 'downloading', progress: 0 }),
  setProgress: (pct) => set({ progress: pct }),
  setReady: () => set({ phase: 'ready', progress: 100 }),
  setError: (msg) => set({ phase: 'error', errorMsg: msg }),
  dismiss: () => set({ phase: 'idle', dismissedVersion: get().version || get().dismissedVersion }),
  reset: () => set({ phase: 'idle', version: '', progress: 0, errorMsg: '', update: null }),
}))
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/store/update.store.test.ts`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/store/update.store.ts src/store/update.store.test.ts
git commit -m "feat(update): phase state machine store"
```

---

## Task 5: updater.ts (Service, Plugin gemockt)

**Files:**
- Create: `src/services/updater.ts`
- Test: `src/services/updater.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/services/updater.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const check = vi.fn()
const relaunch = vi.fn()
const isTauri = vi.fn(() => true)

vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...a: unknown[]) => check(...a) }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: (...a: unknown[]) => relaunch(...a) }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }))

import { checkForUpdate, startDownload, restartApp } from './updater'
import { useUpdateStore } from '@/store/update.store'

beforeEach(() => {
  check.mockReset(); relaunch.mockReset(); isTauri.mockReturnValue(true)
  useUpdateStore.getState().reset()
  useUpdateStore.setState({ dismissedVersion: null })
})

describe('checkForUpdate', () => {
  it('no-op außerhalb von Tauri', async () => {
    isTauri.mockReturnValue(false)
    await checkForUpdate()
    expect(check).not.toHaveBeenCalled()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })

  it('kein Update verfügbar → bleibt idle', async () => {
    check.mockResolvedValue(null)
    await checkForUpdate()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })

  it('Update verfügbar → phase=available', async () => {
    check.mockResolvedValue({ version: '2.1.0', downloadAndInstall: vi.fn() })
    await checkForUpdate()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('available')
    expect(s.version).toBe('2.1.0')
  })

  it('bereits abgelehnte Version wird nicht erneut angezeigt', async () => {
    useUpdateStore.setState({ dismissedVersion: '2.1.0' })
    check.mockResolvedValue({ version: '2.1.0', downloadAndInstall: vi.fn() })
    await checkForUpdate()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })
})

describe('startDownload', () => {
  it('berechnet Fortschritt aus Events und endet bei ready', async () => {
    const downloadAndInstall = vi.fn(async (onEvent: (e: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      onEvent({ event: 'Progress', data: { chunkLength: 40 } })
      onEvent({ event: 'Progress', data: { chunkLength: 60 } })
      onEvent({ event: 'Finished' })
    })
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall })
    await startDownload()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.progress).toBe(100)
  })

  it('Fehler beim Download → phase=error', async () => {
    const downloadAndInstall = vi.fn(async () => { throw new Error('netz weg') })
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall })
    await startDownload()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('error')
    expect(s.errorMsg).toContain('netz weg')
  })
})

describe('restartApp', () => {
  it('ruft relaunch', async () => {
    await restartApp()
    expect(relaunch).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/services/updater.test.ts`
Expected: FAIL mit „Failed to resolve import './updater'".

- [ ] **Step 3: Service implementieren**

`src/services/updater.ts`:

```ts
import { isTauri } from '@tauri-apps/api/core'
import { useUpdateStore } from '@/store/update.store'

/** Prüft auf ein Update. No-op außerhalb von Tauri (Dev/Web) und wenn die
 *  gefundene Version in dieser Session bereits weggeklickt wurde. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return
    if (update.version === useUpdateStore.getState().dismissedVersion) return
    useUpdateStore.getState().setAvailable(update)
  } catch (err) {
    // Stiller Fehlschlag beim Check — kein Banner, App läuft normal weiter.
    console.error('[updater] check fehlgeschlagen:', err)
  }
}

/** Lädt das verfügbare Update und installiert es (Progress → Store). */
export async function startDownload(): Promise<void> {
  const update = useUpdateStore.getState().update
  if (!update) return
  useUpdateStore.getState().setDownloading()
  let total = 0
  let downloaded = 0
  try {
    await update.downloadAndInstall((event: any) => {
      switch (event?.event) {
        case 'Started':
          total = event.data?.contentLength ?? 0
          break
        case 'Progress':
          downloaded += event.data?.chunkLength ?? 0
          useUpdateStore.getState().setProgress(total ? Math.round((downloaded / total) * 100) : 0)
          break
        case 'Finished':
          useUpdateStore.getState().setProgress(100)
          break
      }
    })
    useUpdateStore.getState().setReady()
  } catch (err) {
    useUpdateStore.getState().setError(err instanceof Error ? err.message : String(err))
  }
}

/** Startet die App neu (übernimmt das installierte Update). */
export async function restartApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/services/updater.test.ts`
Expected: PASS (7 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/services/updater.ts src/services/updater.test.ts
git commit -m "feat(update): updater service (check/download/restart)"
```

---

## Task 6: UpdateBanner.tsx

**Files:**
- Create: `src/components/ui/UpdateBanner.tsx`
- Test: `src/components/ui/UpdateBanner.test.tsx`

- [ ] **Step 1: Failing test schreiben**

`src/components/ui/UpdateBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner'
import { useUpdateStore } from '@/store/update.store'

vi.mock('@/services/updater', () => ({
  startDownload: vi.fn(),
  restartApp: vi.fn(),
}))

beforeEach(() => useUpdateStore.getState().reset())
afterEach(cleanup)

describe('UpdateBanner', () => {
  it('rendert nichts im idle-Zustand', () => {
    const { container } = render(<UpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt im available-Zustand Version + Laden-Button', () => {
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall: vi.fn() })
    render(<UpdateBanner />)
    expect(screen.getByText(/2\.1\.0/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /laden/i })).toBeTruthy()
  })

  it('zeigt im downloading-Zustand den Fortschritt', () => {
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall: vi.fn() })
    useUpdateStore.getState().setDownloading()
    useUpdateStore.getState().setProgress(42)
    render(<UpdateBanner />)
    expect(screen.getByText(/42\s*%/)).toBeTruthy()
  })

  it('zeigt im ready-Zustand den Neu-starten-Button', () => {
    useUpdateStore.getState().setReady()
    render(<UpdateBanner />)
    expect(screen.getByRole('button', { name: /neu starten/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:run -- src/components/ui/UpdateBanner.test.tsx`
Expected: FAIL mit „Failed to resolve import './UpdateBanner'".

- [ ] **Step 3: Komponente implementieren**

`src/components/ui/UpdateBanner.tsx` (Stil/Position bewusst am bestehenden `DownloadToast` orientiert — fixed unten rechts, gleiche Optik):

```tsx
import { useUpdateStore } from '@/store/update.store'
import { startDownload, restartApp } from '@/services/updater'
import { Download, RefreshCw, AlertCircle } from 'lucide-react'

export function UpdateBanner() {
  const phase    = useUpdateStore(s => s.phase)
  const version  = useUpdateStore(s => s.version)
  const progress = useUpdateStore(s => s.progress)
  const errorMsg = useUpdateStore(s => s.errorMsg)
  const dismiss  = useUpdateStore(s => s.dismiss)

  if (phase === 'idle') return null

  return (
    <div
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9998,
        minWidth: 300, maxWidth: 360, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 8px 32px oklch(0% 0 0 / 0.35), 0 0 0 1px oklch(100% 0 0 / 0.08)',
        background: 'oklch(16% 0 0 / 0.95)', backdropFilter: 'blur(20px)',
        animation: 'toast-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}
    >
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: phase === 'error' ? 'oklch(28% 0.06 25)' : 'oklch(56% 0.19 264)' }}>
          {phase === 'error'
            ? <AlertCircle size={20} style={{ color: 'oklch(75% 0.2 25)' }} />
            : phase === 'ready'
              ? <RefreshCw size={18} style={{ color: '#fff' }} />
              : <Download size={18} style={{ color: '#fff' }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', marginBottom: 2 }}>
            {label(phase, version)}
          </div>
          <div style={{ fontSize: 11, color: 'oklch(70% 0 0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {phase === 'downloading' ? `${progress} %`
              : phase === 'error'    ? errorMsg
              : phase === 'ready'    ? 'Neustart übernimmt die neue Version'
              : `Version ${version}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {phase === 'available' && (
            <>
              <button onClick={() => startDownload()} style={btnPrimary}>Jetzt laden</button>
              <button onClick={() => dismiss()} style={btnGhost}>Später</button>
            </>
          )}
          {phase === 'ready' && (
            <>
              <button onClick={() => restartApp()} style={btnPrimary}>Neu starten</button>
              <button onClick={() => dismiss()} style={btnGhost}>Später</button>
            </>
          )}
          {phase === 'error' && (
            <button onClick={() => dismiss()} style={btnGhost}>Schließen</button>
          )}
        </div>
      </div>

      {phase === 'downloading' && (
        <div style={{ height: 3, background: 'oklch(25% 0 0)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'oklch(56% 0.19 264)', transition: 'width 180ms ease' }} />
        </div>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#fff', border: 'none', borderRadius: 8,
  padding: '6px 10px', background: 'oklch(56% 0.19 264)', cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'oklch(70% 0 0)', border: 'none', borderRadius: 8,
  padding: '6px 8px', background: 'transparent', cursor: 'pointer',
}

function label(phase: string, version: string): string {
  if (phase === 'available')   return 'Update verfügbar'
  if (phase === 'downloading') return `Lade Update ${version}…`
  if (phase === 'ready')       return 'Update bereit'
  if (phase === 'error')       return 'Update fehlgeschlagen'
  return ''
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:run -- src/components/ui/UpdateBanner.test.tsx`
Expected: PASS (4 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/UpdateBanner.tsx src/components/ui/UpdateBanner.test.tsx
git commit -m "feat(update): update banner component"
```

---

## Task 7: In App.tsx verdrahten (Check-Timing + Mount)

**Files:**
- Modify: `src/App.tsx` (Import-Block, ein neuer Effekt, Mount bei `:285`)

- [ ] **Step 1: Imports ergänzen**

In `src/App.tsx` bei den UI-Importen (nach Zeile 65, `import { DownloadToast } ...`) ergänzen:

```tsx
import { DownloadToast }        from '@/components/ui/DownloadToast'
import { UpdateBanner }         from '@/components/ui/UpdateBanner'
import { checkForUpdate }       from '@/services/updater'
```

- [ ] **Step 2: Check-Effekt hinzufügen**

In `src/App.tsx` direkt nach dem Intro-Splash-Effekt (nach `:117`, dem `}, [])` des Splash-`useEffect`) einen neuen Effekt einfügen:

```tsx
  // Auto-Update: ~3 s nach Start prüfen, danach alle 6 h. No-op außerhalb Tauri.
  useEffect(() => {
    const SIX_HOURS = 6 * 60 * 60 * 1000
    const first = setTimeout(() => { void checkForUpdate() }, 3000)
    const iv = setInterval(() => { void checkForUpdate() }, SIX_HOURS)
    return () => { clearTimeout(first); clearInterval(iv) }
  }, [])
```

- [ ] **Step 3: Banner mounten**

In `src/App.tsx` direkt nach `<DownloadToast />` (`:285`) ergänzen:

```tsx
      <DownloadToast />
      <UpdateBanner />
```

- [ ] **Step 4: Typecheck + volle Testsuite**

Run: `npm run typecheck && npm run test:run`
Expected: Typecheck ohne Fehler; alle Tests grün (inkl. der neuen Store/Service/Banner-Tests).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(update): wire update check + banner into App"
```

---

## Abschluss-Verifikation (manuell, nach Prerequisite + Tasks)

Nicht automatisierbar — erfordert echtes Release. Reihenfolge:

1. Prerequisite vollständig (Keypair erzeugt, pubkey in `tauri.conf.json`, beide GitHub-Secrets gesetzt).
2. Version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` auf eine höhere Testversion ziehen (z. B. `2.0.1`).
3. `git tag v2.0.1 && git push origin v2.0.1` → CI baut + signiert → Entwurfs-Release entsteht mit `latest.json` + signierten Installern.
4. Entwurfs-Release in GitHub auf **„Publish"** setzen.
5. Eine ältere Build-Version lokal/auf Testrechner starten → nach ≤ 3 s erscheint der Banner „Update verfügbar: 2.0.1" → „Jetzt laden" → Fortschritt → „Neu starten" → App startet in neuer Version.

---

## Self-Review-Notiz

- **Spec-Abdeckung:** Quelle GitHub Releases (Task 2/3), Hinweis-zuerst-UX mit Später (Task 6), manuelles Publish-Gate (`releaseDraft` bleibt, Task 3 + Abschluss-Schritt 4), Check beim Start + 6 h (Task 7), Signatur-Prerequisite (oben), Permissions (Task 1) — alle Spec-Punkte haben eine Task.
- **Typkonsistenz:** `PendingUpdate`/`setAvailable`/`setDownloading`/`setProgress`/`setReady`/`setError`/`dismiss`/`reset` identisch in Store (Task 4), Service (Task 5) und Banner (Task 6).
- **Bewusst außerhalb Scope (Spec):** Pflicht-Updates, Code-Signing-Zertifikat, Windows-UAC — keine Tasks, wie spezifiziert.
