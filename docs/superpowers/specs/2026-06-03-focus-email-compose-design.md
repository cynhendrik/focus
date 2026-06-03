# Focus E-Mail Compose — Design Spec
_2026-06-03_

## Ziel

E-Mails sollen direkt im Focus-Modus beantwortet und verfasst werden können, ohne den Fokus-Workflow zu verlassen. Wenn eine eingehende E-Mail als To-Do markiert wird, zeigt die Focus-Session die Original-Mail und ein Compose-Formular im Body-Bereich.

---

## Datenfluss

### `reply_mail`-Todo aus dem Inbox

`createMailTodo` in `MailRoute.tsx` wird um zwei Felder ergänzt:

```ts
sourceRef: selectedEmail.id,
notes: [
  `Von: ${displayStr}`,
  `fromAddr: ${selectedEmail.fromAddr}`,
  `sentAt: ${selectedEmail.sentAt}`,
].join('\n'),
```

Das `sourceRef`-Feld zeigt auf die Email-ID in der lokalen DB. `fromAddr` und `sentAt` werden in parsebaren Zeilen in `notes` gespeichert, sodass kein neuer Tauri-Command benötigt wird. `FocusBodyEmail` parst mit `/^fromAddr: (.+)$/m` und `/^sentAt: (.+)$/m`.

### Freies Compose-Todo (`write_email`)

Neuer `TodoActionType`: `'write_email'`. Kein `sourceRef`, kein vorausgefüllter Empfänger. Triggert dieselbe `FocusBodyEmail`-Komponente, aber ohne Original-Mail-Block.

---

## Komponenten

### `FocusBodyEmail` (neu)

**Pfad:** `src/components/focus/FocusBodyEmail.tsx`

**Props:** `{ todo: Todo, onComplete, onSkip, onPostpone }`

**State:**
- `originalBody: string | null` — fetched via `MailService.getBody(todo.sourceRef)`
- `originalLoading: boolean`
- `to: string` — aus `notes` geparst (`/^fromAddr: (.+)$/m`)
- `subject: string` — bei `reply_mail`: `"Re: " + todo.title.replace(/ beantworten$/, '')`; bei `write_email`: leer
- `body: string` — CORRA-Entwurf oder manuell
- `sending / generating: boolean`

**Layout:**

```
┌─── ORIGINAL MAIL (nur wenn sourceRef gesetzt) ──────────┐
│  Von: [fromName aus notes] · [sentAt wenn verfügbar]    │
│  ────────────────────────────────────────────────────── │
│  [originalBody.bodyText — max-height 180px, scrollbar]  │
│  (Spinner während Fetch)                                │
└─────────────────────────────────────────────────────────┘

┌─── COMPOSE ─────────────────────────────────────────────┐
│  AN:       [to — editierbar]                            │
│  BETREFF:  [subject — editierbar]                       │
│  ────────────────────────────────────────────────────── │
│  [TipTap EditorContent — CORRA-Entwurf vorausgefüllt]   │
│  [CORRA-Badge: "CORRA-ENTWURF · EDITIERBAR"]           │
└─────────────────────────────────────────────────────────┘

[Antwort senden]  [CORRA neu]  [Morgen]        [Skip →]
```

**CORRA-Integration:**
- `kind: 'reply_mail'` mit `customerName`, `contactName` (aus notes), `subject`, `notes`
- Auto-generiert beim Mount (wie in `FocusBodyFollowUp`)
- "CORRA neu"-Button regeneriert den Entwurf

**Send-Flow:**
- `MailService.sendEmail({ accountId, to, subject, bodyText: body })`
- Nach Erfolg: `onComplete()`

---

### `FocusBodyFollowUp` (Cleanup)

Der `isReplyMail`-Zweig wird entfernt. Die Komponente behandelt ausschließlich `actionType === 'followup'`. Alle `reply_mail`-spezifischen Pfade (subject `"Re: …"`, `isReplyMail`-Conditionals) werden gelöscht.

---

### `FocusWorkSurface` (Routing-Update)

```ts
const isEmail = todo.actionType === 'reply_mail' || todo.actionType === 'write_email'
```

Render-Reihenfolge:
1. `isReminder` → `FocusBodyReminder`
2. `isInvoice` → `FocusBodyInvoice`
3. `isEmail` → `FocusBodyEmail`  ← neu
4. `todo.actionType === 'followup'` → `FocusBodyFollowUp`
5. default → `FocusBodyDefault`

---

### `TodoActionType` (Types-Update)

```ts
export type TodoActionType =
  | 'send_reminder' | 'create_invoice' | 'followup'
  | 'reply_mail' | 'write_email'   // ← write_email neu
  | 'write_offer' | 'call'
```

---

## Was NICHT geändert wird

- `FocusCockpitBar` / `CockpitMailForm`: bleibt für ad-hoc E-Mails ohne Todo-Kontext
- `MailService`: kein neuer Tauri-Command, `getBody(id)` reicht
- Rust/Backend: keine Änderungen

---

## Offene Punkte

- `write_email`-Todos können aktuell nur manuell oder per Code erstellt werden; ein UI-Einstiegspunkt (z.B. in der Task-Liste) ist nicht Teil dieses Specs.
