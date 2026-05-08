export const SYSTEM_PROMPT = `Du bist **FOCUS AI**, die zentrale künstliche Intelligenz von Cynera Focus.

Deine Aufgaben:
1. Du unterstützt den Nutzer bei allen Fragen rund um Business, Social Media, Kunden, Umsatz, Content und Organisation.
2. Du analysierst Kunden, wenn dir Kundendaten übergeben werden.
3. Du liest und interpretierst:
   - Notizen
   - Aufgaben
   - Follow-Ups
   - KPIs
   - Rechnungen
   - Social-Media-Daten
   - Health-Scores
4. Du gibst konkrete Vorschläge, wie der Nutzer Kunden verbessern kann:
   - bessere Reels
   - bessere Hooks
   - bessere Posting-Frequenz
   - Umsatzsteigerung
   - Follow-Up-Strategien
   - Risiko-Analysen
5. Du erklärst dem Nutzer jederzeit:
   - warum ein Health-Score so ist
   - wie man ihn verbessert
   - welche Chancen und Risiken bestehen

Regeln:
- Sei direkt, klar und ehrlich.
- Keine unnötigen Floskeln.
- Gib immer konkrete Vorschläge.
- Wenn Kundendaten fehlen, frage nach.
- Wenn der Nutzer im Kundenprofil ist, beziehe dich auf diesen Kunden.
- Wenn der Nutzer allgemein fragt, antworte allgemein.

Modi:
- "Chat": allgemeine Fragen beantworten.
- "Kunde": Kundendaten analysieren.
- "Reels": Content-Optimierung.
- "Health": Score erklären und verbessern.

Ziel:
FOCUS AI soll wie ein intelligenter Business-Partner wirken, der versteht, analysiert, erklärt, verbessert und Vorschläge macht.`

// ── Provider detection ────────────────────────────────────────────────────────

const OLLAMA_BASE = 'http://localhost:11434'
const MODEL_PREF  = ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'gemma', 'phi3']

export async function detectOllama() {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return null
    const { models = [] } = await r.json()
    return models.map(m => m.name)
  } catch {
    return null
  }
}

export function pickOllamaModel(models) {
  for (const pref of MODEL_PREF) {
    const hit = models.find(m => m.toLowerCase().startsWith(pref))
    if (hit) return hit
  }
  return models[0] ?? 'llama3.2'
}

// ── Shared streaming core ─────────────────────────────────────────────────────

async function streamCompletion({ url, apiKey, model, messages, onChunk, onDone, onError }) {
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, stream: true, max_tokens: 2048, temperature: 0.7 }),
    })

    if (!response.ok) {
      let msg = `HTTP ${response.status}`
      try { const e = await response.json(); msg = e.error?.message ?? msg } catch {}
      onError(msg); return
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { onDone(); return }
        try {
          const chunk = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
          if (chunk) onChunk(chunk)
        } catch {}
      }
    }
    onDone()
  } catch (e) {
    onError(e.message ?? 'Verbindungsfehler')
  }
}

export const streamOllamaCompletion = ({ model, messages, onChunk, onDone, onError }) =>
  streamCompletion({
    url: `${OLLAMA_BASE}/v1/chat/completions`,
    model: model ?? 'llama3.2',
    messages, onChunk, onDone, onError,
  })

export const streamGroqCompletion = ({ apiKey, messages, onChunk, onDone, onError }) =>
  streamCompletion({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey,
    model: 'llama-3.1-8b-instant',
    messages, onChunk, onDone, onError,
  })

// ── Unified entry point ───────────────────────────────────────────────────────
// In Tauri (production): key lives in Rust binary, JS never touches it.
// In browser (dev mode): falls back to direct Groq fetch with user-provided key.

export const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window

async function streamViaTauri({ messages, onChunk, onDone, onError }) {
  const cleanups = []
  const cleanup  = () => { cleanups.forEach(fn => fn()); cleanups.length = 0 }
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const { listen }  = await import('@tauri-apps/api/event')

    cleanups.push(await listen('ai-chunk', e => onChunk(e.payload)))
    cleanups.push(await listen('ai-done',  () => { cleanup(); onDone() }))

    // invoke returns when Rust is done; errors arrive as thrown exceptions
    await invoke('focus_ai_chat', { messages })
  } catch (e) {
    cleanup()
    onError(typeof e === 'string' ? e : (e?.message ?? 'Unbekannter Fehler'))
  }
}

export function streamAICompletion({ messages, apiKey, onChunk, onDone, onError }) {
  if (IS_TAURI) return streamViaTauri({ messages, onChunk, onDone, onError })
  // Dev-Browser-Fallback: direkter Groq-Request mit manuellem Key
  if (!apiKey) { onError('Kein API Key. Im Tauri-Build wird er automatisch genutzt.'); return }
  return streamGroqCompletion({ apiKey, messages, onChunk, onDone, onError })
}

// ── Context builder ───────────────────────────────────────────────────────────

export function buildCustomerContext(customer, { todos, notes, kpis, health, igCache }) {
  if (!customer) return null
  const lines = [`## Aktiver Kunde: ${customer.name}`]
  if (customer.company)  lines.push(`Firma: ${customer.company}`)
  lines.push(`Status: ${customer.status || 'Unbekannt'}`)
  if (customer.email)    lines.push(`E-Mail: ${customer.email}`)
  if (customer.phone)    lines.push(`Telefon: ${customer.phone}`)
  if (customer.category) lines.push(`Kategorie: ${customer.category}`)

  const open = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed)
  if (todos.length > 0) {
    lines.push(`\n### Aufgaben: ${todos.length} gesamt (${open.length} offen, ${done.length} erledigt)`)
    open.slice(0, 8).forEach(t => lines.push(`- [OFFEN] ${t.text} (Priorität: ${t.prio ?? 'mid'})`))
  }

  if (notes.length > 0) {
    lines.push(`\n### Notizen: ${notes.length} gesamt`)
    notes.slice(0, 5).forEach(n => {
      const preview = (n.content ?? '').replace(/\n/g, ' ').slice(0, 150)
      lines.push(`- "${n.title}": ${preview || '(leer)'}`)
    })
  }

  if (health) {
    lines.push(`\n### Health Score: ${health.score}/100`)
    if (health.notes) lines.push(`  Notizen: ${health.notes}`)
  }

  if (kpis.length > 0) {
    lines.push(`\n### KPIs:`)
    const latest = {}
    kpis.forEach(k => { if (!latest[k.name] || k.date > latest[k.name].date) latest[k.name] = k })
    Object.values(latest).forEach(k => lines.push(`- ${k.name}: ${k.value}${k.unit ? ' ' + k.unit : ''}`))
  }

  if (igCache?.reels?.length > 0) {
    const reels = igCache.reels
    const totalViews = reels.reduce((s, r) => s + (r.play_count ?? r.view_count ?? 0), 0)
    const totalLikes = reels.reduce((s, r) => s + (r.like_count ?? 0), 0)
    lines.push(`\n### Instagram / Reels: ${reels.length} Reels`)
    lines.push(`Gesamt Views: ${totalViews.toLocaleString('de')}, Gesamt Likes: ${totalLikes.toLocaleString('de')}`)
    reels.slice(0, 5).forEach((r, i) => {
      const views   = r.play_count ?? r.view_count ?? '?'
      const likes   = r.like_count ?? '?'
      const caption = (r.caption ?? '').replace(/\n/g, ' ').slice(0, 100)
      lines.push(`${i + 1}. Views: ${views}, Likes: ${likes} | ${caption}`)
    })
  }

  return lines.join('\n')
}
