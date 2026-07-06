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
