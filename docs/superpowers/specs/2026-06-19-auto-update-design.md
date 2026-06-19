# Auto-Update für Cultera Focus — Design

**Datum:** 2026-06-19
**Status:** Genehmigt, bereit für Implementierungsplan
**Kontext:** Tauri-2-Desktop-App, public GitHub-Repo `cynhendrik/focus`, bestehende CI (`build.yml`) baut Installer via `tauri-action`.

## Ziel

Kunden (Tester) bekommen automatisch einen Hinweis, dass eine neue Version verfügbar ist,
und können sie mit zwei Klicks laden und neu starten — ohne manuelles Verschicken oder
Neuinstallation. Der Entwickler-Workflow zum Ausliefern ist: Version hochziehen → Tag pushen
→ CI baut + signiert → in GitHub auf „Publish" klicken.

## Entscheidungen (aus Brainstorming)

| Frage | Entscheidung |
|-------|--------------|
| Update-Quelle | **GitHub Releases** (Repo ist public → kein Token im Client nötig, offizieller `tauri-action`-Pfad) |
| Benachrichtigungs-UX | **Hinweis zuerst, Nutzer startet Download** — schließbarer Banner, dann Fortschritt, dann Neustart-Angebot |
| Release-Flow | **Manuelles Publish-Gate** — CI legt Entwurfs-Release an, Entwickler testet, klickt „Publish", erst dann live |
| Check-Timing | Beim Start (~3 s Verzögerung) **+ alle 6 h** |
| Pflicht-Updates | **Nein** (YAGNI für Tester-Phase) |

## Architektur in einem Satz

Das Tauri-Updater-Plugin lädt eine signierte `latest.json` von GitHub Releases; das Frontend
prüft beim Start und periodisch; ein Banner (gebaut nach dem Vorbild des bestehenden
`DownloadToast`) bietet „Jetzt laden → Fortschritt → Neu starten".

## Komponenten

### 1. Plugins & Rust (`src-tauri`)

- `Cargo.toml`: `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"` (Process für den Relaunch).
- `src-tauri/src/main.rs`: im Builder ergänzen
  - `.plugin(tauri_plugin_updater::Builder::new().build())`
  - `.plugin(tauri_plugin_process::init())`
- `src-tauri/capabilities/main.json`: Permissions ergänzen
  - `"updater:default"`
  - `"process:allow-restart"`

### 2. Signatur (einmalig, manueller Entwickler-Schritt)

Diese drei Schritte erledigt der Entwickler selbst (nicht automatisierbar):

1. Keypair erzeugen: `npm run tauri signer generate` (mit Passwort) → Public + Private Key.
2. **Public Key** → `tauri.conf.json` unter `plugins.updater.pubkey`.
3. **Private Key + Passwort** → GitHub-Secrets `TAURI_SIGNING_PRIVATE_KEY` und
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Der Implementierungsplan liefert die exakten Befehle und den Ort für den pubkey.

### 3. `tauri.conf.json`

```jsonc
"plugins": {
  "updater": {
    "endpoints": ["https://github.com/cynhendrik/focus/releases/latest/download/latest.json"],
    "pubkey": "<public key>"
  }
}
```

`releases/latest/download/` löst **nur auf veröffentlichte** (nicht-Entwurf, nicht-Prerelease)
Releases auf. Das ist genau das manuelle Publish-Gate: Solange das Release Entwurf ist, sehen
Tester nichts; mit „Publish" wird es zum „latest" und der Endpoint liefert die neue `latest.json`.

### 4. CI (`build.yml`) — minimale Ergänzung

Im `tauri-action`-Step die zwei Signing-Env-Vars ergänzen:

```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

Mit gesetztem Signing-Key signiert `tauri-action` die Installer und legt automatisch
`latest.json` als Release-Asset mit ab. `releaseDraft: true` bleibt unverändert (= das Gate).
Alle übrigen Workflow-Teile bleiben gleich.

### 5. Frontend

- **`src/store/update.store.ts`** — Zwilling von `download-toast.store.ts`. Reine
  Zustandsmaschine (zustand), unit-testbar:
  - `phase: 'idle' | 'available' | 'downloading' | 'ready' | 'error'`
  - `version: string` (verfügbare Version)
  - `progress: number` (0–100)
  - `dismissedVersion: string | null` (für „Später" pro Session)
  - hält die Referenz auf das Tauri-`Update`-Objekt
  - Aktionen: `setAvailable(update)`, `setProgress(pct)`, `setReady()`, `setError()`, `dismiss()`, `reset()`
- **`src/services/updater.ts`** — kapselt das Plugin, läuft **nur in Tauri** (im Dev/Web no-op,
  Erkennung wie im Rest der Codebase üblich):
  - `checkForUpdate()`: ruft `check()`; bei Treffer und wenn Version ≠ `dismissedVersion` →
    `setAvailable`.
  - `startDownload()`: `downloadAndInstall()` mit Progress-Event-Callback → `setProgress` →
    bei Abschluss `setReady`. Fehler → `setError`.
  - `restartApp()`: `relaunch()` aus `@tauri-apps/plugin-process`.
- **`src/components/UpdateBanner.tsx`** — schließbarer Banner im Stil des `DownloadToast`,
  rendert je nach `phase`:
  - `available` → „Update verfügbar: vX.Y.Z" · (Jetzt laden)(Später)
  - `downloading` → Fortschrittsbalken (progress)
  - `ready` → „Update bereit" · (Neu starten)(Später)
  - `error` → dezenter Fehlerhinweis (nicht blockierend)
  - „Später" ruft `dismiss()` (merkt Version für die Session).
- **Verdrahtung in `src/App.tsx`**: einmaliger Effekt — `checkForUpdate()` ~3 s nach Mount
  und danach `setInterval` alle 6 h; `<UpdateBanner />` im Layout.

### 6. JS-Abhängigkeiten

- `@tauri-apps/plugin-updater`
- `@tauri-apps/plugin-process`

## Tests

- `src/store/update.store.test.ts`: Übergänge idle→available→downloading(progress)→ready
  sowie →error; „Später"/`dismiss` setzt `dismissedVersion` und unterdrückt erneutes Anzeigen
  derselben Version.
- `UpdateBanner`-Render pro Phase mit gemocktem Store.
- Echtes End-to-end-Update (Plugin lädt + installiert echtes Release) ist nicht automatisierbar
  → wird beim ersten echten Tag manuell verifiziert.

## Bewusst NICHT im Scope (YAGNI / separat)

- **Pflicht-Updates** — abgewählt.
- **Code-Signing-Zertifikat der Installer** — ohne echtes Zertifikat zeigt Windows beim
  Erstinstall eine SmartScreen-Warnung. Getrennt vom Updater; später.
- **Windows-UAC beim Update**: Installer ist `perMachine` → der Update-Schritt löst einen
  UAC-Prompt aus. Für Tester akzeptabel; nur dokumentiert, nicht geändert.

## Wiederkehrender Liefer-Workflow (nach Implementierung)

1. Version hochziehen in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. Commit + `v*`-Tag pushen (`git tag v2.1.0 && git push --tags`).
3. CI baut + signiert → legt Entwurfs-Release mit Installern + `latest.json` an.
4. Build kurz testen, in GitHub auf **„Publish"** klicken.
5. Kunden bekommen beim nächsten Check (≤ 6 h oder App-Neustart) den Banner.
