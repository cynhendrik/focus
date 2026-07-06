# Lead-Mail-Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `mailto:` link on a Lead's detail modal with an in-app "Mail schreiben" button that opens the existing `ComposeModal`, pre-filled with the lead's email, and logs the sent mail as an activity.

**Architecture:** Pure wiring inside one existing file (`src/components/leads/LeadDetailModal.tsx`). No new components, services, Rust, or DB changes — `ComposeModal`, `MailService.sendEmail`, and the activity-logging shape are all reused verbatim from the patterns already used by Mahnwesen (`MahnwesenPanel.tsx`) and the Follow-up-Sequenz (`stapel-actions.service.ts`).

**Tech Stack:** React, TypeScript, Zustand.

## Global Constraints

- No Rust/DB changes. No new components or services.
- The mail account to send from is `useMailStore.getState().accounts[0]` — this is the established codebase convention (`src/services/stapel-actions.service.ts:60,104`), not a new decision.
- Activity logging after send is best-effort: wrap in `try/catch`, `log.warn` on failure, never surface a logging failure as a send failure (the mail already went out) — matches `src/services/stapel-actions.service.ts:118-131`.
- No new test file for `LeadDetailModal.tsx` — matches this codebase's existing convention of not RTL-testing large modal components (e.g. `NavSidebar.tsx` has none either); verification is the full `npx vitest run` regression + `npx tsc --noEmit` + a manual smoke test.

---

### Task 1: Wire `ComposeModal` into `LeadDetailModal`

**Files:**
- Modify: `src/components/leads/LeadDetailModal.tsx`

**Interfaces:**
- Consumes: `ComposeModal` (`src/components/mail/ComposeModal.tsx`) — props `{ mode: 'new'|'reply'|'forward', accountId: string, initialTo?: string[], onClose: () => void, onSent: () => void }` (plus optional `replyTo`/`replyBody`/`initialSubject`/`initialBody`/`initialAttachmentPaths`, unused here). `useMailStore` (`@/store/mail.store`) — selector `s.accounts: EmailAccount[]` (each with `.id: string`). `ActivitiesGateway.create` (`@/data/activities.gateway`, already imported in this file) — `(payload: CreateActivityPayload) => Promise<Activity>`, payload shape `{ workspaceId, createdBy, accountId, type, title, body, status }`.
- Produces: nothing consumed by later tasks — this is the only task in the plan.

This task is a coordinated UI change with no new pure logic to drive with a failing unit test first (the codebase's own convention, per Global Constraints, is not to add an RTL test for this file). Verification is the full regression suite plus a manual smoke test at the end, described in Steps 6-7.

- [ ] **Step 1: Add the `Mail` icon import and `ComposeModal`/`useMailStore` imports**

At the top of `src/components/leads/LeadDetailModal.tsx`, change:

```typescript
import { useState, useEffect } from 'react'
import { UserCheck, Trash2, Repeat } from 'lucide-react'
import { useLeadsStore } from '@/store/leads.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { leadToUpsertPayload } from '@/lib/lead-payload'
import { useDialogFocus } from '@/components/ui/Sheet'
import { ActivityStream } from '@/components/activity/ActivityStream'
import { ConvertLeadChoice } from '@/components/leads/ConvertLeadChoice'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { log } from '@/lib/logger'
import type { Lead } from '@/types/lead.types'
```

to:

```typescript
import { useState, useEffect } from 'react'
import { UserCheck, Trash2, Repeat, Mail } from 'lucide-react'
import { useLeadsStore } from '@/store/leads.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { useMailStore } from '@/store/mail.store'
import { leadToUpsertPayload } from '@/lib/lead-payload'
import { useDialogFocus } from '@/components/ui/Sheet'
import { ActivityStream } from '@/components/activity/ActivityStream'
import { ConvertLeadChoice } from '@/components/leads/ConvertLeadChoice'
import { ComposeModal } from '@/components/mail/ComposeModal'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { log } from '@/lib/logger'
import type { Lead } from '@/types/lead.types'
```

- [ ] **Step 2: Add `showCompose` state and the mail-accounts selector**

Inside the `LeadDetailModal` component, change:

```typescript
  const upsertLead      = useLeadsStore(s => s.upsert)
  const convertToClient = useLeadsStore(s => s.convertToClient)
  const convertToDeal   = useLeadsStore(s => s.convertToDeal)
  const deleteLead      = useLeadsStore(s => s.deleteLead)
  const userId          = useAuthStore(s => s.user?.id ?? '')
  const showToast       = useToastStore(s => s.show)
  const dialogRef       = useDialogFocus(true)
  const [showConvertChoice, setShowConvertChoice] = useState(false)
  const [deleting, setDeleting]     = useState(false)
```

to:

```typescript
  const upsertLead      = useLeadsStore(s => s.upsert)
  const convertToClient = useLeadsStore(s => s.convertToClient)
  const convertToDeal   = useLeadsStore(s => s.convertToDeal)
  const deleteLead      = useLeadsStore(s => s.deleteLead)
  const userId          = useAuthStore(s => s.user?.id ?? '')
  const showToast       = useToastStore(s => s.show)
  const dialogRef       = useDialogFocus(true)
  const mailAccounts    = useMailStore(s => s.accounts)
  const [showConvertChoice, setShowConvertChoice] = useState(false)
  const [showCompose, setShowCompose]     = useState(false)
  const [deleting, setDeleting]     = useState(false)
```

- [ ] **Step 3: Add the `handleMailSent` handler**

Directly below the existing `handleConvertChoice` function (after its closing `}`, before `async function handleDelete()`), add:

```typescript
  async function handleMailSent() {
    setShowCompose(false)
    try {
      await ActivitiesGateway.create({
        workspaceId, createdBy: userId, accountId: lead.id,
        type: 'email', title: `Mail an ${lead.name}`,
        body: `Per E-Mail an ${lead.email}.`, status: 'done',
      })
    } catch (err) {
      log.warn('lead mail activity logging failed', { err })
    }
    showToast({ message: 'Mail gesendet.', variant: 'success' })
  }
```

- [ ] **Step 4: Add the "Mail schreiben" header button**

In the header action-button row, change:

```typescript
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleSequenceToggle}
```

to:

```typescript
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setShowCompose(true)}
                disabled={!lead.email || mailAccounts.length === 0}
                title={!lead.email
                  ? 'Ohne E-Mail-Adresse nicht möglich'
                  : mailAccounts.length === 0
                    ? 'Kein E-Mail-Konto konfiguriert'
                    : 'Mail an diesen Lead schreiben'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  cursor: (!lead.email || mailAccounts.length === 0) ? 'default' : 'pointer',
                  border: '1px solid var(--accent)', background: 'transparent',
                  color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  opacity: (!lead.email || mailAccounts.length === 0) ? 0.55 : 1,
                }}
              >
                <Mail size={14} /> Mail schreiben
              </button>
              <button
                onClick={handleSequenceToggle}
```

(This inserts the new button immediately before the existing "Sequenz starten/stoppen" button, so the row reads: Mail schreiben → Sequenz starten → Zu Kunde machen → Löschen → close-×.)

- [ ] **Step 5: Convert the `mailto:` pill to a non-interactive span, and render `ComposeModal`**

Change:

```typescript
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                ✉️ {lead.email}
              </a>
            )}
```

to:

```typescript
            {lead.email && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                ✉️ {lead.email}
              </span>
            )}
```

Then, at the bottom of the component's returned JSX, change:

```typescript
      {showConvertChoice && (
        <ConvertLeadChoice
          leadName={lead.name}
          onChoose={handleConvertChoice}
          onCancel={() => setShowConvertChoice(false)}
        />
      )}
    </div>
  )
}
```

to:

```typescript
      {showConvertChoice && (
        <ConvertLeadChoice
          leadName={lead.name}
          onChoose={handleConvertChoice}
          onCancel={() => setShowConvertChoice(false)}
        />
      )}

      {showCompose && (
        <ComposeModal
          mode="new"
          accountId={mailAccounts[0].id}
          initialTo={[lead.email!]}
          onClose={() => setShowCompose(false)}
          onSent={handleMailSent}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Type-check and run the full test suite**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

Run:

```bash
npx vitest run
```

Expected: all tests pass, same count as before this task (no test files touched, no test count change expected).

- [ ] **Step 7: Manual smoke test**

Start the dev app (`npm run tauri dev` or however this project's `run` skill launches it) and verify by hand:
1. Open a Lead with an email address and at least one mail account configured → "Mail schreiben" button is enabled; clicking it opens `ComposeModal` with the lead's email pre-filled as the recipient.
2. Send a test mail → toast "Mail gesendet." appears, and a new "email"-type activity titled "Mail an `<Leadname>`" appears in the Lead's activity stream below.
3. Open a Lead with no email address → "Mail schreiben" button is visibly disabled, with a tooltip "Ohne E-Mail-Adresse nicht möglich"; the email pill area shows "Keine E-Mail hinterlegt" as before (unchanged).
4. Confirm the email address text (when present) is no longer a clickable `mailto:` link.

Report the outcome of this manual check in the task report — if you cannot run/click through the app in your environment, say so explicitly rather than claiming it passed.

- [ ] **Step 8: Commit**

```bash
git add src/components/leads/LeadDetailModal.tsx
git commit -m "$(cat <<'EOF'
feat(leads): Mail-Compose direkt im Lead-Detail statt mailto:

Wiederverwendet ComposeModal + MailService.sendEmail (schon produktiv
bei Mahnwesen/Sequenz) statt den externen Mail-Client zu oeffnen.
Versendete Mail wird als Aktivitaet im Verlauf geloggt (best-effort,
analog stapel-actions.service.ts).
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all 5 numbered changes in the spec (button, disabled states, pill→span, `ComposeModal` render, `handleMailSent`) map onto Steps 1-5. "Nicht im Scope" items (Sequenz interaction, default subject/body, bulk newcomer, Rust/DB) are untouched by this plan. Acceptance criteria (button opens pre-filled compose, disabled+tooltip states, toast+activity on send, no more mailto link, tests green) are covered by Steps 4-7.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command with expected output.
- **Type consistency:** `ComposeModal` props used in Step 5 (`mode`, `accountId`, `initialTo`, `onClose`, `onSent`) match its actual interface read from `src/components/mail/ComposeModal.tsx:11-22`. `ActivitiesGateway.create` payload fields in Step 3 (`workspaceId`, `createdBy`, `accountId`, `type`, `title`, `body`, `status`) match the exact shape already used at `stapel-actions.service.ts:119-127` for the same "email sent" activity type.
