# CYNERA SYSTEM OS — Notebook
### Tauri + React Desktop App

---

## Voraussetzungen

### 1. Rust installieren (einmalig)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Dann Terminal neu starten
source ~/.cargo/env
```

### 2. Tauri-Abhängigkeiten (Linux)
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

**macOS:** Xcode Command Line Tools reichen (`xcode-select --install`)

**Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + WebView2

---

## Setup & Start

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Dev-Modus starten (öffnet Desktop-Fenster)
npm run tauri dev

# 3. Produktions-Build erstellen
npm run tauri build
```

Das fertige Programm landet in `src-tauri/target/release/bundle/`.

---

## Projekt-Struktur

```
cynera-tauri/
├── src/                        # React Frontend
│   ├── App.jsx                 # Haupt-App
│   ├── main.jsx                # Entry point
│   ├── store/index.js          # Zustand Store + localStorage
│   ├── utils/helpers.js        # Hilfsfunktionen
│   ├── styles/globals.css      # Design System
│   └── components/
│       ├── ui/                 # Avatar, Modal, Toast, EmptyState
│       ├── layout/             # TitleBar, Sidebar, TopBar
│       ├── todos/              # TodoPane
│       ├── notes/              # NotesPane (Multi-Note + Markdown)
│       ├── kpis/               # KpisPane (Tabelle + Inline-Edit)
│       └── CommandPalette.jsx  # ⌘K Palette
├── src-tauri/
│   ├── src/main.rs             # Rust Entry Point
│   ├── tauri.conf.json         # Fenster-Konfiguration
│   └── Cargo.toml              # Rust-Abhängigkeiten
├── vite.config.js
└── package.json
```

---

## Features

| Feature | Details |
|---|---|
| ⌘K Command Palette | `Ctrl+K` / `⌘K` — Kunden, Notizen, Aktionen |
| Mehrere Notizen | Pro Kunde, mit Tags, Markdown-Editor + Vorschau |
| To-Dos | Priorität, Fälligkeitsdatum, Filter |
| KPIs | Sortierbare Tabelle, Inline-Bearbeitung |
| Export / Import | JSON-Backup ein Klick |
| Tauri Fenster | Natives Desktop-Fenster, kein Browser |
| Dunkles Design | Cynera Purple Design System |

---

## Tauri vs Electron

| | Tauri | Electron |
|---|---|---|
| Bundle-Größe | ~8 MB | ~120 MB |
| RAM | ~30 MB | ~150 MB |
| Performance | Nativ (Rust) | Node.js |
| Sicherheit | Rust + CSP | V8 Sandbox |
