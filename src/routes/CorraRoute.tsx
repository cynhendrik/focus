// src/routes/CorraRoute.tsx
import { useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore }  from '@/store/finance.store'
import { useTodosStore }    from '@/store/todos.store'
import { useMailStore }     from '@/store/mail.store'
import { useDealsStore }    from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCrmStore }      from '@/store/crm.store'
import { useLeadsStore }    from '@/store/leads.store'
import { useToastStore }    from '@/store/toast.store'
import { getApiKey, getModel, MissingApiKeyError } from '@/lib/ai/briefing'
import {
  buildCorraIntelligenceContext,
  parseCorraResponse,
  CORRA_INTELLIGENCE_SYSTEM,
} from '@/lib/ai/corra-intelligence'
import type { CorraMessage, CorraActionItem } from '@/lib/ai/corra-intelligence'
import { CorraIdleView }  from '@/components/corra/CorraIdleView'
import { CorraChatPanel } from '@/components/corra/CorraChatPanel'
import { log } from '@/lib/logger'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

type Phase = 'idle' | 'active'

const makeGreeting = (): CorraMessage => ({
  id: '0', role: 'assistant',
  text: 'Hey — ich bin KORA. Was möchtest du wissen?',
})

export function CorraRoute() {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [messages, setMessages] = useState<CorraMessage[]>(() => [makeGreeting()])
  const [loading, setLoading]   = useState(false)

  const msgIdRef  = useRef(0)
  const nextId    = () => String(++msgIdRef.current)
  const isFirst   = useRef(true)

  const invoices       = useFinanceStore(s => s.invoices)
  const todos          = useTodosStore(s => s.allTodos)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)
  const followUps      = useCrmStore(s => s.allFollowUps)
  const leads          = useLeadsStore(s => s.leads)
  const showToast      = useToastStore(s => s.show)

  const handleSend = useCallback(async (text: string) => {
    if (phase === 'idle') setPhase('active')

    const userMsg: CorraMessage = { id: nextId(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const apiKey = getApiKey()
      if (!apiKey) throw new MissingApiKeyError()

      const firstTurn = isFirst.current
      isFirst.current = false

      const ctx = buildCorraIntelligenceContext({
        todos, invoices, emails, deals, calendarEvents, accounts, followUps, leads,
      })
      const ctxWithFlag = firstTurn ? `[ERSTER_TURN]\n\n${ctx}` : ctx

      const history = [...messages, userMsg]

      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        apiKey,
        body: {
          model: getModel(),
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: `${CORRA_INTELLIGENCE_SYSTEM}\n\n--- AKTUELLE DATEN ---\n${ctxWithFlag}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: history.map(m => ({ role: m.role, content: m.text })),
        },
      })

      const block  = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
      const raw    = block?.text.trim() ?? '(keine Antwort)'
      const parsed = parseCorraResponse(raw)

      setMessages(prev => [...prev, {
        id: nextId(), role: 'assistant',
        text: parsed.text, widget: parsed.widget,
        actions: parsed.actions, focusCta: parsed.focusCta,
      }])
    } catch (e) {
      const errText = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Verbindungsfehler. Versuche es erneut.'
      log.warn('KORA error', { err: e })
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [phase, messages, todos, invoices, emails, deals, calendarEvents, accounts, followUps, leads])

  const handleExecuteAction = useCallback(async (action: CorraActionItem) => {
    try {
      if (action.type === 'invoice') {
        const inv = invoices.find(i => i.id === action.id)
        await upsertTodo({
          title: `Mahnung: ${action.label}`,
          actionType: 'send_reminder',
          sourceRef: action.id,
          customerId: inv?.accountId,
          bucket: 'today', priority: 'p1', checklist: [], tags: [],
        })
        showToast({ message: `Mahnung für ${action.label} angelegt.`, variant: 'success' })
      } else if (action.type === 'mail') {
        const mail = emails.find(e => e.id === action.id)
        await upsertTodo({
          title: `${action.label} beantworten`,
          actionType: 'reply_mail',
          sourceRef: action.id,
          customerId: mail?.customerId ?? undefined,
          bucket: 'today', priority: 'p1', checklist: [], tags: [],
        })
        showToast({ message: `Task für ${action.label} angelegt.`, variant: 'success' })
      } else if (action.type === 'followup') {
        const fu   = followUps.find(f => f.id === action.id)
        const lead = fu ? leads.find(l => l.id === fu.customerId) : undefined
        await upsertTodo({
          title: `Follow-up: ${lead?.name ?? action.label}`,
          actionType: 'followup',
          sourceRef: action.id,
          customerId: fu?.customerId,
          bucket: 'today', priority: 'p1', checklist: [], tags: [],
        })
        showToast({ message: `Follow-up für ${lead?.name ?? action.label} angelegt.`, variant: 'success' })
      } else if (action.type === 'todo') {
        await upsertTodo({
          title: action.label,
          bucket: 'today', priority: 'p1', checklist: [], tags: [],
        })
        showToast({ message: 'Task angelegt.', variant: 'success' })
      }
    } catch {
      showToast({ message: 'Aktion konnte nicht ausgeführt werden.', variant: 'error' })
    }
  }, [invoices, emails, followUps, leads, upsertTodo, showToast])

  const handleClear = useCallback(() => {
    setMessages([makeGreeting()])
    setPhase('idle')
    isFirst.current = true
  }, [])

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <CorraIdleView onSend={handleSend} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'active' && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <CorraChatPanel
              messages={messages}
              loading={loading}
              onSend={handleSend}
              onExecute={handleExecuteAction}
              onClear={handleClear}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
