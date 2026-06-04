import { useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore }  from '@/store/finance.store'
import { useTodosStore }    from '@/store/todos.store'
import { useMailStore }     from '@/store/mail.store'
import { useDealsStore }    from '@/store/deals.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useUiStore }       from '@/store/ui.store'
import { useToastStore }    from '@/store/toast.store'
import { getApiKey, getModel, MissingApiKeyError } from '@/lib/ai/briefing'
import {
  buildCorraIntelligenceContext,
  parseCorraResponse,
  CORRA_INTELLIGENCE_SYSTEM,
} from '@/lib/ai/corra-intelligence'
import type { CorraMessage, CorraActionItem, CorraWidgetType } from '@/lib/ai/corra-intelligence'
import { CorraIdleView }   from '@/components/corra/CorraIdleView'
import { CorraChatPanel }  from '@/components/corra/CorraChatPanel'
import { CorraWidget }     from '@/components/corra/CorraWidget'
import { log } from '@/lib/logger'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

type Phase = 'idle' | 'active'

const makeGreeting = (): CorraMessage => ({
  id: '0',
  role: 'assistant',
  text: 'Hey — ich bin CORRA. Was möchtest du wissen?',
})

export function CorraRoute() {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [messages, setMessages] = useState<CorraMessage[]>(() => [makeGreeting()])
  const [loading, setLoading]   = useState(false)

  const msgIdRef = useRef(0)
  const nextId = () => String(++msgIdRef.current)

  const invoices       = useFinanceStore(s => s.invoices)
  const todos          = useTodosStore(s => s.allTodos)
  const emails         = useMailStore(s => s.emails)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const setAppView     = useUiStore(s => s.setAppView)
  const showToast      = useToastStore(s => s.show)

  // Current widget = last assistant message with a widget field
  const currentWidget: CorraWidgetType | undefined = [...messages]
    .reverse()
    .find(m => m.role === 'assistant' && m.widget)?.widget

  const handleSend = useCallback(async (text: string) => {
    if (phase === 'idle') setPhase('active')

    const userMsg: CorraMessage = { id: nextId(), role: 'user', text }
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

      const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
      const raw = block?.text.trim() ?? '(keine Antwort)'
      const parsed = parseCorraResponse(raw)

      setMessages(prev => [...prev, {
        id: nextId(), role: 'assistant',
        text: parsed.text,
        widget: parsed.widget,
        actions: parsed.actions,
        focusCta: parsed.focusCta,
      }])
    } catch (e) {
      const errText = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Verbindungsfehler. Versuche es erneut.'
      log.warn('CORRA error', { err: e })
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [phase, messages, todos, invoices, emails, deals, calendarEvents, accounts])

  const handleFocusActions = useCallback(async (actions: CorraActionItem[]) => {
    try {
      for (const action of actions) {
        if (action.type === 'invoice') {
          const inv = invoices.find(i => i.id === action.id)
          await upsertTodo({
            title: `Mahnung: ${action.label}`, actionType: 'send_reminder',
            sourceRef: action.id, customerId: inv?.accountId,
            bucket: 'today', priority: 'p1', checklist: [], tags: [],
          })
        } else if (action.type === 'mail') {
          const mail = emails.find(e => e.id === action.id)
          await upsertTodo({
            title: `${action.label} beantworten`, actionType: 'reply_mail',
            sourceRef: action.id, customerId: mail?.customerId ?? undefined,
            bucket: 'today', priority: 'p1', checklist: [], tags: [],
          })
        }
      }
      setAppView('focus')
    } catch {
      showToast({ message: 'Fehler beim Anlegen der Fokus-Aufgaben.', variant: 'error' })
    }
  }, [upsertTodo, setAppView, showToast, invoices, emails])

  const handleClear = useCallback(() => {
    setMessages([makeGreeting()])
    setPhase('idle')
  }, [])

  return (
    <div style={{
      position: 'relative', height: '100%', overflow: 'hidden',
      background: '#080808',
    }}>
      {/* Idle phase */}
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <CorraIdleView onSend={handleSend} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active phase — widget center */}
      <AnimatePresence>
        {phase === 'active' && (
          <motion.div
            key="active-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {/* Subtle dot grid in active state */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'radial-gradient(circle, rgba(163,230,53,0.04) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }} />

            <AnimatePresence mode="wait">
              {currentWidget ? (
                <motion.div
                  key={currentWidget}
                  initial={{ opacity: 0, scale: 0.94, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <CorraWidget type={currentWidget} />
                </motion.div>
              ) : loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite',
                    boxShadow: '0 0 12px rgba(163,230,53,0.5)',
                  }} />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div style={{
                    fontSize: 9, color: 'rgba(163,230,53,0.3)',
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.15em',
                  }}>
                    CORRA INTELLIGENCE
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel — slides in when active */}
      <AnimatePresence>
        {phase === 'active' && (
          <CorraChatPanel
            key="chat-panel"
            messages={messages}
            loading={loading}
            onSend={handleSend}
            onFocusActions={handleFocusActions}
            onClear={handleClear}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }`}</style>
    </div>
  )
}
