# Mail Suche + HTML-Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suchfunktion in MailRoute reparieren (Debounce-Effect) + HTML-E-Mails per sandboxed iframe anzeigen.

**Architecture:** Beide Fixes in einer einzigen Datei (`src/routes/MailRoute.tsx`). Kein neuer Store-State, kein Backend-Code, keine neuen Dependencies.

**Tech Stack:** React 18, TypeScript, bestehender `useMailStore`

---

## Dateistruktur

```
src/routes/MailRoute.tsx    MODIFY — 2 unabhängige Änderungen
```

---

### Task 1: Suche reparieren — Debounced useEffect

**Files:**
- Modify: `src/routes/MailRoute.tsx`

Aktueller Zustand: Das `<input>`-Feld ruft `setSearch(e.target.value)` auf, aber kein Code ruft danach `loadEmails()` auf. Die Suche setzt nur State ohne Effekt.

Die Lösung: ein neuer `useEffect`, der auf `search` reagiert und mit 300ms Debounce `loadEmails()` triggert.

- [ ] **Step 1: Debounce-Effect in MailRoute hinzufügen**

In `src/routes/MailRoute.tsx`, nach dem bestehenden zweiten `useEffect` (der für `loadFolders`, Zeilen 32-39), einfügen:

```typescript
useEffect(() => {
  if (!selectedAccountId) return
  const timer = setTimeout(() => loadEmails(), 300)
  return () => clearTimeout(timer)
}, [search])
```

Der vollständige Block nach dem Einfügen sieht so aus:

```typescript
// Bestehend — loadFolders bei Account-Wechsel:
useEffect(() => {
  if (!selectedAccountId) return
  loadFolders(selectedAccountId)
  const interval = setInterval(() => {
    loadFolders(selectedAccountId)
  }, 15 * 60 * 1000)
  return () => clearInterval(interval)
}, [selectedAccountId])

// NEU — Suche mit Debounce:
useEffect(() => {
  if (!selectedAccountId) return
  const timer = setTimeout(() => loadEmails(), 300)
  return () => clearTimeout(timer)
}, [search])
```

- [ ] **Step 2: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | findstr /v "test\." 
```

Erwartet: keine neuen Fehler in `MailRoute.tsx` (Fehler in `.test.`-Dateien ignorieren).

- [ ] **Step 3: Commit**

```bash
git add src/routes/MailRoute.tsx
git commit -m "fix(mail): Suche — debounced useEffect triggert loadEmails() bei Eingabe"
```

---

### Task 2: HTML-E-Mails per sandboxed iframe rendern

**Files:**
- Modify: `src/routes/MailRoute.tsx`

Aktueller Zustand: Der Detail-View zeigt nur `bodyText`. `bodyHtml` aus dem Store wird ignoriert.

Die Lösung: Wenn `emailBody.bodyHtml` vorhanden ist, ein `<iframe>` mit `srcDoc` und `sandbox="allow-same-origin"` rendern. Fallback: `<pre>` mit `bodyText`.

- [ ] **Step 1: Detail-View ersetzen**

In `src/routes/MailRoute.tsx`, finde den Block (ca. Zeile 241-244):

```tsx
{emailBody ? (
  <pre className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
    {emailBody.bodyText || '(kein Inhalt)'}
  </pre>
) : (
  <p className="text-xs text-[var(--text2)]">Lädt…</p>
)}
```

Ersetze durch:

```tsx
{emailBody ? (
  emailBody.bodyHtml ? (
    <iframe
      title="E-Mail Inhalt"
      srcDoc={emailBody.bodyHtml}
      sandbox="allow-same-origin"
      style={{
        border: 'none',
        width: '100%',
        minHeight: 400,
        flex: 1,
        borderRadius: 8,
        background: '#fff',
      }}
    />
  ) : (
    <pre className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
      {emailBody.bodyText || '(kein Inhalt)'}
    </pre>
  )
) : (
  <p className="text-xs text-[var(--text2)]">Lädt…</p>
)}
```

**Warum `sandbox="allow-same-origin"`:**
- Kein `allow-scripts` → kein JavaScript in der Mail
- `allow-same-origin` ist nötig damit `srcDoc` überhaupt rendert (sonst behandelt der Browser es als cross-origin)
- Keine externen Requests (kein `allow-forms`, kein `allow-top-navigation`)

- [ ] **Step 2: TypeScript-Check**

```bash
npx tsc --noEmit 2>&1 | findstr /v "test\."
```

Erwartet: keine neuen Fehler in `MailRoute.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/MailRoute.tsx
git commit -m "feat(mail): HTML-E-Mails per sandboxed iframe rendern, Plaintext als Fallback"
```

---

## Manuelle Verifikation (nach allen Tasks)

```bash
pnpm tauri dev
```

Checkliste:

| # | Szenario | Erwartet |
|---|---|---|
| 1 | Suchbegriff eingeben | Nach ~300ms aktualisiert sich die E-Mail-Liste |
| 2 | Suchfeld leeren | Alle E-Mails werden wieder angezeigt |
| 3 | HTML-E-Mail öffnen | iframe zeigt formatiertes HTML |
| 4 | Plaintext-E-Mail öffnen | `<pre>`-Block mit Text |
| 5 | E-Mail ohne Body öffnen | "(kein Inhalt)" |
