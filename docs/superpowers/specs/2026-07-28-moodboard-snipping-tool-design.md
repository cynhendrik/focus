# Moodboard: Schnappschuss (Snipping-Tool) Design

## Status

Umsetzungsreif. Löst die alte Notiz `docs/superpowers/specs/2026-07-26-moodboard-snip-to-board-design.md` ab — die dortige Idee eines globalen, app-übergreifenden Hotkeys wurde bewusst verworfen zugunsten eines einfacheren, in-App ausgelösten Ablaufs (siehe Entscheidungen unten). Das Moodboard selbst (Canvas, Elementtypen, Bild-Upload lokal+cloud) existiert bereits seit Etappe 5 des Projekt-Modul-Ausbaus.

## Ziel

Ein Button im Moodboard-Tab eines Projekts löst eine Bildschirm-Ausschnitt-Aufnahme aus (wie Windows Snipping Tool), egal was gerade auf dem Bildschirm sichtbar ist — auch Inhalte außerhalb von Cultera (Browser, andere Anwendungen). Der Ausschnitt landet danach direkt und ohne weiteren Zwischenschritt als neues, frei platzierbares Bild-Element im Moodboard.

## Entscheidungen (aus Brainstorming)

- **Ausloeser ist in-App, nicht global**: kein systemweiter Hotkey, keine Funktion bei minimierter/geschlossener App. Ein Button im Moodboard-Tab startet die Aufnahme. Deutlich weniger Aufwand als ein globaler Shortcut (kein `tauri-plugin-global-shortcut`, keine OS-Registrierung von System-Hotkeys) und deckt den eigentlichen Nutzungsfall ab: man ist bereits im Projekt, will schnell etwas von außerhalb einfangen.
- **Aufnahme-Quelle ist der gesamte Bildschirm**, nicht nur Cultera selbst — sonst wäre der Nutzen (Inspiration von außen ins Moodboard holen) nicht gegeben.
- **Cultera minimiert sich automatisch** beim Klick auf den Button (kein Countdown) — Nutzer sieht kurz den Desktop/das dahinterliegende Fenster, dann startet die Aufnahme.
- **Freeze-Frame statt Live-Transparenz**: siehe Architektur-Abschnitt unten.
- **Kein Zwischenschritt nach dem Ziehen**: der Ausschnitt landet sofort im Moodboard, keine Vorschau/Bestätigung.
- **Nur der Monitor, auf dem Cultera zuletzt war** — kein monitorübergreifendes Overlay für v1. Bei mehreren Monitoren muss das Zielfenster vorher auf den Cultera-Monitor geholt werden.
- **Button-Platzierung**: neben den bestehenden "Hinzufügen"-Buttons (Bild/Farbe/Typo/Notiz) im Moodboard-Tab, gleiches visuelles Muster.
- **Kein neues Datenmodell**: der Schnappschuss wird als normales `MoodboardItem` vom Typ `'image'` behandelt, exakt wie ein manuell hochgeladenes Bild (gleicher Upload-Pfad, gleicher lokal/cloud-Dual-Path).

## Architektur

### Ablauf

1. Nutzer klickt "📷 Schnappschuss" im Moodboard-Tab.
2. Frontend ruft einen neuen Tauri-Command auf (z.B. `start_screen_snip`).
3. Rust minimiert das Hauptfenster (`window.minimize()`), wartet kurz (~200ms, damit die Minimieren-Animation durch ist), macht dann **einen** Screenshot des Monitors, auf dem sich das Hauptfenster zuletzt befand (`xcap`-Crate), und hält dieses Bild im Speicher.
4. Rust öffnet ein neues, randloses, always-on-top Vollbild-Fenster (`WebviewWindowBuilder`, Tauri v2) auf genau diesem Monitor. Dieses Overlay-Fenster zeigt das eben aufgenommene Standbild als Vollbild-Hintergrund (keine Live-Transparenz).
5. Im Overlay: Maus-Drag zeichnet ein Auswahlrechteck, Bereich außerhalb wird abgedunkelt (klassisches Snipping-Tool-UI). Esc oder Rechtsklick bricht ab.
6. Beim Loslassen sendet das Overlay das Auswahlrechteck (in Bild-Pixel-Koordinaten) an einen Rust-Command (z.B. `finish_screen_snip`), der das **bereits vorhandene** Standbild auf dieses Rechteck zuschneidet (kein zweiter Screen-Capture nötig) und die PNG-Bytes zurückgibt.
7. Rust schließt das Overlay-Fenster und stellt das Hauptfenster wieder her (`window.unminimize()` + `window.set_focus()`).
8. Frontend erhält die PNG-Bytes, baut daraus eine `File`, legt ein neues `MoodboardItem` vom Typ `'image'` an (gleiche Default-Position/-Größe wie beim manuellen "Bild hinzufügen") und ruft den bestehenden `uploadMoodboardImage(workspaceId, projectId, itemId, file)`-Fluss auf — identisch zum bereits gebauten manuellen Upload-Pfad, inklusive lokal/cloud-Dual-Path (Workspace-Ablage bzw. Supabase-Bucket `moodboard-images`).
9. Bei Abbruch (Esc/Rechtsklick) oder zu kleiner Auswahl (Klick ohne Ziehen): Overlay schließt sich, Hauptfenster wird wiederhergestellt, kein Item wird angelegt.

### Freeze-Frame vs. Live-Transparenz (Begründung)

Zwei Ansätze wurden abgewogen:
- **Live-transparentes Overlay-Fenster**: durchsichtiges Fenster, durch das der echte, sich nicht verändernde Bildschirm sichtbar ist, während man zieht. Näher am "physischen" Snipping-Tool-Gefühl, aber fragil — transparente Fenster verhalten sich je nach Windows-Version/GPU-Treiber/Compositor unterschiedlich, und das Overlay müsste sich aktiv davor schützen, sich selbst mit einzufangen.
- **Freeze-Frame (gewählt)**: ein einzelner Screenshot wird gemacht, *bevor* das Overlay erscheint; das Overlay zeigt dieses Standbild als normales, undurchsichtiges Bild an. Der Zuschnitt rechnet danach auf den tatsächlichen Bild-Pixelkoordinaten dieses einen Standbilds — kein Mapping zwischen Live-Bildschirmkoordinaten und Fenstergeometrie nötig, DPI-sicher, robust gegenüber Compositor-Eigenheiten. Gleiches Grundprinzip wie bei ShareX/Windows Snip & Sketch.

### Neue Bausteine (erstmalig in dieser Codebase)

- Screenshot-Crate `xcap` (cross-platform, Fokus hier auf Windows) — erste Abhängigkeit dieser Art im Projekt.
- Ein zweites Tauri-Fenster zur Laufzeit erzeugt (`WebviewWindowBuilder`) — bisher nutzt die App nur ihr eines Hauptfenster.

## Datenfluss / Schnittstellen

- Neuer Rust-Command `start_screen_snip() -> Result<ScreenSnipSession, String>`: minimiert Hauptfenster, macht Screenshot, öffnet Overlay-Fenster, hält das Standbild serverseitig (z.B. in einem `Mutex<Option<image::DynamicImage>>`-State) für den nachfolgenden Zuschnitt vor.
- Neuer Rust-Command `finish_screen_snip(rect: SnipRect) -> Result<Vec<u8>, String>`: schneidet das gehaltene Standbild zu, gibt PNG-Bytes zurück, schließt Overlay, stellt Hauptfenster wieder her, leert den gehaltenen Screenshot-State.
- Neuer Rust-Command `cancel_screen_snip() -> Result<(), String>`: schließt Overlay, stellt Hauptfenster wieder her, leert den gehaltenen Screenshot-State, kein Rückgabewert an den Moodboard-Fluss.
- Frontend: neue kleine Overlay-Route/Komponente (eigenes HTML-Fenster-Target in Tauri, zeigt nur das Standbild + Auswahl-UI), separat vom Haupt-App-Router.
- `ProjectMoodboard.tsx`: neuer Button ruft `start_screen_snip`, wartet auf das Ergebnis (Overlay-Fenster meldet sich beim Hauptfenster per Tauri-Event oder das Frontend pollt/awaited direkt den `invoke`-Aufruf — technische Detailentscheidung für den Implementierungsplan), baut bei Erfolg ein `File` aus den PNG-Bytes und ruft den bestehenden `add` + `uploadMoodboardImage`-Fluss auf.

## Fehlerfälle

- Screenshot-Capture schlägt fehl (OS verweigert, Monitor nicht auffindbar): Rust-Command gibt `Err` zurück, Frontend zeigt Toast-Fehlermeldung, kein Overlay wird geöffnet, Hauptfenster war noch nicht minimiert oder wird sofort wiederhergestellt.
- Auswahlrechteck zu klein (z.B. < 4×4 Pixel, reiner Klick ohne Ziehen): kein Zuschnitt, kein Item wird angelegt, Overlay schließt sich wie bei Abbruch.
- Esc-Taste oder Rechtsklick im Overlay: ruft `cancel_screen_snip` auf, Hauptfenster wird wiederhergestellt, nichts wird angelegt.
- Hauptfenster stellt sich nach Overlay-Schließung nicht automatisch wieder her: wird explizit per `unminimize()` + `set_focus()` in beiden Erfolgs- und Abbruch-Pfaden angestoßen, nicht dem OS überlassen.

## Nicht Teil dieser Spec

- Globaler, app-übergreifender Hotkey (verworfen, siehe Entscheidungen).
- Monitorübergreifendes Overlay bei Mehrfach-Monitor-Setups (v1 beschränkt sich auf den Cultera-Monitor).
- Vorschau/Bestätigen-Zwischenschritt vor dem Einfügen ins Moodboard.
- macOS/Linux-spezifische Bildschirm-Berechtigungsabfragen (Zielplattform hier ist Windows; `xcap` ist zwar cross-platform, aber Testing/Abnahme beschränkt sich auf Windows).

## Testing-Ansatz

- **Rust, Unit-Tests**: Zuschneide-Logik (gegebenes Bild + Rechteck-Koordinaten → korrekter Ausschnitt-Bytes) ist reine, deterministische Logik und ohne echten Bildschirm testbar. Ebenso der "Auswahl zu klein"-Schwellenwert.
- **Frontend, Komponententests**: Overlay-Auswahl-Interaktion (Mouse-Down/Move/Up → korrektes Rechteck in Bild-Koordinaten), Esc-Taste → Abbruch ohne Upload-Aufruf, Button-Verdrahtung in `ProjectMoodboard.tsx` (Erfolgsfall ruft `add`+`uploadMoodboardImage` mit korrekt gebautem `File` auf).
- **Manueller Check**: echter Bildschirm-Capture/Minimieren/Wiederherstellen ist nicht sinnvoll automatisiert testbar (OS-Interaktion) — wird als manueller Abnahme-Schritt im Implementierungsplan festgehalten, wie bei anderen OS-nahen Features in diesem Projekt üblich (z.B. Auto-Update, Tray-Icon).
