# KORA-Newcomer-Klassifizierung

## Kontext

CRM-Audit 2026-07-04 (Memory `crm-audit-2026-07-04`): „KORA-Newcomer-Klassifizierung" — Idee, KI statt/zusätzlich zur bestehenden Regex-Heuristik (`isAutoSender` in `src/lib/mail/newcomer.ts`) zur Einschätzung unbekannter Absender zu nutzen. Als offene Frage stand im Raum: Kosten/Latenz bei einem Aufruf pro Mail-Sync.

**Recherche (2026-07-06) vor dem Design:**
- Mail-Sync läuft alle 5 Minuten automatisch im Hintergrund (`useMailAutoSync.ts:9`, `SYNC_INTERVAL_MS`), solange die App offen ist.
- Der Anthropic-Key ist pro Build eingebettet (`src-tauri/src/commands/ai.rs:6-11` `embedded_key()`, gesetzt via GitHub-Secret in `.github/workflows/build.yml:79-82`) — alle Installationen teilen sich standardmäßig einen Account. Kosten sind eine gebündelte Entwickler-Rechnung, keine Pro-Nutzer-Kosten.
- Bestehende, explizite Produktregel im Code (`docs/superpowers/plans/2026-07-02-phase2-stapel.md:14`): „Kein KI-Call im Grundbetrieb — KORA wird NUR vom 'Mit KORA umformulieren'-Knopf aufgerufen." Aktuell läuft nirgends automatisch KI im Hintergrund.

**Entscheidung (Nutzer, 2026-07-06):** Automatischer Call pro Sync widerspräche dieser Regel und schafft echtes Kosten-/Rate-Limit-Risiko bei mehreren gleichzeitig aktiven Nutzern auf demselben eingebetteten Key. Stattdessen: **manueller Button pro Kandidat**, rein informativ (keine automatische Aktion), analog zum bestehenden „Mit KORA umformulieren"-Muster.

## Scope

- Neue Datei `src/lib/ai/newcomer-classify.ts` (Prompt bauen + `cmd_anthropic_messages`-Aufruf + Antwort parsen), analog zum bestehenden Muster in `src/lib/ai/corra.ts:125-148` (`generateCorraDraft`).
- Modifikation `src/routes/leverage/LeverageMailRoute.tsx` (`UnknownMailRow`): neuer Button „Mit KI prüfen" im aufgeklappten Bereich, plus Verdict-Anzeige.
- Kein Rust-Code, keine DB-Änderung — `cmd_anthropic_messages` existiert bereits und wird nur mit einem neuen Prompt aufgerufen.
- Keine Änderung an der bestehenden Heuristik (`classifyMails`/`isAutoSender`) — die KI-Prüfung ist eine zusätzliche, manuelle Entscheidungshilfe für Kandidaten, die die Heuristik bereits durchgelassen hat (nicht automatisch aussortiert wurden).

## Änderungen

### 1. `src/lib/ai/newcomer-classify.ts` (neu)

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
function parseVerdict(raw: string): NewcomerClassification {
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

(Fallback bei nicht-parsbarer Antwort ist bewusst `'lead'` — im Zweifel lieber einen echten Lead nicht verlieren, als einen guten Kandidaten fälschlich als „kein Lead" auszuweisen. Die Einschätzung ist ohnehin nur eine Anzeige, keine automatische Aktion.)

### 2. `UnknownMailRow` in `LeverageMailRoute.tsx`

Neuer lokaler State: `classifying: boolean`, `classification: NewcomerClassification | null`.

Neuer Button + Verdict-Anzeige direkt unter dem Mailtext-`<div>` im aufgeklappten Bereich (vor dem Lead-Formular):

```tsx
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
```

`handleClassify` (neue async Funktion in `UnknownMailRow`):

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

Button ist `disabled` solange `body` noch nicht geladen ist (`bodyLoading` bzw. `body === null`) — die Zeile lädt den Mailtext bereits beim Aufklappen (bestehender `useEffect`), kein zusätzlicher Lade-Pfad nötig.

## Nicht im Scope (bewusst)

- Kein automatischer Aufruf bei Mail-Sync oder beim Aufklappen der Zeile — nur auf expliziten Klick.
- Keine Persistenz der Einschätzung (kein DB-Feld, kein Cache) — flüchtiger Komponenten-State, verschwindet beim Zuklappen/Neuladen. Bei Bedarf erneut klickbar.
- Keine automatische Aktion bei „kein Lead"-Verdict (kein Ein-Klick-Ignorieren) — der Nutzer nutzt weiterhin den bestehenden „Kein Lead"-Menü-Button.
- Keine Änderung an `classifyMails`/`isAutoSender` (Regex-Heuristik bleibt wie sie ist, entscheidet weiterhin candidates vs. autoSorted).
- Kein Rust-/DB-Code.

## Tests

`src/lib/ai/newcomer-classify.ts` bekommt eine `.test.ts`-Datei — die JSON-Parse-Logik (`parseVerdict`) ist reine, testbare Funktion (gültiges JSON, JSON in Markdown-Fences, kaputtes JSON → Fallback, unbekannter Verdict-Wert → Fallback). Der `invoke`-Aufruf selbst wird wie in vergleichbaren Fällen (`corra.ts` hat ebenfalls keine dedizierte Testdatei, da reiner Tauri-Bridge-Call) nicht gemockt-getestet — Fokus liegt auf der Parse-Logik, die tatsächlich Verzweigungen hat.

`LeverageMailRoute.tsx`/`UnknownMailRow` bekommt keine neue RTL-Testdatei (bestehende Konvention dieser Codebase für große Routen-Komponenten).

## Akzeptanzkriterien

- „Mit KI prüfen"-Button erscheint nur im aufgeklappten Zustand einer Kandidaten-Zeile, disabled solange der Mailtext noch lädt.
- Klick zeigt Ladezustand, dann eine kurze Einschätzung (Verdict + Begründung) direkt unter dem Mailtext.
- Kein automatischer Call — nur bei explizitem Klick.
- Fehlerfall (API-Fehler) zeigt einen neutralen Hinweis statt die App zum Absturz zu bringen.
- Bestehende Heuristik/Kandidatenliste bleibt unverändert.
- `npx vitest run` (inkl. neuer Tests für `parseVerdict`) und `npx tsc --noEmit` bleiben grün.
