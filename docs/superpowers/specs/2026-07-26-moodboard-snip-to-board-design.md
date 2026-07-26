# Moodboard: Snip-to-Board (Zusatz-Notiz für Etappe 5)

## Status

Idee festgehalten, **nicht spec'd für Implementierung**. Das Moodboard selbst existiert noch nicht — `ProjectDetailRoute.tsx` zeigt aktuell nur eine leere Platzhalter-Karte ("🖼️ Moodboard" / "Bild-Upload folgt in einer späteren Runde"). Diese Notiz ist ein Zusatzpunkt, der in die künftige Etappe-5-Spec (Moodboard, siehe `docs/superpowers/specs/2026-07-26-projekt-portfolio-timeline-design.md` — 6-Etappen-Plan) einfließen soll, sobald diese geschrieben wird.

## Idee

Ein globaler Tastatur-Shortcut (app-übergreifend, funktioniert auch bei minimiertem Cultera-Fenster) öffnet ein Snipping-Tool-artiges Aufnahme-Overlay. Der ausgeschnittene Bildbereich landet direkt als neues, frei platzierbares Bild-Element im gewählten Projekt-Moodboard — ein einziger flüssiger Zug (Shortcut → Rechteck ziehen → Projekt wählen → Bild liegt im Board), kein Umweg über Zwischenablage oder manuellen Datei-Import.

## Verworfene Alternativen

- **Windows-eigenes Snipping Tool aufrufen** (`ms-screenclip:`-URI) + Zwischenablage auslesen: weniger Implementierungsaufwand, aber Umweg über eine fremde OS-UI mit eigenem Bestätigungs-Schritt — fühlt sich nicht wie eine einzelne Aktion an.
- **Reiner Zwischenablage-Import**: Nutzer schneidet mit einem beliebigen Tool (z.B. Win+Shift+S), Cultera importiert per separatem Shortcut aus der Zwischenablage. Am einfachsten zu bauen, aber zwei getrennte Schritte statt einer nahtlosen Aktion — trifft den Kern-Wunsch ("ziehen → landet direkt im Board") am wenigsten.

Beide verworfen zugunsten eines eigenen Aufnahme-Overlays, da der Nutzer explizit eine einzelne, nahtlose Aktion wollte.

## Grobentwurf

1. **Auslöser**: Globaler Tastatur-Shortcut (konkrete Tastenkombination bei Umsetzung festlegen, auf Kollision mit Windows-Standard-Shortcuts prüfen).
2. **Aufnahme**: Transparentes, randloses Overlay-Fenster über den gesamten Bildschirm (alle Monitore) — Drag-Rechteck wie bei Snipping Tool. Danach exakter Bildausschnitt via Rust-Screenshot-Crate (z.B. `xcap`, cross-platform).
3. **Ziel-Auswahl**: Nach dem Loslassen erscheint eine kleine Auswahl "In welches Projekt?" (Liste der aktiven Projekte) — kein Rätselraten, welches Projekt zuletzt offen war, da der Shortcut jederzeit unabhängig vom App-Zustand ausgelöst werden kann.
4. **Landung im Board**: Bild erscheint als neues, frei platzierbares Bild-Element im gewählten Moodboard (Standardposition wie bei den übrigen "Hinzufügen"-Elementtypen dort — Bild/Farbe/Typo/Notiz laut Design-Prototyp), danach wie jedes andere Element verschieb-/skalierbar.
5. **Bekannte Grenze**: Funktioniert nur, solange der Cultera-Prozess läuft (auch im Hintergrund/minimiert) — bei vollständig geschlossener App reagiert kein globaler Shortcut. OS-Grundregel, keine Design-Lücke.

## Technische Bausteine (grob, nicht final)

- `tauri-plugin-global-shortcut` für den systemweiten Hotkey.
- Neues Tauri-Fenster: randlos, transparent, always-on-top, über alle Monitore gespannt, für das Auswahl-Overlay.
- Rust-Command mit Screenshot-Crate (z.B. `xcap`) zum Einfangen + Zuschneiden auf das gezogene Rechteck.
- Wiederverwendung des in Etappe 5 geplanten Moodboard-Bild-Elementtyps für die Ablage — kein neuer Elementtyp nötig.

## Nächster Schritt

Wird aufgegriffen, sobald die Etappe-5-Spec (Moodboard) geschrieben wird — dann als vollwertiger Abschnitt dort, inkl. Klärung der genauen Tastenkombination, Fehlerfälle (kein aktives Projekt, Screenshot-Berechtigung vom OS verweigert, Multi-Monitor-DPI-Unterschiede) und Datenmodell-Details.
