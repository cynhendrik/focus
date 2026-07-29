# Moodboard: Schnappschuss (Snipping-Tool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Button im Moodboard-Tab eines Projekts löst eine Bildschirm-Ausschnitt-Aufnahme aus (wie das Windows Snipping Tool) und legt den Ausschnitt direkt als neues Bild-Element im Moodboard ab.

**Architektur:** Freeze-Frame-Ansatz — Rust minimiert das Hauptfenster, macht **einen** Screenshot des zuletzt aktiven Monitors (`xcap`-Crate), zeigt dieses Standbild in einem neuen, randlosen Overlay-Fenster an. Das Overlay zeichnet die Auswahl auf dem Standbild (keine Live-Transparenz). Nach dem Ziehen wird der bereits vorhandene Screenshot in Rust zugeschnitten (`image`-Crate) und die PNG-Bytes werden über einen `tokio::sync::oneshot`-Kanal an den ursprünglichen Aufrufer zurückgegeben — der komplette Ablauf ist aus Sicht des Frontends ein einziger `await invoke(...)`-Aufruf.

**Tech Stack:** Tauri v2 (Rust-Backend, zweites Fenster zur Laufzeit erzeugt), `xcap` (Bildschirm-Capture, neu), `image` (Zuschneiden + PNG-Kodierung, neu), Vite Multi-Page-Build (zweiter HTML-Entry für das Overlay), React/TypeScript.

## Global Constraints

- **Kein neues Datenmodell**: der Schnappschuss wird als normales `MoodboardItem` vom Typ `'image'` behandelt, exakt wie ein manueller Bild-Upload — gleicher `storageKey`/`uploadMoodboardImage`-Fluss, keine neuen Felder auf `MoodboardItem`.
- **Kein globaler Hotkey**: Auslöser ist ausschließlich ein Button im Moodboard-Tab. Kein `tauri-plugin-global-shortcut`, keine Funktion bei minimierter/geschlossener App.
- **Nur der Cultera-Monitor**: kein monitorübergreifendes Overlay für v1.
- **Freeze-Frame, nicht Live-Transparenz**: ein einzelner Screenshot wird gemacht, bevor das Overlay erscheint; das Overlay zeigt dieses Standbild als normales, undurchsichtiges Bild.
- **Kein Zwischenschritt**: nach dem Loslassen landet der Ausschnitt sofort im Moodboard, keine Vorschau/Bestätigung.
- **Zu kleine Auswahl (< 4×4 Bild-Pixel) wird wie ein Abbruch behandelt**, nicht als Fehler — kein Toast, kein Item wird angelegt.
- **Zielplattform ist Windows**: `xcap` ist zwar cross-platform, Testing/Abnahme beschränkt sich hier auf Windows.
- Spec: `docs/superpowers/specs/2026-07-28-moodboard-snipping-tool-design.md`.

## Hinweis zu externen Crate-Signaturen

Task 1 und Task 2 fügen zwei für dieses Projekt neue Rust-Abhängigkeiten hinzu (`image`, `xcap`). Die Kern-Logik (Zuschnitt-Mathematik, Monitor-Abstandsmatching) ist in den Tasks vollständig ausformuliert und versionsunabhängig. Eine einzelne Stelle ist von der exakt aufgelösten Crate-Version abhängig: ob `xcap::Monitor`s Getter (`.x()`, `.y()`, `.width()`, `.height()`) direkte Werte oder ein `Result` zurückgeben. Task 2 enthält einen expliziten Verifikationsschritt dafür, bevor der Code geschrieben wird.

---

### Task 1: Rust — Zuschnitt-Logik (reine Funktion, `image`-Crate)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/screen_snip.rs`
- Modify: `src-tauri/src/main.rs:7` (Modul-Deklaration)

**Interfaces:**
- Produziert: `pub struct SnipRect { pub x: u32, pub y: u32, pub width: u32, pub height: u32 }` (mit `serde::Deserialize`, da es aus dem Frontend per `invoke`-Argument kommt), `pub const MIN_SNIP_SIZE: u32 = 4`, `pub fn crop_to_png(image: &image::RgbaImage, rect: SnipRect) -> Result<Vec<u8>, String>`.
- Wird konsumiert von: Task 2 (`capture_monitor_at` nutzt denselben Modul-Namensraum) und Task 3 (`commands/screen_snip.rs` ruft `crop_to_png` auf).

- [ ] **Step 1: `image`-Crate hinzufügen**

```bash
cd src-tauri
cargo add image --features png
```

Prüfe danach in `src-tauri/Cargo.toml`, dass eine Zeile wie `image = { version = "...", features = ["png"] }` im `[dependencies]`-Block steht.

- [ ] **Step 2: Fehlschlagenden Test schreiben**

Erstelle `src-tauri/src/screen_snip.rs`:

```rust
//! Bildschirm-Schnappschuss fuer das Projekt-Moodboard: reine Zuschnitt-Logik
//! (dieses Modul) + Bildschirm-Capture (Task 2). Die Tauri-Befehle und die
//! Fenster-Orchestrierung liegen in `commands/screen_snip.rs`.

use image::RgbaImage;
use serde::Deserialize;

/// Auswahlrechteck in Bild-Pixel-Koordinaten (bereits DPI-skaliert vom Frontend).
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct SnipRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Auswahlen unterhalb dieser Kantenlaenge (in Bild-Pixeln) gelten als
/// versehentlicher Klick ohne Ziehen, nicht als gueltiger Ausschnitt.
pub const MIN_SNIP_SIZE: u32 = 4;

/// Schneidet `image` auf `rect` zu und kodiert das Ergebnis als PNG-Bytes.
/// Das Rechteck wird an die Bildgrenzen geklemmt (kein Fehler bei leichtem
/// Ueberschiessen ueber den Bildrand); erst wenn die resultierende,
/// geklemmte Groesse unter `MIN_SNIP_SIZE` faellt, wird ein Err
/// zurueckgegeben.
pub fn crop_to_png(image: &RgbaImage, rect: SnipRect) -> Result<Vec<u8>, String> {
    let clamped_w = rect.width.min(image.width().saturating_sub(rect.x));
    let clamped_h = rect.height.min(image.height().saturating_sub(rect.y));

    if clamped_w < MIN_SNIP_SIZE || clamped_h < MIN_SNIP_SIZE {
        return Err("Auswahl zu klein".to_string());
    }

    let cropped = image::imageops::crop_imm(image, rect.x, rect.y, clamped_w, clamped_h).to_image();

    let mut bytes: Vec<u8> = Vec::new();
    cropped
        .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| format!("PNG-Kodierung fehlgeschlagen: {e}"))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn test_image() -> RgbaImage {
        // 20x20 Testbild: linke Haelfte rot, rechte Haelfte blau.
        let mut img = RgbaImage::new(20, 20);
        for y in 0..20 {
            for x in 0..20 {
                let color = if x < 10 { Rgba([255, 0, 0, 255]) } else { Rgba([0, 0, 255, 255]) };
                img.put_pixel(x, y, color);
            }
        }
        img
    }

    #[test]
    fn crops_to_the_requested_rect_within_the_blue_half() {
        let img = test_image();
        let bytes = crop_to_png(&img, SnipRect { x: 12, y: 2, width: 5, height: 5 }).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(decoded.width(), 5);
        assert_eq!(decoded.height(), 5);
        assert_eq!(*decoded.get_pixel(0, 0), Rgba([0, 0, 255, 255]));
    }

    #[test]
    fn rejects_a_selection_smaller_than_the_minimum() {
        let img = test_image();
        let result = crop_to_png(&img, SnipRect { x: 0, y: 0, width: 2, height: 2 });
        assert!(result.is_err());
    }

    #[test]
    fn clamps_a_rect_that_overshoots_the_image_bounds() {
        let img = test_image(); // 20x20
        // Rechteck beginnt bei (15,15) mit Groesse 10x10 -> ueberschiesst um 5px,
        // wird auf 5x5 geklemmt (>= MIN_SNIP_SIZE, also kein Fehler).
        let bytes = crop_to_png(&img, SnipRect { x: 15, y: 15, width: 10, height: 10 }).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(decoded.width(), 5);
        assert_eq!(decoded.height(), 5);
    }

    #[test]
    fn a_rect_fully_outside_the_image_is_rejected_as_too_small() {
        let img = test_image(); // 20x20
        let result = crop_to_png(&img, SnipRect { x: 25, y: 25, width: 10, height: 10 });
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2b: Modul registrieren**

In `src-tauri/src/main.rs`, füge nach `mod engine;` (Zeile 10) eine neue Zeile hinzu:

```rust
mod screen_snip;
```

- [ ] **Step 3: Test laufen lassen, sicherstellen dass er fehlschlägt/nicht kompiliert**

```bash
cd src-tauri
cargo test screen_snip
```

Erwartet: Kompilierfehler oder Testfehler, da `screen_snip.rs` gerade erst angelegt wurde — falls es bereits kompiliert und alle vier Tests grün sind, ist das ebenfalls ein gültiger Zustand (der Code oben ist bereits die volle Implementierung, nicht nur ein Test-Stub). In dem Fall direkt zu Step 4 übergehen.

- [ ] **Step 4: Test erneut laufen lassen, sicherstellen dass er besteht**

```bash
cd src-tauri
cargo test screen_snip
```

Erwartet: `test result: ok. 4 passed; 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/screen_snip.rs src-tauri/src/main.rs
git commit -m "feat(moodboard): Zuschnitt-Logik fuer Schnappschuss-Aufnahme"
```

---

### Task 2: Rust — Bildschirm-Capture (`xcap`-Crate)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/screen_snip.rs`

**Interfaces:**
- Konsumiert: nichts aus Task 1 direkt (eigenständige Funktion im selben Modul).
- Produziert: `pub fn capture_monitor_at(x: i32, y: i32) -> Result<image::RgbaImage, String>` — sucht unter allen verfügbaren Monitoren denjenigen, dessen Position am nächsten an `(x, y)` liegt (per euklidischem Abstand der Monitor-Ursprünge), und nimmt ihn per Screenshot auf. Wird von Task 3 konsumiert (`cmd_start_screen_snip` ruft dies mit der Position des Hauptfenster-Monitors auf).

- [ ] **Step 1: `xcap`-Crate hinzufügen**

```bash
cd src-tauri
cargo add xcap
```

- [ ] **Step 2: Tatsächliche `Monitor`-API dieser Version verifizieren**

`xcap::Monitor`s Getter-Methoden (`x()`, `y()`, `width()`, `height()`) geben je nach Version entweder direkte Werte oder ein `xcap::XCapResult<T>` zurück. Prüfe die tatsächlich aufgelöste Signatur, bevor du Step 3 schreibst:

```bash
cargo doc -p xcap --open
```

Falls das im Sandbox-/CI-Kontext keinen Browser öffnen kann, alternativ die Signaturen direkt im heruntergeladenen Quellcode nachschauen (Pfad wird von `cargo add` ausgegeben, typischerweise unter `~/.cargo/registry/src/.../xcap-*/src/lib.rs` bzw. `platform/*.rs`). Passe die `?`-Fehlerbehandlung in Step 3 entsprechend an, falls die Getter ein `Result` liefern (dann `.map_err(|e| format!("Monitor-Info fehlgeschlagen: {e}"))?` statt eines direkten Feldzugriffs).

- [ ] **Step 3: Funktion implementieren**

Ergänze in `src-tauri/src/screen_snip.rs` (nach `crop_to_png`):

```rust
/// Sucht den Monitor, dessen Position am naechsten an (x, y) liegt (der
/// Monitor, auf dem sich das Hauptfenster zuletzt befand, siehe Task 3),
/// und nimmt ihn per Screenshot auf.
pub fn capture_monitor_at(x: i32, y: i32) -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Monitore konnten nicht ermittelt werden: {e}"))?;

    let monitor = monitors
        .into_iter()
        .min_by_key(|m| {
            // Direkte Werte angenommen; falls diese Version Result<T>
            // liefert, hier gemaess Step 2 anpassen.
            let dx = (m.x() - x) as i64;
            let dy = (m.y() - y) as i64;
            dx * dx + dy * dy
        })
        .ok_or_else(|| "Kein Monitor gefunden".to_string())?;

    monitor
        .capture_image()
        .map_err(|e| format!("Bildschirmaufnahme fehlgeschlagen: {e}"))
}
```

- [ ] **Step 4: Smoke-Test schreiben (echter Bildschirm, da OS-Interaktion nicht sinnvoll mockbar ist)**

Ergänze im `#[cfg(test)] mod tests` Block:

```rust
    #[test]
    fn captures_the_monitor_nearest_to_the_given_origin() {
        // Laeuft gegen den echten Bildschirm der Entwicklungsmaschine (kein
        // Headless-CI in diesem Projekt konfiguriert) -- reiner Rauch-Test:
        // liefert ueberhaupt ein nicht-leeres Bild zurueck.
        let image = capture_monitor_at(0, 0).expect("Capture sollte auf einer echten Maschine gelingen");
        assert!(image.width() > 0);
        assert!(image.height() > 0);
    }
```

- [ ] **Step 5: Test laufen lassen**

```bash
cd src-tauri
cargo test screen_snip
```

Erwartet: `test result: ok. 5 passed; 0 failed` (die 4 aus Task 1 + dieser neue). Falls der neue Test auf der Entwicklungsmaschine aus Umgebungsgründen fehlschlägt (z.B. keine Bildschirm-Berechtigung), das dem Nutzer melden statt den Test zu entfernen.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/screen_snip.rs
git commit -m "feat(moodboard): Bildschirm-Capture per xcap"
```

---

### Task 3: Rust — Tauri-Commands, Fenster-Orchestrierung, Overlay-Capability

**Files:**
- Create: `src-tauri/src/commands/screen_snip.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/capabilities/overlay.json`

**Interfaces:**
- Konsumiert: `screen_snip::{SnipRect, crop_to_png, capture_monitor_at}` (Task 1+2).
- Produziert: vier Tauri-Commands — `cmd_start_screen_snip() -> Result<Option<Vec<u8>>, String>` (blockiert asynchron, bis der Overlay-Fluss abgeschlossen oder abgebrochen wurde; `None` = Abbruch/zu klein, `Some(bytes)` = PNG-Bytes des Ausschnitts), `cmd_get_snip_background() -> Result<Vec<u8>, String>` (PNG-Bytes des aktuell gehaltenen Standbilds, für die Anzeige im Overlay), `cmd_finish_screen_snip(rect: SnipRect) -> Result<(), String>`, `cmd_cancel_screen_snip() -> Result<(), String>`. Diese vier werden von Task 4 (Overlay-Frontend, ruft `cmd_get_snip_background`/`cmd_finish_screen_snip`/`cmd_cancel_screen_snip` auf) und Task 6 (`ProjectDetailRoute.tsx`, ruft `cmd_start_screen_snip` auf) konsumiert.

Diese Aufgabe hat keine sinnvolle "erst roter Test"-Struktur — es ist Fenster-/Zustands-Orchestrierung ohne pure, isoliert testbare Logik (die pure Logik liegt bereits getestet in Task 1/2). Verifikation erfolgt über `cargo build` (Kompilieren) und einen manuellen Check am Ende von Task 6, wenn die komplette Kette verdrahtet ist.

- [ ] **Step 1: Datei anlegen**

Erstelle `src-tauri/src/commands/screen_snip.rs`:

```rust
use crate::screen_snip::{self, SnipRect};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

const OVERLAY_LABEL: &str = "snip-overlay";

pub enum SnipOutcome {
    Done(Vec<u8>),
    Cancelled,
}

pub struct SnipSessionData {
    pub image: image::RgbaImage,
    pub responder: oneshot::Sender<SnipOutcome>,
}

/// Haelt den zuletzt gemachten Screenshot + den Rueckkanal zum urspruenglichen
/// `cmd_start_screen_snip`-Aufrufer, waehrend das Overlay-Fenster offen ist.
pub struct SnipSession(pub Mutex<Option<SnipSessionData>>);

fn close_overlay_and_restore(app: &AppHandle) {
    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = overlay.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

#[tauri::command]
pub async fn cmd_start_screen_snip(
    app: AppHandle,
    window: tauri::WebviewWindow,
    session: State<'_, SnipSession>,
) -> Result<Option<Vec<u8>>, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("Monitor konnte nicht ermittelt werden: {e}"))?
        .ok_or_else(|| "Kein Monitor gefunden".to_string())?;
    let position = *monitor.position();
    let size = *monitor.size();
    let scale = monitor.scale_factor();

    window.minimize().map_err(|e| e.to_string())?;
    // Kurze Pause, damit die Minimieren-Animation durch ist, bevor der
    // Screenshot gemacht wird -- sonst faengt der Screenshot noch Cultera
    // selbst ein.
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let image = match screen_snip::capture_monitor_at(position.x, position.y) {
        Ok(img) => img,
        Err(e) => {
            let _ = window.unminimize();
            let _ = window.set_focus();
            return Err(e);
        }
    };

    let (tx, rx) = oneshot::channel();
    {
        let mut guard = session.0.lock().map_err(|_| "Sitzung gesperrt".to_string())?;
        *guard = Some(SnipSessionData { image, responder: tx });
    }

    let logical_x = position.x as f64 / scale;
    let logical_y = position.y as f64 / scale;
    let logical_w = size.width as f64 / scale;
    let logical_h = size.height as f64 / scale;

    let overlay_result = WebviewWindowBuilder::new(&app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
        .position(logical_x, logical_y)
        .inner_size(logical_w, logical_h)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(true)
        .build();

    if let Err(e) = overlay_result {
        let mut guard = session.0.lock().map_err(|_| "Sitzung gesperrt".to_string())?;
        *guard = None;
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Err(format!("Aufnahme-Fenster konnte nicht geoeffnet werden: {e}"));
    }

    match rx.await {
        Ok(SnipOutcome::Done(bytes)) => Ok(Some(bytes)),
        Ok(SnipOutcome::Cancelled) | Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn cmd_get_snip_background(session: State<'_, SnipSession>) -> Result<Vec<u8>, String> {
    let guard = session.0.lock().map_err(|_| "Sitzung gesperrt".to_string())?;
    let data = guard.as_ref().ok_or_else(|| "Keine aktive Aufnahme-Sitzung".to_string())?;
    let mut bytes: Vec<u8> = Vec::new();
    data.image
        .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| format!("PNG-Kodierung fehlgeschlagen: {e}"))?;
    Ok(bytes)
}

#[tauri::command]
pub fn cmd_finish_screen_snip(app: AppHandle, session: State<'_, SnipSession>, rect: SnipRect) -> Result<(), String> {
    let data = {
        let mut guard = session.0.lock().map_err(|_| "Sitzung gesperrt".to_string())?;
        guard.take()
    };
    if let Some(data) = data {
        let outcome = match screen_snip::crop_to_png(&data.image, rect) {
            Ok(bytes) => SnipOutcome::Done(bytes),
            // Zu kleine Auswahl zaehlt als Abbruch, nicht als Fehler (siehe Spec).
            Err(_) => SnipOutcome::Cancelled,
        };
        let _ = data.responder.send(outcome);
    }
    close_overlay_and_restore(&app);
    Ok(())
}

#[tauri::command]
pub fn cmd_cancel_screen_snip(app: AppHandle, session: State<'_, SnipSession>) -> Result<(), String> {
    let data = {
        let mut guard = session.0.lock().map_err(|_| "Sitzung gesperrt".to_string())?;
        guard.take()
    };
    if let Some(data) = data {
        let _ = data.responder.send(SnipOutcome::Cancelled);
    }
    close_overlay_and_restore(&app);
    Ok(())
}
```

- [ ] **Step 2: In `commands/mod.rs` registrieren**

Füge in `src-tauri/src/commands/mod.rs` eine neue Zeile hinzu (alphabetisch bei den anderen `pub mod`-Zeilen einsortiert, z.B. nach `pub mod project_phase;`):

```rust
pub mod screen_snip;
```

- [ ] **Step 3: In `main.rs` Zustand verwalten + Commands registrieren**

In `src-tauri/src/main.rs`, im `.setup(|app| { ... })`-Block, nach der bestehenden Zeile `app.manage(CloseToTray(AtomicBool::new(true)));` (Zeile 194) eine neue Zeile hinzufügen:

```rust
            app.manage(commands::screen_snip::SnipSession(std::sync::Mutex::new(None)));
```

Im `tauri::generate_handler![...]`-Block (beginnt Zeile 272), nach `commands::account::upsert_account,` (oder an beliebiger Stelle in der Liste) vier neue Zeilen hinzufügen:

```rust
            commands::screen_snip::cmd_start_screen_snip,
            commands::screen_snip::cmd_get_snip_background,
            commands::screen_snip::cmd_finish_screen_snip,
            commands::screen_snip::cmd_cancel_screen_snip,
```

- [ ] **Step 4: Overlay-Capability-Datei anlegen**

Erstelle `src-tauri/capabilities/overlay.json`:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema/desktop-schema.json",
  "identifier": "overlay-capability",
  "description": "Permissions fuer das Schnappschuss-Aufnahme-Overlay-Fenster",
  "windows": ["snip-overlay"],
  "permissions": [
    "core:default"
  ]
}
```

Ohne diese Datei kann das Overlay-Fenster (Label `snip-overlay`) keine Tauri-Commands aufrufen — Tauri v2s Berechtigungssystem ist pro Fenster-Label scoped, und `capabilities/main.json` gilt nur für `"windows": ["main"]`.

- [ ] **Step 5: Kompilieren**

```bash
cd src-tauri
cargo build
```

Erwartet: baut fehlerfrei. Falls Fehler zu `.position()`/`.inner_size()`-Typen auftreten (z.B. falsche Argumentzahl/-typ), die tatsächliche `WebviewWindowBuilder`-Signatur der installierten Tauri-Version prüfen (`cargo doc -p tauri --open`, Trait `tauri::WindowBuilder`) und anpassen.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/screen_snip.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs src-tauri/capabilities/overlay.json
git commit -m "feat(moodboard): Tauri-Commands + Fenster-Orchestrierung fuer Schnappschuss"
```

---

### Task 4: Overlay-Frontend (Vite-Entry + Auswahl-Komponente)

**Files:**
- Create: `overlay.html`
- Create: `src/overlay-main.tsx`
- Create: `src/components/moodboard/SnipOverlay.tsx`
- Create: `src/components/moodboard/SnipOverlay.test.tsx`
- Modify: `vite.config.ts`

**Interfaces:**
- Konsumiert: Tauri-Commands aus Task 3 (`cmd_get_snip_background`, `cmd_finish_screen_snip`, `cmd_cancel_screen_snip`) via `invoke()` aus `@tauri-apps/api/core`.
- Produziert: nichts, das von anderen Tasks importiert wird — dies ist ein eigenständiges, zweites Frontend-Entry-Point-Bundle.

- [ ] **Step 1: Vite-Config um zweiten Build-Entry erweitern**

In `vite.config.ts`, ergänze im `build`-Objekt (vor `rollupOptions.output`) einen `input`-Eintrag:

```ts
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/scheduler/')) return 'react-vendor'
          if (id.includes('framer-motion')) return 'framer-motion'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
        },
      },
    },
  },
```

(`path` ist in dieser Datei bereits importiert.)

- [ ] **Step 2: Overlay-HTML anlegen**

Erstelle `overlay.html` im Projekt-Root (gleiche Ebene wie `index.html`):

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <title>Schnappschuss</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { width: 100%; height: 100%; overflow: hidden; }
      body { cursor: crosshair; background: #000; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/overlay-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Overlay-Entry-Skript anlegen**

Erstelle `src/overlay-main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { SnipOverlay } from './components/moodboard/SnipOverlay'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SnipOverlay />
  </React.StrictMode>,
)
```

- [ ] **Step 4: Fehlschlagenden Test schreiben**

Erstelle `src/components/moodboard/SnipOverlay.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SnipOverlay } from './SnipOverlay'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SnipOverlay', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'cmd_get_snip_background') return Promise.resolve([137, 80, 78, 71])
      return Promise.resolve(undefined)
    })
  })

  it('laedt den Hintergrund-Screenshot beim Mounten', async () => {
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
  })

  it('sendet das gezogene Rechteck skaliert mit devicePixelRatio an finish_screen_snip', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    const surface = container.firstChild as HTMLElement
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 20 })
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 120 })
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 120 })
    expect(invokeMock).toHaveBeenCalledWith('cmd_finish_screen_snip', {
      rect: { x: 20, y: 40, width: 100, height: 200 },
    })
  })

  it('normalisiert ein von unten-rechts nach oben-links gezogenes Rechteck', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    const surface = container.firstChild as HTMLElement
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(surface, { clientX: 40, clientY: 30 })
    fireEvent.pointerUp(surface, { clientX: 40, clientY: 30 })
    expect(invokeMock).toHaveBeenCalledWith('cmd_finish_screen_snip', {
      rect: { x: 40, y: 30, width: 60, height: 70 },
    })
  })

  it('bricht bei Escape ab, ohne finish_screen_snip aufzurufen', async () => {
    render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(invokeMock).toHaveBeenCalledWith('cmd_cancel_screen_snip')
    expect(invokeMock).not.toHaveBeenCalledWith('cmd_finish_screen_snip', expect.anything())
  })

  it('bricht bei Rechtsklick ab', async () => {
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    fireEvent.contextMenu(container.firstChild as HTMLElement)
    expect(invokeMock).toHaveBeenCalledWith('cmd_cancel_screen_snip')
  })
})
```

- [ ] **Step 5: Test laufen lassen, sicherstellen dass er fehlschlägt**

```bash
npx vitest run src/components/moodboard/SnipOverlay.test.tsx
```

Erwartet: FAIL — `SnipOverlay` existiert noch nicht (`Cannot find module './SnipOverlay'`).

- [ ] **Step 6: Komponente implementieren**

Erstelle `src/components/moodboard/SnipOverlay.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface DragRect { x: number; y: number; w: number; h: number }

export function SnipOverlay() {
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [rect, setRect] = useState<DragRect | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const bgUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    invoke<number[]>('cmd_get_snip_background').then(bytes => {
      if (cancelled) return
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      const url = URL.createObjectURL(blob)
      bgUrlRef.current = url
      setBgUrl(url)
    }).catch(() => {
      void invoke('cmd_cancel_screen_snip')
    })
    return () => {
      cancelled = true
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void invoke('cmd_cancel_screen_snip')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY }
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current
    if (!start) return
    const x = Math.min(start.x, e.clientX)
    const y = Math.min(start.y, e.clientY)
    const w = Math.abs(e.clientX - start.x)
    const h = Math.abs(e.clientY - start.y)
    setRect({ x, y, w, h })
  }

  const onPointerUp = () => {
    const r = rect
    dragStart.current = null
    if (!r) return
    const scale = window.devicePixelRatio || 1
    void invoke('cmd_finish_screen_snip', {
      rect: {
        x: Math.round(r.x * scale),
        y: Math.round(r.y * scale),
        width: Math.round(r.w * scale),
        height: Math.round(r.h * scale),
      },
    })
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={e => { e.preventDefault(); void invoke('cmd_cancel_screen_snip') }}
      style={{ position: 'fixed', inset: 0 }}
    >
      {bgUrl && (
        <img src={bgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
      )}
      {rect && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: rect.y, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: rect.y + rect.h, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: rect.y, width: rect.x, height: rect.h, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: '1px solid #fff' }} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Test laufen lassen, sicherstellen dass er besteht**

```bash
npx vitest run src/components/moodboard/SnipOverlay.test.tsx
```

Erwartet: `5 passed`.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts overlay.html src/overlay-main.tsx src/components/moodboard/SnipOverlay.tsx src/components/moodboard/SnipOverlay.test.tsx
git commit -m "feat(moodboard): Overlay-Frontend fuer Schnappschuss-Auswahl"
```

---

### Task 5: `ProjectMoodboard.tsx` — Schnappschuss-Button

**Files:**
- Modify: `src/components/projects/ProjectMoodboard.tsx`
- Modify: `src/components/projects/ProjectMoodboard.test.tsx`

**Interfaces:**
- Produziert: neue Prop `onSnip: () => void` auf `ProjectMoodboard`; `newItem` wird `export`iert (bisher privat), damit Task 6 (`ProjectDetailRoute.tsx`) daraus ein neues `MoodboardItem` vom Typ `'image'` bauen kann, ohne die Erzeugungs-Logik zu duplizieren.
- Konsumiert: nichts Neues.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Füge in `src/components/projects/ProjectMoodboard.test.tsx` in der `renderBoard`-Hilfsfunktion `onSnip={vi.fn()}` als Default hinzu:

```tsx
function renderBoard(items: MoodboardItem[] = [], overrides: Partial<Parameters<typeof ProjectMoodboard>[0]> = {}) {
  return render(
    <ProjectMoodboard
      items={items}
      onChange={vi.fn()}
      onUploadImage={vi.fn()}
      onRemoveImage={vi.fn()}
      onSnip={vi.fn()}
      readImage={vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))}
      {...overrides}
    />,
  )
}
```

Und füge einen neuen Test am Ende von `describe('ProjectMoodboard', ...)` hinzu:

```tsx
  it('ruft onSnip auf, wenn der Schnappschuss-Button geklickt wird', () => {
    const onSnip = vi.fn()
    renderBoard([], { onSnip })
    fireEvent.click(screen.getByText('Schnappschuss'))
    expect(onSnip).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Test laufen lassen, sicherstellen dass er fehlschlägt**

```bash
npx vitest run src/components/projects/ProjectMoodboard.test.tsx
```

Erwartet: FAIL — `onSnip` ist keine gültige Prop (TypeScript-Fehler) bzw. der Button "Schnappschuss" existiert nicht.

- [ ] **Step 3: Implementieren**

In `src/components/projects/ProjectMoodboard.tsx`:

Ändere `function newItem(...)` (Zeile 7) zu `export function newItem(...)`:

```tsx
export function newItem(kind: MoodboardItem['kind']): MoodboardItem {
```

Erweitere die Props-Signatur von `ProjectMoodboard` (Zeile 112-118) um `onSnip`:

```tsx
export function ProjectMoodboard({ items, onChange, onUploadImage, onRemoveImage, onSnip, readImage }: {
  items: MoodboardItem[]
  onChange: (next: MoodboardItem[]) => void
  onUploadImage: (itemId: string, file: File) => void
  onRemoveImage: (itemId: string) => void
  onSnip: () => void
  readImage: (itemId: string, storageKey: string) => Promise<Blob>
}) {
```

Füge im "Hinzufügen"-Card (nach dem `<button className="btn-ghost" onClick={() => add('note')}>Notiz</button>`, Zeile 200) einen neuen Button hinzu:

```tsx
          <button className="btn-ghost" onClick={onSnip}>Schnappschuss</button>
```

- [ ] **Step 4: Test laufen lassen, sicherstellen dass er besteht**

```bash
npx vitest run src/components/projects/ProjectMoodboard.test.tsx
```

Erwartet: alle Tests grün (bisherige + der neue).

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectMoodboard.tsx src/components/projects/ProjectMoodboard.test.tsx
git commit -m "feat(moodboard): Schnappschuss-Button im Hinzufuegen-Panel"
```

---

### Task 6: `ProjectDetailRoute.tsx` — Verdrahtung

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Konsumiert: `cmd_start_screen_snip` (Task 3) via `invoke()`, `newItem` (Task 5, exportiert aus `ProjectMoodboard.tsx`), die bereits bestehenden Store-Actions `updateMoodboardItems`/`uploadMoodboardImage` (bereits als `const updateMoodboardItems = useProjectsStore(...)` bzw. `const uploadMoodboardImage = useProjectsStore(...)` in dieser Datei vorhanden, Zeilen 218-219), die neue `onSnip`-Prop von `ProjectMoodboard` (Task 5).

Diese Aufgabe hat keinen eigenen neuen Testfile-Bedarf — `ProjectDetailRoute.tsx` hat im bestehenden Code keine dedizierte Testdatei (Verifikation dieser Route läuft über die Gesamt-Suite + Typecheck + manuellen Check, siehe Etappe-6-Präzedenzfall für dieselbe Datei).

- [ ] **Step 1: Import ergänzen**

In `src/routes/ProjectDetailRoute.tsx`, ergänze bei den bestehenden Imports:

```tsx
import { invoke } from '@tauri-apps/api/core'
import { ProjectMoodboard, newItem } from '@/components/projects/ProjectMoodboard'
```

(Die bestehende Zeile `import { ProjectMoodboard } from '@/components/projects/ProjectMoodboard'` wird durch die zweite Zeile ersetzt — `newItem` kommt aus demselben Modul.)

- [ ] **Step 2: `handleSnip`-Funktion hinzufügen**

Füge nahe den anderen Handler-Funktionen (z.B. nach der Definition von `refreshActivities`, vor dem ersten `useEffect`) eine neue Funktion hinzu:

```tsx
  const handleSnip = async () => {
    if (!project) return
    try {
      const bytes = await invoke<number[] | null>('cmd_start_screen_snip')
      if (!bytes) return
      const item = newItem('image')
      await updateMoodboardItems(project.id, [...project.moodboardItems, item])
      const file = new File([new Uint8Array(bytes)], 'schnappschuss.png', { type: 'image/png' })
      await uploadMoodboardImage(workspaceId, project.id, item.id, file)
    } catch (e) {
      toast({ message: `Schnappschuss fehlgeschlagen: ${String(e)}`, variant: 'error' })
    }
  }
```

(`toast` ist bereits als `const toast = useToastStore(s => s.show)` in dieser Datei vorhanden.)

- [ ] **Step 3: Prop verdrahten**

Ergänze in der bestehenden `<ProjectMoodboard ... />`-Instanz (Zeile 468-476) die neue Prop:

```tsx
          <ProjectMoodboard
            items={project.moodboardItems}
            onChange={items => updateMoodboardItems(project.id, items)}
            onUploadImage={(itemId, file) => uploadMoodboardImage(workspaceId, project.id, itemId, file)}
            onSnip={handleSnip}
            onRemoveImage={itemId => {
```

(nur die neue Zeile `onSnip={handleSnip}` wird eingefügt, der Rest bleibt unverändert.)

- [ ] **Step 4: Typecheck + Gesamt-Suite**

```bash
npm run typecheck
npx vitest run
cd src-tauri && cargo test
```

Erwartet: Typecheck 0 Fehler, vitest alle bisherigen Tests weiterhin grün (plus die 5 aus Task 4 + 1 aus Task 5), `cargo test` alle Tests aus Task 1+2 weiterhin grün.

- [ ] **Step 5: Manueller Check**

```bash
npm run tauri dev
```

Im laufenden Fenster: ein Projekt öffnen → Moodboard-Tab → "Schnappschuss" klicken → prüfen, dass Cultera minimiert, das Aufnahme-Overlay über dem zuvor sichtbaren Bildschirminhalt erscheint (z.B. Browser-Fenster dahinter), ein Rechteck ziehen → loslassen → prüfen, dass Cultera sich wiederherstellt und der Ausschnitt als neue Bild-Kachel im Moodboard erscheint. Zusätzlich: Esc-Taste während des Overlays drücken → prüfen, dass abgebrochen wird und Cultera sich wiederherstellt, ohne dass eine Kachel angelegt wird.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(moodboard): Schnappschuss-Fluss in ProjectDetailRoute verdrahtet"
```
