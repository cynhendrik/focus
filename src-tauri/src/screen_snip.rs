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

/// Sucht den Monitor, dessen Position am naechsten an (x, y) liegt (der
/// Monitor, auf dem sich das Hauptfenster zuletzt befand, siehe Task 3),
/// und nimmt ihn per Screenshot auf.
///
/// In xcap 0.9.7 liefern `Monitor::x()`/`y()`/`capture_image()` allesamt
/// `XCapResult<T>` (kein direkter Feldzugriff) -- Monitore, deren Position
/// nicht ermittelt werden kann, werden bei der Auswahl uebersprungen statt
/// die gesamte Suche abzubrechen.
pub fn capture_monitor_at(x: i32, y: i32) -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Monitore konnten nicht ermittelt werden: {e}"))?;

    let monitor = monitors
        .into_iter()
        .filter_map(|m| {
            let mx = m.x().ok()?;
            let my = m.y().ok()?;
            let dx = (mx - x) as i64;
            let dy = (my - y) as i64;
            Some((dx * dx + dy * dy, m))
        })
        .min_by_key(|(dist, _)| *dist)
        .map(|(_, m)| m)
        .ok_or_else(|| "Kein Monitor gefunden".to_string())?;

    monitor
        .capture_image()
        .map_err(|e| format!("Bildschirmaufnahme fehlgeschlagen: {e}"))
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

    #[test]
    fn captures_the_monitor_nearest_to_the_given_origin() {
        // Laeuft gegen den echten Bildschirm der Entwicklungsmaschine (kein
        // Headless-CI in diesem Projekt konfiguriert) -- reiner Rauch-Test:
        // liefert ueberhaupt ein nicht-leeres Bild zurueck.
        let image = capture_monitor_at(0, 0).expect("Capture sollte auf einer echten Maschine gelingen");
        assert!(image.width() > 0);
        assert!(image.height() > 0);
    }
}
