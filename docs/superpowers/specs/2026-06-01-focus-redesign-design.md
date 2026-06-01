# Focus Mode Redesign — Design Spec
_2026-06-01_

## Ziel

Den Focus Mode 1:1 nach dem Mockup (`Focus_Desst.png`) umbauen: Full-Screen-Shell mit eigenem TopBar, Progress-Bar, Schließen-Button, redesignter Queue-Sidebar mit Typ-Icons, und Aktionsbuttons innerhalb der Karte.

---

## Architektur: FocusShell als Full-Screen-Takeover

In `App.tsx` wird `appView === 'focus'` vor dem normalen Layout-Branch behandelt — analog zu `appMode === 'private'`:

```tsx
if (appView === 'focus') {
  return (
    <AppShell>
      <FocusShell />
      <DownloadToast />
      <ToastViewport />
    </AppShell>
  )
}
```

`FocusShell` (`src/components/focus/FocusShell.tsx`) ersetzt NavSidebar + Topbar komplett.

---

## FocusTopBar

**Datei:** `src/components/focus/FocusTopBar.tsx`

Layout: drei Bereiche in einer Zeile, dunkler Hintergrund, Border-Bottom.

**Links:**
- Lime-Dot (8px, rund, `var(--accent)`)
- "Focus" (bold, ~15px)
- "abarbeiten, ohne Ablenkung" (mono, muted, ~11px)

**Mitte:**
- "X / Y" Counter (weiß, ~13px, mono)
- Dünner Progress-Bar (4px hoch, `var(--accent)` fill, gray track), Breite proportional zu X/Y

**Rechts:**
- "Schließen"-Button (outlined, ~12px) + "ESC"-Badge (mono, muted)
- Klick → `setAppView('dashboard')`
- ESC-Key global → gleiche Aktion

---

## FocusShell

**Datei:** `src/components/focus/FocusShell.tsx`

- Lädt Finance + Mail Accounts (wie bisher FocusRoute)
- Mountet `useOverdueTaskSync()`
- Layout: `FocusTopBar` oben (fixed height ~48px) + `FocusWorkspace` darunter (flex: 1, overflow: auto)

---

## FocusWorkspace (Redesign)

**Datei:** `src/components/focus/FocusWorkspace.tsx`

Zwei-Panel-Layout:
- Links: aktuelle Karte (max-width ~700px, zentriert)
- Rechts: `FocusQueueSidebar` (feste Breite ~300px)

Kein eigener Header mehr — der Progress ist jetzt in `FocusTopBar`.

Keyboard-Shortcuts bleiben: ArrowLeft, ArrowRight, M, Space (außer bei Reminder).

---

## FocusQueueSidebar (Redesign)

**Datei:** `src/components/focus/FocusQueueSidebar.tsx`

**Header-Zeile:**
- "Als Nächstes" (Links, mono, uppercase, 10px)
- Count-Badge (rechts, pill, `var(--surface-3)`, z.B. "19")

**Item-Struktur (pro Todo):**
```
│ [Icon] Titel (truncated)          €€€
│       Kundenname
```
- Farbiger linker Border (2px) nach Typ:
  - `send_reminder` / finance → `var(--accent)` (lime) oder Rot-Ton
  - regular task → `var(--border-strong)` (grau)
- Icon-Kreis (24px, farbiger Hintergrund):
  - `send_reminder` → "€" (rot/orange bg)
  - `source === 'finance'` → "€"
  - regular task mit Datum heute → "✓"
  - sonst → erster Buchstabe Kundenname
- Titel: 13px, eine Zeile, overflow ellipsis
- Kundenname: 11px, muted
- Betrag (rechts, muted, 12px): bei Finance-Tasks `invoice.total`-Formatierung

---

## Karten-Redesign: Aktionsbuttons innen

### FocusCardDefault

Aktionsbuttons am Ende der Karte (nicht außerhalb):
- Links: "Überspringen" Ghost-Button → `onSkip()`
- Rechts: Primary-Button (lime) "Erledigt · weiter" → `onComplete()`

Props erweitern: `{ todo: Todo, onComplete: () => Promise<void>, onSkip: () => void }`

### FocusCardReminder

Bereits mit eigenem Send-Button. Zusätzlich links: "Überspringen" Ghost-Button.

Props erweitern: `{ todo: Todo, onComplete: () => Promise<void>, onSkip: () => void }`

### FocusWorkspace

Übergibt `onComplete={complete}` und `onSkip={skip}` an beide Card-Typen.
Entfernt die externe Aktionsbar — alles ist jetzt in den Karten.

"Morgen"-Button (Postpone) bleibt nur per Tastenkürzel M erreichbar (nicht mehr sichtbar).

---

## Card Typ-Label

Jede Karte zeigt oben links ein Typ-Pill:

| actionType / source | Label | Farbe |
|---|---|---|
| `send_reminder` | "RECHNUNG" | Rot/Salmon |
| manual task | "AUFGABE" | Grau |
| (future: mail) | "MAIL" | Blau |

---

## FocusRoute entfernen / umbauen

`src/routes/FocusRoute.tsx` wird nicht mehr als Route-Komponente gebraucht — Logik wandert in `FocusShell`. Die Route-Datei wird gelöscht oder auf einen Re-Export reduziert.

`App.tsx` entfernt den `case 'focus'` im `renderMain()`-Switch und bekommt stattdessen den FocusShell-Branch oberhalb des normalen Layouts.

---

## Dateien-Übersicht

| Action | Datei |
|---|---|
| Neu | `src/components/focus/FocusShell.tsx` |
| Neu | `src/components/focus/FocusTopBar.tsx` |
| Redesign | `src/components/focus/FocusWorkspace.tsx` |
| Redesign | `src/components/focus/FocusQueueSidebar.tsx` |
| Redesign | `src/components/focus/FocusCardDefault.tsx` |
| Redesign | `src/components/focus/FocusCardReminder.tsx` |
| Modify | `src/App.tsx` |
| Delete/simplify | `src/routes/FocusRoute.tsx` |
