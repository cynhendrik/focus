// src/routes/CorraRoute.tsx
import { useState, useCallback, useRef, useEffect } from 'react'
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
import { useWorkspaceStore } from '@/store/workspace.store'
import { useUiStore }       from '@/store/ui.store'
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

// Chat läuft auf Claude Haiku über den eingebetteten Key (Tester brauchen keinen eigenen).
const CHAT_MODEL = 'claude-haiku-4-5'

type Phase = 'idle' | 'active'

const makeGreeting = (): CorraMessage => ({
  id: '0', role: 'assistant',
  text: 'Hey — ich bin KORA. Was möchtest du wissen?',
})

// Chat-Verlauf bleibt über App-Neustarts / Navigation erhalten.
const CHAT_STORE = 'cultera:kora-chat:v1'

type ActionStatusMap = Record<string, 'done' | 'dismissed'>

function loadChat(): { messages: CorraMessage[]; phase: Phase; actionStatus: ActionStatusMap } | null {
  try {
    const raw = localStorage.getItem(CHAT_STORE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { messages?: unknown; phase?: unknown; actionStatus?: unknown }
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) return null
    return {
      messages: parsed.messages as CorraMessage[],
      phase: parsed.phase === 'active' ? 'active' : 'idle',
      actionStatus: (parsed.actionStatus && typeof parsed.actionStatus === 'object')
        ? parsed.actionStatus as ActionStatusMap
        : {},
    }
  } catch {
    return null
  }
}

export function CorraRoute() {
  const [boot] = useState(loadChat)   // einmalig aus localStorage geladen
  const [phase, setPhase]       = useState<Phase>(boot?.phase ?? 'idle')
  const [messages, setMessages] = useState<CorraMessage[]>(boot?.messages ?? [makeGreeting()])
  const [loading, setLoading]   = useState(false)
  const [fuChoice, setFuChoice] = useState<CorraActionItem | null>(null)
  const [invChoice, setInvChoice] = useState<CorraActionItem | null>(null)
  const [actionStatus, setActionStatus] = useState<ActionStatusMap>(boot?.actionStatus ?? {})

  const markActionDone = useCallback((id: string) => {
    setActionStatus(s => ({ ...s, [id]: 'done' }))
  }, [])
  const dismissAction = useCallback((id: string) => {
    setActionStatus(s => ({ ...s, [id]: 'dismissed' }))
  }, [])

  const msgIdRef  = useRef(boot ? boot.messages.reduce((mx, m) => Math.max(mx, Number(m.id) || 0), 0) : 0)
  const nextId    = () => String(++msgIdRef.current)
  // Wiederhergestellte Unterhaltung → kein erneuter Erst-Turn-Triage.
  const isFirst   = useRef(boot ? !boot.messages.some(m => m.role === 'user') : true)

  // Verlauf bei jeder Änderung persistieren.
  useEffect(() => {
    try { localStorage.setItem(CHAT_STORE, JSON.stringify({ messages, phase, actionStatus })) } catch { /* ignore */ }
  }, [messages, phase, actionStatus])

  const invoices       = useFinanceStore(s => s.invoices)
  const updateInvoiceStatus = useFinanceStore(s => s.updateInvoiceStatus)
  const setAppView     = useUiStore(s => s.setAppView)
  const todos          = useTodosStore(s => s.allTodos)
  const upsertTodo     = useTodosStore(s => s.upsert)
  const completeTodo   = useTodosStore(s => s.complete)
  const emails         = useMailStore(s => s.emails)
  const selectEmail    = useMailStore(s => s.selectEmail)
  const deals          = useDealsStore(s => s.deals)
  const calendarEvents = useCalendarStore(s => s.events)
  const accounts       = useAccountsStore(s => s.accounts)
  const followUps      = useCrmStore(s => s.allFollowUps)
  const upsertFollowUp = useCrmStore(s => s.upsert)
  const loadAllFollowUps = useCrmStore(s => s.loadAll)
  const leads          = useLeadsStore(s => s.leads)
  const showToast      = useToastStore(s => s.show)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  const handleSend = useCallback(async (text: string) => {
    if (phase === 'idle') setPhase('active')

    const userMsg: CorraMessage = { id: nextId(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const firstTurn = isFirst.current
      isFirst.current = false

      const ctx = buildCorraIntelligenceContext({
        todos, invoices, emails, deals, calendarEvents, accounts, followUps, leads,
      })
      const ctxWithFlag = firstTurn ? `[ERSTER_TURN]\n\n${ctx}` : ctx

      const history = [...messages, userMsg]

      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        // Leerer Key → Rust nutzt den eingebetteten ANTHROPIC_API_KEY (Tester-Key).
        apiKey: '',
        body: {
          model: CHAT_MODEL,
          max_tokens: 800,
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
      log.warn('KORA error', { err: e })
      const errText = typeof e === 'string' && e ? e : 'Verbindungsfehler. Versuche es erneut.'
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', text: errText }])
    } finally {
      setLoading(false)
    }
  }, [phase, messages, todos, invoices, emails, deals, calendarEvents, accounts, followUps, leads])

  const handleExecuteAction = useCallback(async (action: CorraActionItem) => {
    // Follow-up & Rechnung: erst Auswahl. Mail: direkt zur Mail springen & öffnen.
    if (action.type === 'followup') { setFuChoice(action); return }
    if (action.type === 'invoice')  { setInvChoice(action); return }
    if (action.type === 'mail') {
      const mail = emails.find(e => e.id === action.id)
      setAppView('mail')
      if (mail) void selectEmail(mail)
      return
    }
    try {
      if (action.type === 'todo') {
        const existing = todos.find(t => t.id === action.id)
        if (existing) {
          await completeTodo(action.id)
          showToast({ message: `„${existing.title}" als erledigt markiert.`, variant: 'success' })
        } else {
          // Fallback: KORA schlug ein neues Todo vor (keine bestehende ID)
          await upsertTodo({
            title: action.label,
            bucket: 'today', priority: 'p1', checklist: [], tags: [],
          })
          showToast({ message: 'Task angelegt.', variant: 'success' })
        }
      }
      markActionDone(action.id)
    } catch {
      showToast({ message: 'Aktion konnte nicht ausgeführt werden.', variant: 'error' })
    }
  }, [emails, todos, upsertTodo, completeTodo, showToast, markActionDone, setAppView, selectEmail])

  // Rechnungs-Auswahl: Mahnwesen öffnen (Vorschau & senden) oder als bezahlt markieren.
  const applyInvoiceChoice = useCallback(async (mode: 'mahnwesen' | 'paid') => {
    const action = invChoice
    setInvChoice(null)
    if (!action) return
    if (mode === 'mahnwesen') {
      setAppView('invoices')
      showToast({ message: 'Mahnwesen geöffnet — dort Vorschau & senden.', variant: 'success' })
      return
    }
    try {
      await updateInvoiceStatus(action.id, 'paid')
      markActionDone(action.id)
      showToast({ message: `Rechnung ${action.label} als bezahlt markiert.`, variant: 'success' })
    } catch {
      showToast({ message: 'Rechnung konnte nicht aktualisiert werden.', variant: 'error' })
    }
  }, [invChoice, setAppView, updateInvoiceStatus, showToast, markActionDone])

  // Follow-up-Auswahl ausführen: als erledigt markieren oder neu in 3 Tagen.
  const applyFollowupChoice = useCallback(async (mode: 'done' | 'renew') => {
    const action = fuChoice
    setFuChoice(null)
    if (!action) return
    const fu = followUps.find(f => f.id === action.id)
    if (!fu) {
      showToast({ message: 'Follow-up nicht gefunden.', variant: 'error' })
      return
    }
    const name = leads.find(l => l.id === fu.customerId)?.name ?? fu.title ?? action.label
    try {
      if (mode === 'done') {
        await upsertFollowUp({
          id: fu.id, customerId: fu.customerId, title: fu.title,
          dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority,
        })
        showToast({ message: `Follow-up für ${name} als erledigt markiert.`, variant: 'success' })
      } else {
        const due = new Date(); due.setDate(due.getDate() + 3)
        // Lokales Datum (YYYY-MM-DD) wie der Rest der App (toLocaleDateString('sv')).
        await upsertFollowUp({
          id: fu.id, customerId: fu.customerId, title: fu.title,
          dueDate: due.toLocaleDateString('sv'), status: 'offen', priority: fu.priority,
        })
        showToast({ message: `Neuer Follow-up für ${name} in 3 Tagen.`, variant: 'success' })
      }
      if (activeWorkspaceId) await loadAllFollowUps(activeWorkspaceId)
      markActionDone(action.id)
    } catch {
      showToast({ message: 'Follow-up konnte nicht aktualisiert werden.', variant: 'error' })
    }
  }, [fuChoice, followUps, leads, upsertFollowUp, loadAllFollowUps, activeWorkspaceId, showToast, markActionDone])

  const handleClear = useCallback(() => {
    setMessages([makeGreeting()])
    setPhase('idle')
    setActionStatus({})
    isFirst.current = true
    try { localStorage.removeItem(CHAT_STORE) } catch { /* ignore */ }
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
              onDismiss={dismissAction}
              actionStatus={actionStatus}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {fuChoice && (
        <div
          onClick={() => setFuChoice(null)}
          style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-1, #111)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 22, width: 360, maxWidth: '90%',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
              Follow-up: {fuChoice.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>
              Was möchtest du tun?
            </div>
            <button
              type="button"
              onClick={() => applyFollowupChoice('renew')}
              style={{
                padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                fontSize: 13, fontWeight: 600, textAlign: 'left',
              }}
            >
              Neuer Follow-up (in 3 Tagen)
            </button>
            <button
              type="button"
              onClick={() => applyFollowupChoice('done')}
              style={{
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                background: 'transparent', color: 'var(--fg)',
                border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, textAlign: 'left',
              }}
            >
              Als erledigt markieren
            </button>
            <button
              type="button"
              onClick={() => setFuChoice(null)}
              style={{
                padding: '6px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--fg-dim)', fontSize: 12,
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {invChoice && (
        <div
          onClick={() => setInvChoice(null)}
          style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-1, #111)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 22, width: 360, maxWidth: '90%',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
              Rechnung: {invChoice.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>
              Was möchtest du tun?
            </div>
            <button
              type="button"
              onClick={() => applyInvoiceChoice('mahnwesen')}
              style={{
                padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                fontSize: 13, fontWeight: 600, textAlign: 'left',
              }}
            >
              Mahnwesen öffnen (Vorschau &amp; senden)
            </button>
            <button
              type="button"
              onClick={() => applyInvoiceChoice('paid')}
              style={{
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                background: 'transparent', color: 'var(--fg)',
                border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, textAlign: 'left',
              }}
            >
              Als bezahlt markieren
            </button>
            <button
              type="button"
              onClick={() => setInvChoice(null)}
              style={{
                padding: '6px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--fg-dim)', fontSize: 12,
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
