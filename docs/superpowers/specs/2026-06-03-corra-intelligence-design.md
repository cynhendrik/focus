# CORRA Intelligence — Design Spec
_2026-06-03_

## Ziel

CORRA Intelligence ist ein dedizierter KI-Assistent-Bereich in Cynera. Nutzer können in natürlicher Sprache Fragen über ihre Geschäftsdaten stellen ("Welche Rechnungen sind überfällig?", "Neue Kunden-Mails?", "Was steht diese Woche an?") und erhalten direkt umsetzbare Antworten mit echten Daten aus der App. Actionable Items können per Knopfdruck in den Fokus-Modus übernommen werden.

---

## Entscheidungen (aus Brainstorming)

| Frage | Entscheidung |
|-------|-------------|
| Proaktiv oder reaktiv? | Reaktiv — CORRA begrüßt und wartet |
| Nav-Platzierung | Über Workspace, als glühender Premium-Button (kein normaler Nav-Eintrag) |
| Focus-Brücke UX | Option C: expandierte Item-Liste + "Alle in Fokus" Button im Chat-Bubble |
| Daten-Architektur | Context Injection — alle relevanten Stores vor jeder Nachricht in System-Prompt |
| Memory | Session-basiert — kein Persistieren über Sitzungen |
| Export | Markdown-Export via Tauri-Dialog |
| Animationen | Framer Motion (bereits installiert: ^11.2.10) |

---

## Komponenten-Architektur

### Message-Type (shared)

```ts
// in src/routes/CorraRoute.tsx oder src/types/corra.types.ts
interface CorraMessage {
  role: 'user' | 'assistant'
  text: string
  actions?: CorraActionItem[]
  focusCta?: string
}
```

### Neue Dateien

```
src/routes/CorraRoute.tsx
  — Haupt-Page: hält messages[], input, loading state
  — Ruft buildCorraIntelligenceContext() auf
  — Parst strukturierten Output (JSON vs. Plain Text)
  — Triggert Focus-Navigation bei CTA-Klick

src/components/corra/CorraChat.tsx
  — Chat-Container: Message-Liste (scrollbar) + Input-Area + Suggested Prompts
  — Framer Motion: AnimatePresence für Nachrichten

src/components/corra/CorraMessage.tsx
  — Einzelne Nachricht-Bubble
  — role: 'user' → rechts, accent-Gradient
  — role: 'assistant' → links, surface-2 + border
  — Enthält CorraActionCard wenn actions[] vorhanden

src/components/corra/CorraActionCard.tsx
  — Expandierte Item-Liste (Rechnungen / Todos / Mails)
  — Jede Zeile: Label, Detail, Urgency-Badge
  — "Alle N in Fokus bearbeiten"-Button am Ende
  — Framer Motion: staggerChildren 80ms für Items

src/components/corra/CorraSuggestedPrompts.tsx
  — Quick-Chips unter dem Input
  — 4 feste Prompts: "Was ist heute wichtig?", "Überfällige Rechnungen?",
    "Neue Kunden-Mails?", "Meine Todos diese Woche?"
  — Klick füllt Input und sendet sofort

src/lib/ai/corra-intelligence.ts
  — buildCorraIntelligenceContext(stores): string
  — CORRA_INTELLIGENCE_SYSTEM: string (neues System-Prompt)
  — parseCorraResponse(raw: string): CorraIntelligenceResponse
  — Types: CorraIntelligenceResponse, CorraActionItem
```

### Modifizierte Dateien

```
src/components/layout/NavSidebar.tsx
  — CORRA-Premium-Button über SidebarSection "Workspace"
  — Eigenes Styling (kein SidebarNavItem): Gradient-Border, Glow-Pulse-Animation
  — onClick → setAppView('corra')

src/store/ui.store.ts
  — AppView Union: 'corra' hinzufügen

src/App.tsx
  — CorraRoute importieren und in RouteSwitch einbinden
```

---

## Context Engine

### `buildCorraIntelligenceContext()`

Liest aus Zustand-Stores und baut einen strukturierten Text-Block. Wird bei **jeder** gesendeten Nachricht neu gebaut (immer aktuell).

**Format:**
```
DATUM: 03.06.2026 (Montag)

TODOS HEUTE/ÜBERFÄLLIG (max 15):
- [ÜBERFÄLLIG] Müller GmbH anrufen (seit 2 Tagen)
- [HEUTE] Angebot Weber AG finalisieren
- [HEUTE] Follow-Up Schmidt KG · reply_mail

RECHNUNGEN ÜBERFÄLLIG (max 10):
- Müller GmbH · RE-2024-047 · €4.200 · 14 Tage überfällig
- Schmidt KG · RE-2024-051 · €1.800 · 7 Tage überfällig
- Weber AG · RE-2024-053 · €920 · 3 Tage überfällig

UNGELESENE KUNDEN-MAILS (max 10):
- Petra König (Müller GmbH) · gestern 14:23 · "Re: Projektstatus"
- Hans Becker · heute 09:11 · "Frage zur Rechnung"

OFFENE DEALS (max 8):
- WebRelaunch Schmitt AG · €12.000 · Stage: proposal
- SEO-Paket Weber · €3.500 · Stage: negotiation

KALENDER HEUTE (max 5):
- 10:00 Call Weber AG
- 14:00 Demo Schmidt KG
```

**Priorisierung:** Überfällig vor Heute vor Kommend. Max. ~80 Zeilen gesamt.

**Store-Quellen:**
- Todos: `useTodosStore` — Filter: `bucket === 'today' || bucket === 'in_progress' || status !== 'done' && dueDate <= heute`
- Rechnungen: `useFinanceStore` → `s.invoices.filter(i => i.status === 'overdue')` (type: `Invoice` mit `dueDate`, `status: InvoiceStatus`)
- Mails: `useMailStore` — Filter: `isRead === false && customerId !== null`
- Deals: `useDealsStore` — Filter: `stage !== 'won' && stage !== 'lost'`
- Kalender: `useCalendarStore` — Filter: Heute

### System-Prompt `CORRA_INTELLIGENCE_SYSTEM`

```
Du bist CORRA Intelligence, ein persönlicher KI-Assistent in Cynera (CRM-App für Berater).
Du hast Zugriff auf alle aktuellen Geschäftsdaten des Nutzers (siehe Kontext unten).

DEINE AUFGABE:
- Beantworte Fragen direkt und präzise mit echten Daten aus dem Kontext
- Erkenne actionable Items (überfällige Rechnungen, ungelesene Mails, offene Todos)
- Schlage dem Nutzer vor, diese im Fokus-Modus zu bearbeiten

ANTWORT-FORMAT:
Wenn deine Antwort actionable Items enthält, antworte ausschließlich als JSON:
{
  "text": "Deine Antwort als Fließtext (2-4 Sätze)",
  "actions": [
    { "type": "invoice|todo|mail", "id": "ID aus dem Kontext", "label": "Firmenname", "detail": "z.B. RE-2024-047 · €4.200", "urgency": "z.B. 14 Tage" }
  ],
  "focusCta": "Kurzer Button-Text, z.B. 'Alle 3 jetzt in Fokus bearbeiten'"
}

Wenn keine Aktionen nötig sind, antworte als normaler Text (kein JSON).

REGELN:
- Immer auf Deutsch
- Ton: direkt, kompetent, kein Berater-Speak
- Zahlen immer mit konkreten Werten (€ Beträge, Tage, Namen)
- Max. 4 Sätze im "text"-Feld, außer explizit mehr verlangt
- Nur Daten aus dem Kontext verwenden — keine Erfindungen
```

---

## Strukturierter Output + Response-Parsing

### Types

```ts
interface CorraActionItem {
  type: 'invoice' | 'todo' | 'mail'
  id: string
  label: string        // z.B. "Müller GmbH"
  detail: string       // z.B. "RE-2024-047 · €4.200"
  urgency: string      // z.B. "14 Tage"
}

interface CorraIntelligenceResponse {
  text: string
  actions?: CorraActionItem[]
  focusCta?: string
}
```

### `parseCorraResponse(raw: string): CorraIntelligenceResponse`

```ts
// Versucht JSON zu parsen, fällt auf Plain Text zurück
try {
  const parsed = JSON.parse(raw)
  if (parsed.text && typeof parsed.text === 'string') return parsed
} catch {}
return { text: raw }
```

### Focus-Bridge-Logik bei CTA-Klick

Für jeden `CorraActionItem` in `actions`:
1. Prüfen ob bereits ein offenes Todo mit `sourceRef === item.id` existiert
2. Falls nein: `upsertTodo({ title: ..., actionType: ..., sourceRef: item.id, bucket: 'today', priority: 'p1' })`
3. Nach dem Anlegen aller Todos: `setAppView('focus')`

| `item.type` | `actionType` im Todo | `title` |
|-------------|---------------------|---------|
| `invoice` | `send_reminder` | `"Mahnung ${label}"` |
| `mail` | `reply_mail` | `"${label} beantworten"` |
| `todo` | bereits vorhanden | direkt in Fokus |

---

## Navigation — CORRA-Button

In `NavSidebar.tsx`, direkt nach dem Brand-Logo-Block und **vor** der ersten `SidebarSection`:

```tsx
<div
  className="corra-nav-button"
  onClick={() => setAppView('corra')}
  data-active={appView === 'corra' ? 'true' : 'false'}
>
  <div className="corra-nav-orb">✦</div>
  <div className="corra-nav-label">
    <span>CORRA</span>
    <small>Intelligence</small>
  </div>
</div>
```

**CSS (global):**
```css
.corra-nav-button {
  margin: 6px 8px 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(124, 58, 237, 0.3);
  background: linear-gradient(135deg, rgba(79,70,229,0.15), rgba(124,58,237,0.15));
  cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  animation: corraPulse 3s ease-in-out infinite;
}
.corra-nav-button[data-active="true"] {
  border-color: rgba(124, 58, 237, 0.7);
  background: linear-gradient(135deg, rgba(79,70,229,0.3), rgba(124,58,237,0.3));
  animation: none;
}
@keyframes corraPulse {
  0%, 100% { box-shadow: 0 0 8px rgba(124,58,237,0.2); }
  50%       { box-shadow: 0 0 18px rgba(124,58,237,0.45); }
}
```

---

## Framer Motion — Animations

### Page Entry (`CorraRoute`)
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: 'easeOut' }}
>
```

### Message Entry (`CorraMessage`)
```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.25, ease: 'easeOut' }}
>
```

### Action-Card Items (stagger, `CorraActionCard`)
```tsx
const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }
```

---

## Export

Button "↗ Exportieren" im Topbar von `CorraRoute`.

```ts
async function exportChat(messages: CorraMessage[]) {
  const lines = messages.map(m =>
    m.role === 'user'
      ? `**Du:** ${m.text}`
      : `**CORRA:** ${m.text}${m.actions ? '\n' + m.actions.map(a => `- ${a.label}: ${a.detail}`).join('\n') : ''}`
  )
  const content = `# CORRA Intelligence — ${new Date().toLocaleDateString('de-DE')}\n\n${lines.join('\n\n')}`
  await navigator.clipboard.writeText(content)
  // Toast: "Protokoll in Zwischenablage kopiert"
}
```

`@tauri-apps/plugin-dialog` und `@tauri-apps/plugin-fs` sind **nicht** installiert — Export nutzt `navigator.clipboard.writeText()`. Button-Label: "↗ Kopieren" (nicht "Exportieren").

---

## Suggested Prompts

Fest verdrahtet, 4 Chips:
1. "Was ist heute wichtig?"
2. "Überfällige Rechnungen?"
3. "Neue Kunden-Mails?"
4. "Meine Todos diese Woche?"

Klick → Text in Input setzen + sofort senden (kein manuelles Absenden nötig).

---

## Abgrenzung: CORRA Focus-Chat vs. CORRA Intelligence

| | FocusCorraChat (bestehend) | CorraRoute (neu) |
|---|---|---|
| Kontext | Nur aktiver Focus-Stack | Alle Stores: Todos, Rechnungen, Mails, Deals, Kalender |
| Platzierung | Seitenleiste im Focus-Modus | Eigene Seite (Top-Nav) |
| System-Prompt | `CORRA_CHAT_SYSTEM` (bestehend) | `CORRA_INTELLIGENCE_SYSTEM` (neu) |
| Zweck | Hilfe beim aktuellen Todo | Überblick + Priorisierung des gesamten Tages |
| Memory | Session | Session |

Beide Systeme koexistieren — `corra.ts` bleibt unverändert.

---

## Out of Scope (für später)

- CORRA kann keine Daten schreiben (nur lesen und in Fokus übergeben)
- Keine Persistenz von Chat-Verläufen über Sitzungen
- Keine Push-Benachrichtigungen von CORRA
- Kein Streaming (vollständige Antworten, wie im bestehenden System)
- Kein Tool-Use API (kein round-trip, alles per Context Injection)
