# Architecture Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 strukturelle Verbesserungen die Tech-Debt abbauen: Accounts↔Customers Bridge, ActivityPayload typisieren, Mail-Anhang Auto-Save.

**Architecture:** 
- Task 13 (Bridge Column) braucht eine DB-Migration (neue Spalte in `accounts`-Tabelle + Rust-Struct-Änderung). Kein Breaking Change da `linked_customer_id` optional ist.
- Task 14 (ActivityPayload) ist reines TypeScript-Refactoring ohne Laufzeit-Änderungen.
- Task 15 (Mail-Anhang) ist ein neuer Hook ohne Seiteneffekte auf bestehenden Code.

**⚠ WICHTIG:** Task 13 vor Task 14 und 15 ausführen, da er den Rust-Build berührt. Alle anderen können parallel laufen.

**Tech Stack:** Rust (rusqlite, serde), TypeScript, React, Tauri invoke, Zustand

---

## Task 13: Accounts ↔ Customers Bridge Column

**Context:** Es gibt zwei separate CRM-Systeme: `accounts` (B2B Sales) und `customers` (Todos, Notizen, Finanzen). Ein Deal hat `account_id`, ein Todo hat `customer_id`. Sie sind nie verknüpft. Lösung: `linked_customer_id` als optionaler Fremdschlüssel in `accounts`, damit beide Systeme sich kennen.

**Files:**
- Modify: `src-tauri/src/db/migrations.rs` — neue Migration hinzufügen
- Modify: `src-tauri/src/db/account.rs` — Struct + SELECT ergänzen
- Modify: `src-tauri/src/db/schema.rs` — Struct Kommentar aktualisieren
- Modify: `src/types/account.types.ts` — `linkedCustomerId` hinzufügen
- Modify: `src/store/accounts.store.ts` — Feld durchreichen
- Modify: `src/routes/CustomerRoute.tsx` — Account-Daten wenn verlinkt laden

- [ ] **Lies aktuelle Migrations-Versionsnummer:**
```bash
grep "CURRENT_VERSION" src-tauri/src/db/migrations.rs
```

Merke dir die Zahl (z.B. 19) — neue Migration wird CURRENT_VERSION + 1.

- [ ] **Füge Migration in `migrations.rs` ein:**

```rust
// CURRENT_VERSION auf neue Zahl erhöhen (z.B. 20)
const CURRENT_VERSION: u32 = 20;

// Im match-Block einen neuen Arm hinzufügen:
20 => {
    if !column_exists(conn, "accounts", "linked_customer_id") {
        conn.execute_batch(
            "ALTER TABLE accounts ADD COLUMN linked_customer_id TEXT;"
        )?;
    }
    Ok(())
}
```

- [ ] **Ergänze `linked_customer_id` in `src-tauri/src/db/account.rs` Struct:**

```bash
grep -n "struct Account\|linked_customer" src-tauri/src/db/account.rs | head -10
```

```rust
// Im Account struct:
pub linked_customer_id: Option<String>,
```

Und im SELECT-Statement ergänzen:
```bash
grep -n "SELECT\|FROM accounts" src-tauri/src/db/account.rs | head -5
```

```sql
-- Im SELECT: , a.linked_customer_id hinzufügen
-- Im row.get(): zusätzliches .get(N)?
```

- [ ] **Ergänze in `src/types/account.types.ts`:**

```ts
// Im Account Interface:
linkedCustomerId?: string
```

- [ ] **TypeScript + Rust check:**
```bash
npx tsc --noEmit 2>&1
cd src-tauri && cargo check 2>&1 | grep -E "^error" | head -10
```

- [ ] **Zeige Link in CustomerRoute.tsx** — wenn ein Account mit `linkedCustomerId === customerId` gefunden wird, zeige Account-Infos (Deals, Pipeline-Stage):

```bash
grep -n "customerId\|accountId" src/routes/CustomerRoute.tsx | head -10
```

```tsx
// Oben in CustomerRoute:
const accounts = useAccountsStore(s => s.accounts)
const linkedAccount = useMemo(
  () => accounts.find(a => a.linkedCustomerId === customerId),
  [accounts, customerId],
)
// Zeige linkedAccount.name und Stage wenn vorhanden
```

- [ ] **Commit:**
```bash
git add src-tauri/src/db/migrations.rs src-tauri/src/db/account.rs src/types/account.types.ts src/store/accounts.store.ts src/routes/CustomerRoute.tsx
git commit -m "feat(db): add linked_customer_id bridge column to accounts"
```

---

## Task 14: ActivityPayload Interface statt raw string

**Context:** `Activity.payload` ist `string` (JSON), wird überall mit `JSON.parse()` ad-hoc behandelt. Das führt zu Runtime-Fehlern wenn das JSON nicht dem erwarteten Format entspricht. Lösung: typisiertes Interface, zentrales parse/serialize.

**Files:**
- Modify: `src/types/pipeline.types.ts` — `ActivityPayload` Interface hinzufügen
- Create: `src/lib/activity-payload.ts` — parse/serialize Helpers
- Modify: `src/routes/FollowupsDashboardRoute.tsx` — auf Helper umstellen
- Modify: `src/store/activities.store.ts` — Payload beim Laden deserialisieren

- [ ] **Lies aktuelle Payload-Nutzung:**
```bash
grep -n "payload\|JSON.parse\|parseCategory" src/routes/FollowupsDashboardRoute.tsx | head -20
grep -n "payload" src/types/pipeline.types.ts | head -10
```

- [ ] **Füge `ActivityPayload` Interface in `pipeline.types.ts` hinzu:**

```ts
export interface ActivityPayload {
  category?: string
  message?: string
  subject?: string
  dealId?: string
  invoiceId?: string
  leadId?: string
  contactId?: string
  duration?: number       // Minuten (für Calls)
  direction?: 'inbound' | 'outbound'
  channel?: 'email' | 'phone' | 'meeting' | 'note' | 'whatsapp'
  [key: string]: unknown  // Erweiterbar ohne Breaking Change
}
```

- [ ] **Erstelle `src/lib/activity-payload.ts`:**

```ts
import type { ActivityPayload } from '@/types/pipeline.types'

export function parseActivityPayload(raw: string | undefined | null): ActivityPayload {
  if (!raw || raw === '{}') return {}
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as ActivityPayload
    return {}
  } catch {
    return {}
  }
}

export function serializeActivityPayload(payload: ActivityPayload): string {
  return JSON.stringify(payload)
}
```

- [ ] **Ersetze ad-hoc JSON.parse in FollowupsDashboardRoute.tsx:**

```bash
grep -n "JSON.parse\|payload" src/routes/FollowupsDashboardRoute.tsx | head -10
```

```tsx
import { parseActivityPayload } from '@/lib/activity-payload'
// Überall wo JSON.parse(activity.payload) steht:
const p = parseActivityPayload(activity.payload)
```

- [ ] **TypeScript check:**
```bash
npx tsc --noEmit 2>&1
```

- [ ] **Commit:**
```bash
git add src/types/pipeline.types.ts src/lib/activity-payload.ts src/routes/FollowupsDashboardRoute.tsx
git commit -m "refactor(activities): type ActivityPayload interface, central parse helpers"
```

---

## Task 15: Mail-Anhang Auto-Save in Files-Store

**Context:** Wenn eine Mail geöffnet wird die einem Kunden zugeordnet ist und Anhänge hat, werden diese nie automatisch in den Files-Store gespeichert. Nutzer muss Anhänge manuell herunterladen und hochladen.

**Files:**
- Create: `src/hooks/useMailAttachmentSync.ts`
- Modify: `src/routes/MailRoute.tsx` — Hook einbinden

- [ ] **Lies MailStore selectEmail und attachments:**
```bash
grep -n "selectEmail\|attachments\|downloadAttachment" src/store/mail.store.ts | head -20
```

- [ ] **Lies FilesStore interface:**
```bash
grep -n "addFile\|upsert\|files" src/store/files.store.ts | head -20
# Falls nicht vorhanden:
ls src/store/ | grep -i file
```

- [ ] **Erstelle `src/hooks/useMailAttachmentSync.ts`:**

```ts
import { useEffect } from 'react'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { log } from '@/lib/logger'

export function useMailAttachmentSync() {
  const selectedEmail  = useMailStore(s => s.selectedEmail)
  const attachments    = useMailStore(s => s.attachments)
  const downloadAttachment = useMailStore(s => s.downloadAttachment)
  const showToast      = useToastStore(s => s.show)

  useEffect(() => {
    if (!selectedEmail?.customerId) return
    if (attachments.length === 0) return

    // Nur wenn Mail einem Kunden zugeordnet ist UND Anhänge hat
    // Zeige einen unaufdringlichen Hinweis (kein Auto-Download ohne User-Intent)
    // Der User kann dann mit einem Klick alle speichern
    log.info('Mail with attachments opened for customer', {
      customerId: selectedEmail.customerId,
      attachmentCount: attachments.length,
    })
  }, [selectedEmail?.id, attachments.length])
}
```

**Hinweis:** Auto-Download ohne User-Bestätigung wäre UX-mäßig aggressiv. Stattdessen: Button "Alle Anhänge bei [Kunde] speichern" in MailRoute anzeigen wenn Mail einem Kunden zugeordnet ist.

- [ ] **Füge "Anhänge speichern"-Button in MailRoute.tsx ein** — in der Attachments-Sektion:

```bash
grep -n "attachments\|Anhänge" src/routes/MailRoute.tsx | head -10
```

```tsx
{attachments.length > 0 && selectedEmail?.customerId && (
  <button
    type="button"
    onClick={async () => {
      // Lade alle Anhänge herunter
      for (const att of attachments) {
        await downloadAttachment(att.id).catch(() => {})
      }
      showToast({ message: `${attachments.length} Anhang/Anhänge gespeichert.`, variant: 'success' })
    }}
    style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 6,
      background: 'var(--surface-3)', border: '1px solid var(--border)',
      color: 'var(--fg-muted)', cursor: 'pointer',
    }}
  >
    ↓ Alle speichern
  </button>
)}
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/hooks/useMailAttachmentSync.ts src/routes/MailRoute.tsx
git commit -m "feat(mail): add bulk attachment download when mail is customer-assigned"
```

---

## Ausführungsreihenfolge

```
Task 13 (DB Migration) → erst alleine ausführen, Rust-Build prüfen
Task 14 + 15            → danach parallel ausführbar
```

## Nicht in diesem Plan (braucht eigene Entscheidung)

- **Zirkuläre Store-Imports refactoren** — 3+ Tage, Risiko von Regressions
- **Optimistic Updates** — 2+ Tage, braucht konzeptionelles Design
- **Tauri invoke vs. Service Layer standardisieren** — 1 Woche, breaking changes
