import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useDealsStore } from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore } from '@/store/ui.store'
import { useToastStore } from '@/store/toast.store'
import { getApiKey, getModel, MissingApiKeyError } from '@/lib/ai/briefing'
import {
  buildCorraIntelligenceContext,
  parseCorraResponse,
  CORRA_INTELLIGENCE_SYSTEM,
} from '@/lib/ai/corra-intelligence'
import type { CorraMessage, CorraActionItem } from '@/lib/ai/corra-intelligence'
import { CorraChat } from '@/components/corra/CorraChat'
import { log } from '@/lib/logger'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

const GREETING: CorraMessage = {
  role: 'assistant',
  text: 'Hey — ich bin CORRA Intelligence. Ich habe Zugriff auf deine Todos, Rechnungen, Mails und Deals.\n\nWas möchtest du wissen?',
}

export function CorraRoute() {
  const [messages, setMessages] = useState<CorraMessage[]>([GREETING])
  const [loading, setLoading]   = useState(false)

  const invoices       = useFinanceStore(s => s.invoices)
  const todos          = useTodosStore(s => s.allTodos)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const setAppView     = useUiStore(s => s.setAppView)
  const showToast      = useToastStore(s => s.show)

  const handleSend = useCallback(async (text: string) => {
    const userMsg: CorraMessage = { role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const apiKey = getApiKey()
      if (!apiKey) throw new MissingApiKeyError()

      const ctx = buildCorraIntelligenceContext({
        todos, invoices, emails, deals, calendarEvents, accounts,
      })

      const history = [...messages, userMsg]

      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        apiKey,
        body: {
          model: getModel(),
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: `${CORRA_INTELLIGENCE_SYSTEM}\n\n--- AKTUELLE DATEN ---\n${ctx}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: history.map(m => ({ role: m.role, content: m.text })),
        },
      })

      const block = response.content.find(
        (b): b is AnthropicTextBlock => b.type === 'text',
      )
      const raw = block?.text.trim() ?? '(keine Antwort)'
      const parsed = parseCorraResponse(raw)

      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: parsed.text, actions: parsed.actions, focusCta: parsed.focusCta },
      ])
    } catch (e) {
      const errText = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Verbindungsfehler. Versuche es erneut.'
      log.warn('CORRA Intelligence API error', { err: e })
      setMessages(prev => [...prev, { role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [messages, todos, invoices, emails, deals, calendarEvents, accounts])

  const handleFocusActions = useCallback(async (actions: CorraActionItem[]) => {
    try {
      for (const action of actions) {
        if (action.type === 'invoice') {
          await upsertTodo({
            title:      `Mahnung: ${action.label}`,
            actionType: 'send_reminder',
            sourceRef:  action.id,
            bucket:     'today',
            priority:   'p1',
            checklist:  [],
            tags:       [],
          })
        } else if (action.type === 'mail') {
          await upsertTodo({
            title:      `${action.label} beantworten`,
            actionType: 'reply_mail',
            sourceRef:  action.id,
            bucket:     'today',
            priority:   'p1',
            checklist:  [],
            tags:       [],
          })
        }
        // 'todo' type: already exists — no creation needed
      }
      setAppView('focus')
    } catch {
      showToast({ message: 'Fehler beim Anlegen der Fokus-Aufgaben.', variant: 'error' })
    }
  }, [upsertTodo, setAppView, showToast])

  const handleExport = useCallback(() => {
    const lines = messages.map(m => {
      const prefix = m.role === 'user' ? '**Du:**' : '**CORRA:**'
      const actionLines = m.actions
        ? '\n' + m.actions.map(a => `- ${a.label}: ${a.detail}`).join('\n')
        : ''
      return `${prefix} ${m.text}${actionLines}`
    })
    const content = `# CORRA Intelligence — ${new Date().toLocaleDateString('de-DE')}\n\n${lines.join('\n\n')}`
    navigator.clipboard.writeText(content).then(() => {
      showToast({ message: 'Protokoll in Zwischenablage kopiert.', variant: 'success' })
    })
  }, [messages, showToast])

  const handleClear = useCallback(() => {
    setMessages([GREETING])
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <CorraChat
        messages={messages}
        loading={loading}
        onSend={handleSend}
        onFocusActions={handleFocusActions}
        onExport={handleExport}
        onClear={handleClear}
      />
    </div>
  )
}
