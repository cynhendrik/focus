# KORA Command Center — Design Spec

**Date:** 2026-06-07
**Goal:** KORA wird vom kleinen Floating-Panel zu einem vollwertigen Vollbild-Command-Center. Chat, Widgets und One-Click-Actions in einem einheitlichen Interface.

---

## Übersicht

Die aktive Phase der KORA-Route wird komplett neu gebaut. Statt eines 280px Floating Panels nimmt der Chat die gesamte Seite ein (zentrierte Spalte, max 760px). Nachrichten können Text, inline Action Cards und Daten-Widgets enthalten — alles direkt ausführbar ohne die Seite zu verlassen.

---

## Architektur

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/routes/CorraRoute.tsx` | Active Phase: Floating Panel → Vollbild-Chat |
| `src/components/corra/CorraChatPanel.tsx` | Komplett neu: Vollbild-Layout, zentrierte Spalte |
| `src/components/corra/CorraMessage.tsx` | Erweitert: Action Cards inline, Widget-Embed |
| `src/components/corra/CorraActionCard.tsx` | Direktausführung statt Fokus-Weiterleitung |
| `src/lib/ai/corra-intelligence.ts` | System-Prompt: Startup-Analyse-Instruktion |

---

## Layout

### Vollbild-Chat (aktive Phase)

```
┌─────────────────────────────────────────────┐
│  ✦ KORA INTELLIGENCE          3 OFFEN  neu ↺ │  ← Topbar (border-bottom)
├─────────────────────────────────────────────┤
│                                              │
│   [Nachricht]                               │  ← scroll container
│   [Action Cards]                            │    max-width: 760px
│   [Widget]                                  │    margin: 0 auto
│   [User-Nachricht]                          │
│                                             │
├─────────────────────────────────────────────┤
│  [ Frag KORA…                          ↑ ]  │  ← Input (immer sichtbar)
└─────────────────────────────────────────────┘
```

- Background: `var(--bg)` + Dot-Grid (gleich wie IdleView)
- Keine Sidebar, kein Split — volle Breite für den Chat
- Input-Box unten fixiert, immer sichtbar

---

## Nachrichten-Typen

### 1. Text
Normaler Fließtext, `pre-wrap`, 13–14px, `line-height: 1.65`. Markdown-artige Bold/Italic-Darstellung via einfachem Parser (keine externe Lib nötig).

### 2. Action Cards (inline in KORA-Antwort)
Jede Action Card enthält:
- Icon + Titel + Subtext (Kontext)
- Primärer Button: `→ [Aktion]` — führt direkt aus
- Sekundärer Button: `Später` — dismisst die Card
- Nach Ausführung: Card zeigt `✓ Erledigt` statt Buttons

Ausführung direkt via Store-Actions (kein Umweg über Fokus-Ansicht):
- `invoice` → `FinanceService` oder Todo-Eintrag mit `actionType: 'send_reminder'`
- `mail` → Todo-Eintrag mit `actionType: 'reply_mail'`
- `todo` → `useTodosStore.upsert()`

### 3. Widgets
Datenfragen triggern ein Widget das direkt in der Chat-Bubble gerendert wird. Nutzt bestehende `CorraWidget`-Komponente (eingebettet statt zentriert auf der Seite).

Widget-Typen bleiben wie bisher — werden nur von der Mitte ins Chat-Bubble verschoben.

---

## Startup-Analyse

Wenn KORA von Idle → Active wechselt (erster `handleSend`-Aufruf), schickt die Route **zusätzlich** einen stillen System-Aufruf: `"Was sind die 3 wichtigsten offenen Punkte heute?"` — dieser erscheint als erste KORA-Antwort mit Action Cards bevor die Nutzerfrage beantwortet wird.

**Alternativ (einfacher):** Der System-Prompt instruiert KORA, die erste Antwort immer mit einem kurzen Triage-Summary zu beginnen wenn es der erste Turn ist.

→ Gewählte Variante: **System-Prompt-Instruktion** (kein extra API-Call).

---

## CorraActionCard — Direktausführung

Bestehende `CorraActionCard` wird umgebaut:
- Kein `onFocus`-Callback mehr der zur Fokus-Ansicht navigiert
- Stattdessen: `onExecute(action)` pro Item
- Der ausführende Handler lebt in `CorraRoute` und ruft Store-Actions direkt auf
- State: `'idle' | 'loading' | 'done' | 'dismissed'` pro Card

---

## IdleView — keine Änderung

`CorraIdleView` bleibt wie sie ist (Dot-Grid, Headline, zentrierter Input).

---

## Nicht in Scope

- Markdown-Renderer (nur Bold/Italic, keine Code-Blocks)
- Streaming / Token-by-Token-Ausgabe
- Neue Widget-Typen
- Persistenz der Chat-History über Sessions
