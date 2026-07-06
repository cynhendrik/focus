# KORA-Newcomer-Klassifizierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user manually ask KORA (the app's embedded AI) whether an unknown mail sender in the "Newcomer" candidate list looks like a genuine lead or an auto-generated message (newsletter/system mail), as a purely informational decision aid — no automatic calls, no automatic actions.

**Architecture:** A new small pure-ish library function (`classifyNewcomerCandidate`) calls the existing `cmd_anthropic_messages` Tauri command with a classification prompt, following the exact pattern already used by `generateCorraDraft` in `src/lib/ai/corra.ts`. A "Mit KI prüfen" button wired into the existing `UnknownMailRow` component (only visible when the row is expanded and its mail body already loaded) calls it and displays the verdict inline. No Rust, no DB changes.

**Tech Stack:** React, TypeScript, Vitest, existing `cmd_anthropic_messages` Tauri command (Anthropic Claude Haiku).

## Global Constraints

- No Rust/DB changes. `cmd_anthropic_messages` already exists and accepts an arbitrary JSON `body` passed straight through to the Anthropic API (`src-tauri/src/commands/ai.rs:14-17`, `body: Value`) — no new backend code.
- No automatic AI calls anywhere (mail sync, row expand, etc.) — classification only fires on an explicit button click. This directly follows the existing product rule: "Kein KI-Call im Grundbetrieb — KORA wird NUR vom 'Mit KORA umformulieren'-Knopf aufgerufen" (`docs/superpowers/plans/2026-07-02-phase2-stapel.md:14`).
- No persistence of the classification result — component-local state only, cleared on collapse/remount.
- No automatic action taken on a "not_lead" verdict — purely informational; the user continues to use the existing "Kein Lead" / "Lead anlegen" controls themselves.
- Model: `claude-haiku-4-5-20251001` (same as `generateCorraDraft`, `src/lib/ai/corra.ts:135`). API key: `getApiKey() ?? ''` from `src/lib/ai/briefing.ts:343` (empty string makes the Rust side fall back to the embedded key).
- No new RTL test file for `LeverageMailRoute.tsx` — matches this codebase's existing convention for large route components.

---

### Task 1: `classifyNewcomerCandidate` + JSON-verdict parsing (TDD)

**Files:**
- Create: `src/lib/ai/newcomer-classify.ts`
- Create: `src/lib/ai/newcomer-classify.test.ts`

**Interfaces:**
- Produces: `export interface NewcomerClassification { verdict: 'lead' | 'not_lead'; reason: string }`, `export async function classifyNewcomerCandidate(input: { fromName: string; fromAddr: string; subject: string; body: string }): Promise<NewcomerClassification>` — consumed by Task 2.
- Consumes: `getApiKey` from `./briefing` (existing, `src/lib/ai/briefing.ts:343`), `invoke` from `@tauri-apps/api/core` (existing Tauri bridge).

The parsing logic (`parseVerdict`) has real branching worth testing with TDD; the `invoke(...)` call itself is a thin Tauri-bridge passthrough with no branching, so it is not unit-tested here (same convention as `corra.ts`'s `generateCorraDraft`, which also has no dedicated test file).

- [ ] **Step 1: Write the failing tests for `parseVerdict`**

Create `src/lib/ai/newcomer-classify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseVerdict } from './newcomer-classify'

describe('parseVerdict', () => {
  it('parses a valid lead verdict', () => {
    const raw = '{"verdict": "lead", "reason": "Klingt nach echter Anfrage."}'
    expect(parseVerdict(raw)).toEqual({ verdict: 'lead', reason: 'Klingt nach echter Anfrage.' })
  })

  it('parses a valid not_lead verdict', () => {
    const raw = '{"verdict": "not_lead", "reason": "Newsletter-Sprache erkannt."}'
    expect(parseVerdict(raw)).toEqual({ verdict: 'not_lead', reason: 'Newsletter-Sprache erkannt.' })
  })

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"verdict": "lead", "reason": "Test"}\n```'
    expect(parseVerdict(raw)).toEqual({ verdict: 'lead', reason: 'Test' })
  })

  it('falls back to a neutral lead verdict on malformed JSON', () => {
    const result = parseVerdict('not valid json at all')
    expect(result.verdict).toBe('lead')
    expect(result.reason).toContain('nicht eindeutig')
  })

  it('falls back to a neutral lead verdict on an unknown verdict value', () => {
    const raw = '{"verdict": "maybe", "reason": "unsicher"}'
    const result = parseVerdict(raw)
    expect(result.verdict).toBe('lead')
    expect(result.reason).toContain('nicht eindeutig')
  })

  it('defaults reason to an empty string when missing', () => {
    const raw = '{"verdict": "lead"}'
    expect(parseVerdict(raw)).toEqual({ verdict: 'lead', reason: '' })
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/lib/ai/newcomer-classify.test.ts`
Expected: FAIL — `Cannot find module './newcomer-classify'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/newcomer-classify.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import { getApiKey } from './briefing'

export interface NewcomerClassification {
  verdict: 'lead' | 'not_lead'
  reason: string
}

const SYSTEM = `Du bist KORA, ein KI-Assistent in einer CRM-App für Berater und Agenturen.
Deine Aufgabe: eine E-Mail von einem unbekannten Absender einschätzen — ist das eine
echte Anfrage/Kontaktaufnahme einer Person (möglicher neuer Kunde), oder automatisch
generierte Mail (Newsletter, System-Benachrichtigung, No-Reply, Marketing)?

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, keine Erklärung drumherum:
{"verdict": "lead" oder "not_lead", "reason": "ein kurzer Satz auf Deutsch, max. 15 Wörter"}`

function buildUserPrompt(input: { fromName: string; fromAddr: string; subject: string; body: string }): string {
  return `Von: ${input.fromName} <${input.fromAddr}>
Betreff: ${input.subject}

${input.body.slice(0, 1500)}`
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

/** Best-effort JSON-Parse; bei Formatfehler neutraler Fallback statt Crash. */
export function parseVerdict(raw: string): NewcomerClassification {
  try {
    const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.verdict === 'lead' || parsed.verdict === 'not_lead') {
      return { verdict: parsed.verdict, reason: String(parsed.reason ?? '') }
    }
  } catch { /* fällt durch auf Fallback */ }
  return { verdict: 'lead', reason: 'Einschätzung nicht eindeutig — bitte manuell prüfen.' }
}

export async function classifyNewcomerCandidate(input: {
  fromName: string; fromAddr: string; subject: string; body: string
}): Promise<NewcomerClassification> {
  const apiKey = getApiKey() ?? ''
  const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
    apiKey,
    body: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    },
  })
  const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
  return parseVerdict(block?.text.trim() ?? '')
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/ai/newcomer-classify.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/newcomer-classify.ts src/lib/ai/newcomer-classify.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): classifyNewcomerCandidate — KI-Einschaetzung fuer Newcomer-Mails

Ruft cmd_anthropic_messages mit einem Klassifizierungs-Prompt auf,
gleiches Muster wie generateCorraDraft (corra.ts). parseVerdict faellt
bei kaputtem/unerwartetem JSON neutral auf 'lead' zurueck, damit ein
Formatfehler nie einen echten Lead verschwinden laesst.
EOF
)"
```

---

### Task 2: Wire the "Mit KI prüfen" button into `UnknownMailRow`

**Files:**
- Modify: `src/routes/leverage/LeverageMailRoute.tsx`

**Interfaces:**
- Consumes: `classifyNewcomerCandidate`, `NewcomerClassification` from `@/lib/ai/newcomer-classify` (Task 1, exact names above).

This task is UI wiring with no new pure logic to unit-test (the async handler is a thin call-and-set-state wrapper around the already-tested `classifyNewcomerCandidate`). Verification is the full regression suite plus a manual smoke test.

- [ ] **Step 1: Add the `Sparkles` icon and `classifyNewcomerCandidate` import**

Change:

```typescript
import { Inbox, UserPlus, ChevronRight, ChevronDown, EyeOff, Eye, AtSign, Ban } from 'lucide-react'
```

to:

```typescript
import { Inbox, UserPlus, ChevronRight, ChevronDown, EyeOff, Eye, AtSign, Ban, Sparkles } from 'lucide-react'
```

and add, alongside the other imports near the top of the file:

```typescript
import { classifyNewcomerCandidate } from '@/lib/ai/newcomer-classify'
import type { NewcomerClassification } from '@/lib/ai/newcomer-classify'
```

- [ ] **Step 2: Add classification state inside `UnknownMailRow`**

Change:

```typescript
  const [body, setBody]             = useState<string | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [name, setName]             = useState(mail.fromName || mail.fromAddr)
  const [phone, setPhone]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [ignoreMenuOpen, setIgnoreMenuOpen] = useState(false)
```

to:

```typescript
  const [body, setBody]             = useState<string | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [name, setName]             = useState(mail.fromName || mail.fromAddr)
  const [phone, setPhone]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [ignoreMenuOpen, setIgnoreMenuOpen] = useState(false)
  const [classifying, setClassifying]     = useState(false)
  const [classification, setClassification] = useState<NewcomerClassification | null>(null)
```

- [ ] **Step 3: Add `handleClassify`**

Directly below the existing `handleSubmit` function (after its closing `}`, before the `return (` that starts the component's JSX), add:

```typescript
  async function handleClassify() {
    if (!body) return
    setClassifying(true)
    try {
      const result = await classifyNewcomerCandidate({
        fromName: mail.fromName || mail.fromAddr,
        fromAddr: mail.fromAddr,
        subject: mail.subject || '',
        body,
      })
      setClassification(result)
    } catch (err) {
      log.error('newcomer classification failed', { err })
      setClassification({ verdict: 'lead', reason: 'KI-Prüfung fehlgeschlagen — bitte manuell einschätzen.' })
    } finally {
      setClassifying(false)
    }
  }
```

- [ ] **Step 4: Add the button and verdict display below the mail-text box**

Change:

```typescript
          <div style={{
            fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap',
            userSelect: 'text', maxHeight: 220, overflowY: 'auto',
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)', lineHeight: 1.5,
          }}>
            {bodyLoading ? 'Lade Inhalt…' : body}
          </div>

          {/* Lead-Formular */}
```

to:

```typescript
          <div style={{
            fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap',
            userSelect: 'text', maxHeight: 220, overflowY: 'auto',
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)', lineHeight: 1.5,
          }}>
            {bodyLoading ? 'Lade Inhalt…' : body}
          </div>

          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleClassify}
              disabled={classifying || !body}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: '1px solid var(--border)', cursor: classifying ? 'default' : 'pointer',
                background: 'transparent', color: 'var(--fg-dim)', fontFamily: 'inherit',
                opacity: classifying || !body ? 0.6 : 1,
              }}
            >
              <Sparkles size={12} /> {classifying ? 'Prüft…' : 'Mit KI prüfen'}
            </button>
            {classification && (
              <span style={{
                fontSize: 11, color: classification.verdict === 'lead' ? 'var(--ok)' : 'var(--fg-dim)',
              }}>
                {classification.verdict === 'lead' ? '✓ wahrscheinlich Lead' : '— wahrscheinlich kein Lead'}
                {classification.reason && ` — ${classification.reason}`}
              </span>
            )}
          </div>

          {/* Lead-Formular */}
```

- [ ] **Step 5: Type-check and run the full test suite**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

Run:

```bash
npx vitest run
```

Expected: all tests pass (146+1 files, the new `newcomer-classify.test.ts` from Task 1 plus 876 pre-existing, no regressions).

- [ ] **Step 6: Manual smoke test**

If you can launch and interact with the running desktop app in your environment, verify by hand:
1. Open "Newcomer", expand a candidate row so its mail text loads.
2. Click "Mit KI prüfen" → button shows "Prüft…", then a verdict appears next to it ("✓ wahrscheinlich Lead — ..." or "— wahrscheinlich kein Lead — ...").
3. Collapse and re-expand the row → the verdict is gone (no persistence, as specified).
4. Confirm no AI call fires automatically just from expanding a row or from a mail sync — only the explicit button click triggers one.

If you cannot run/click through the app in your environment, say so explicitly in your report.

- [ ] **Step 7: Commit**

```bash
git add src/routes/leverage/LeverageMailRoute.tsx
git commit -m "$(cat <<'EOF'
feat(newcomer): "Mit KI pruefen"-Button fuer Kandidaten-Zeilen

Rein manuelle, informative Einschaetzung -- kein automatischer Call,
keine automatische Aktion bei "kein Lead". Nutzt classifyNewcomerCandidate
(newcomer-classify.ts), zeigt Verdict+Begruendung neben dem Button.
Kein Caching: verschwindet beim Zuklappen.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all changes from the spec (new lib file with `parseVerdict`/`classifyNewcomerCandidate`, `UnknownMailRow` button+state+handler) map onto Task 1 and Task 2. "Nicht im Scope" items (no auto-call, no persistence, no auto-ignore action, no heuristic change, no Rust/DB) are respected — nothing in either task touches `classifyMails`/`isAutoSender`, adds a DB column, or wires an automatic trigger.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command with expected output.
- **Type consistency:** `NewcomerClassification` and `classifyNewcomerCandidate`'s parameter shape (`{ fromName, fromAddr, subject, body }`) are defined in Task 1 and consumed identically in Task 2's `handleClassify`. `parseVerdict` is exported from Task 1 specifically so Task 1's own tests can import it directly (not just indirectly through `classifyNewcomerCandidate`).
