# Mail — Suche + HTML-Rendering Design Spec
**Datum:** 2026-05-24  
**Status:** Approved  
**Scope:** Sub-Projekt D — Suchfunktion reparieren + HTML-E-Mails korrekt anzeigen

---

## 1. Problem

**Suche:** `setSearch(q)` setzt `store.search`, aber `loadEmails()` wird nie erneut aufgerufen → Sucheingabe hat keinen Effekt.

**HTML-Rendering:** `MailRoute` zeigt nur `emailBody.bodyText`. Viele moderne E-Mails haben keinen Plaintext-Body → leere Detailansicht. `emailBody.bodyHtml` liegt im Store, wird aber ignoriert.

---

## 2. Lösungen

### Suche — Debounced `useEffect` in `MailRoute.tsx`

```typescript
// MailRoute.tsx — neuer useEffect (zusätzlich zu den bestehenden):
useEffect(() => {
  if (!selectedAccountId) return
  const timer = setTimeout(() => loadEmails(), 300)
  return () => clearTimeout(timer)
}, [search])
```

- 300ms Debounce verhindert einen DB-Query pro Tastendruck
- `search` ist bereits im Store und wird von `loadEmails()` gelesen (`MailService.list(..., search)`)
- Kein neuer Store-State nötig

### HTML-Rendering — Sandboxed `<iframe>` in `MailRoute.tsx`

Ersetze im Detail-Panel:
```tsx
// Vorher:
<pre className="...">
  {emailBody.bodyText || '(kein Inhalt)'}
</pre>

// Nachher:
{emailBody.bodyHtml ? (
  <iframe
    title="E-Mail Inhalt"
    srcDoc={emailBody.bodyHtml}
    sandbox="allow-same-origin"
    style={{ border: 'none', width: '100%', minHeight: 400, flex: 1, borderRadius: 8 }}
  />
) : (
  <pre className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
    {emailBody.bodyText || '(kein Inhalt)'}
  </pre>
)}
```

**Warum iframe:**
- Keine neuen Abhängigkeiten (kein DOMPurify, kein html-parser)
- `sandbox="allow-same-origin"` — kein JavaScript, keine externen Requests, kein Form-Submit
- Isoliertes Rendering — CSS des Host-Dokuments beeinflusst Mail-Inhalt nicht
- Fallback auf `bodyText` wenn kein HTML vorhanden

---

## 3. Dateien

```
src/routes/MailRoute.tsx    MODIFY — +search-useEffect, +iframe HTML-Rendering
```

Kein Backend-Code. Kein neuer Store-State. Keine neuen Dependencies.

---

## 4. Fehlerbehandlung

| Szenario | Verhalten |
|---|---|
| `bodyHtml` vorhanden | iframe mit `srcDoc` |
| `bodyHtml` leer, `bodyText` vorhanden | `<pre>` mit bodyText |
| Beides leer | `<pre>` mit `'(kein Inhalt)'` |
| Suche: leerer String | `loadEmails()` lädt alle (kein Filter) |
| Suche: während Tippen | Debounce 300ms, kein Spinner-Flackern |

---

## 5. Out of Scope

- DOMPurify-Integration
- iframe Auto-Resize auf Content-Höhe
- Externe Bilder blockieren/erlauben (Tracking-Pixel)
- Suche über mehrere Ordner gleichzeitig
