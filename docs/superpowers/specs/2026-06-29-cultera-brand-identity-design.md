# Cultera — Brand Identity „Sunset"

**Status:** freigegeben (2026-06-29) · **Branch:** `feature/brand-cultera-sunset`
**Ersetzt:** das alte Blau (`#3B6DF4`) + den Aurora-Verlauf (Blau→Violett `#5b8cff→#8b5bff`).

Dies ist das verbindliche Marken-Manual für **Cultera** (Firma) / **Cultera Focus** (Produkt).
Local-first Business-Cockpit für Solo-Selbstständige & kleine Teams (CRM, Rechnungen/E-Rechnung,
Mail, KORA-KI).

---

## 1 · Positionierung & Persönlichkeit

**Warm, souverän, premium-ruhig** — bewusst *anti-Bank*. Praktisch jedes Buchhaltungs-/CRM-Tool
ist kühl-blau; Cultera ist warm-koralle: menschlich statt behördlich. KORA ist der freundliche
Kopf der Marke („ich nehm dir den Papierkram ab"). Die Farbe ist **Akzent**, nie Fläche — die App
bleibt ruhig (neutrales Grau/Weiß), die Marke leuchtet nur an den richtigen Stellen.

---

## 2 · Farbsystem „Sunset"

### Marken-Akzent (Koralle)
| Rolle | Hex |
|---|---|
| Koralle hell | `#FF9576` |
| **Koralle · Marken-Akzent ★** | `#F2754F` |
| Koralle tief · Hover/Press | `#E05F38` |
| Text-Koralle auf Dunkel (aufgehellt) | `#FF9576` |

**Verlauf** (sparsam — nur Marken-Momente: KORA-Hero, Logo, „Erledigt"-Feier):
`linear-gradient(135deg, #FF7A59, #FFB07C)`

### Semantik (strikt getrennt von der Marke)
| Bedeutung | Hex |
|---|---|
| Bezahlt / erledigt | `#2FA36B` (grün) |
| Warnung / bald fällig | `#E8A23D` (amber) |
| Überfällig / Fehler | `#E5484D` (rot) |
| Info (neutral) | `#2FA39C` (teal) |

> Regel: Koralle taucht in der Semantik **nicht** auf → kein „ist das Marke oder Alarm?".
> Pures Rot ausschließlich für überfällig/Fehler.

### Neutrale Flächen (Akzent-Prinzip)
**Dark gray:** `#0F1113` · `#15171A` · `#1C1F24` · `#23272D` · Text `#E8EAED`
**Weiß:** `#FFFFFF` · `#F7F8FA` · `#F2F4F7` · `#E4E7EB` · Text `#1A1C1E`

Farbe sitzt nur auf: KORA-Hero, aktivem Tab/Nav, primärem CTA, Kennzahl, Link. Sonst neutral.

---

## 3 · Logo / App-Icon — „Der Stapel"

**Idee:** Verstreute Glas-Karten rasten in einen geordneten, gefächerten Stapel — das vorderste,
aktive Blatt in Marken-Koralle mit Dokument-Zeilen. Bedeutung: *Cultera bringt dein Business in
Ordnung* (Rechnungen, Kunden, Mails an einem Ort).

### Aufbau
- **Kachel:** Rounded-Square, Radius **23 %**, Graphit-Verlauf `150° #262A31 → #14161A`,
  Gloss-Highlight oben (`#FFFFFF` @ 18 %).
- **Drei Karten**, Pivot unten Mitte, Winkel **−19° / −2° / +15°**:
  - hintere zwei = Glas (`#FFFFFF` 16 %→4 % Fläche, Kante `#FFFFFF` @ 20 %), Deckkraft 0.42 / 0.66
  - vorderstes Blatt = Koralle-Verlauf `158° #FF9576 → #F2754F`
- **Dokument-Zeilen** auf dem Koralle-Blatt (dunkelgrau): Chip `#33343B`, Zeile kräftig `#282930`,
  Zeile leicht `#282930` @ 50 %.

### Master & Pipeline (reproduzierbar)
- Master: `branding/icon-master.html` (1024×1024, self-contained).
- Rasterisieren (kein magick/inkscape/sharp im Projekt → Headless-Edge):
  ```
  msedge --headless=new --no-sandbox --default-background-color=00000000 \
    --screenshot="branding/cultera-icon-1024.png" --window-size=1024,1024 \
    "file:///<abs>/branding/icon-master.html"
  ```
- Icon-Familie generieren: `node_modules/.bin/tauri icon branding/cultera-icon-1024.png`
  → schreibt `src-tauri/icons/` (32/64/128/128@2x/icon.png, `Icon.ico`, `icon.icns`,
  Square*Logo, StoreLogo, ios/, android/).
- Alte Icons gesichert unter `branding/icons-backup-pre-sunset/`.

### Härtetest
Bei 24–32 px fallen die Zeilen weg; es bleibt die klare 3-Karten-Silhouette mit Koralle-Front.
Verifiziert: 32×32 und 128×128 lesbar.

---

## 4 · Wortmarke

**„Cultera"** — Sans, Weight 700–780, Letter-Spacing −0.025em.
Lockup: Mark + „Cultera" mit Unterzeile **„FOCUS"** (Letter-Spacing 0.22em, Koralle `#FF9576`).
Produktname offiziell: **Cultera Focus**.

---

## 5 · Do / Don't
- **Do:** Farbe als Akzent; neutrale Flächen; Verlauf nur an Marken-Momenten; Rot nur für Alarm.
- **Don't:** ganze Flächen einfärben; Koralle als Warnfarbe missbrauchen; das alte Blau/Aurora
  irgendwo stehen lassen; Verlauf-Overkill auf Alltags-Buttons.

---

## 6 · Migration (offen — eigener Plan)

App-weit `#3B6DF4` / `--accent: #3B6DF4` und den Aurora-Verlauf gegen das Sunset-System tauschen.
Chokepoints: `src/styles/globals.css` (`--accent*`, `--accent-gradient`, `--nav-active-bg`,
diverse hartkodierte `oklch(... 264)`-Blautöne). Wegen Umfang als **eigener Implementierungsplan**
(writing-plans), nicht in diesem Branding-Commit.

**In diesem Branch erledigt:** App-Icon-Familie (Desktop/Taskbar/Tray/Store/iOS/Android) + Master +
dieses Spec.
**Optionale Folge-Politur:** Login-`<Starburst />` & „Cultera Focus®"-Lockup in Sunset; In-App-
Akzent-Migration (siehe oben).
