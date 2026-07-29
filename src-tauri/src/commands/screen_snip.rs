use crate::screen_snip::{self, SnipRect};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

pub const OVERLAY_LABEL: &str = "snip-overlay";

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
