import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Sparkles, RefreshCw, ArrowRight, AlertTriangle, AlertCircle, Info, CheckCircle2, Settings } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useCalendarStore } from '@/store/calendar.store'
import { useFinanceStore } from '@/store/finance.store'
import { useDealsStore } from '@/store/deals.store'
import { useActivitiesStore } from '@/store/activities.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useNotebookStore } from '@/store/notebook.store'
import { useUiStore } from '@/store/ui.store'

import {
  generateBriefing,
  MissingApiKeyError,
  type CustomerBriefing,
  type BriefingHighlight,
  type BriefingSignal,
  type BriefingNextStep,
} from '@/lib/ai/briefing'
import { Skeleton } from '@/components/ui/Skeleton'

interface Props { customerId: string }

interface CacheEntry {
  briefing: CustomerBriefing
  generatedAt: number
}

// Briefings are kept in-memory per customer for the session. The user can
// "Aktualisieren" to force a re-generation; otherwise switching back to the
// customer re-shows the previously generated briefing instead of re-calling.
const briefingCache = new Map<string, CacheEntry>()

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; briefing: CustomerBriefing; generatedAt: number }
  | { kind: 'error'; error: string; missingKey?: boolean }

export function BriefingCard({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const setAppView = useUiStore(s => s.setAppView)

  const notes      = useNotebookStore(s => s.entries)
  const noteBooks  = useNotebookStore(s => s.books)
  const todos      = useTodosStore(s => s.allTodos)
  const events     = useCalendarStore(s => s.events)
  const invoices   = useFinanceStore(s => s.invoices)
  const deals      = useDealsStore(s => s.deals)
  const activities = useActivitiesStore(s => s.activities)
  const emails     = useMailStore(s => s.emails)
  const followUps  = useCrmStore(s => s.allFollowUps)

  const [state, setState] = useState<State>(() => {
    const cached = briefingCache.get(customerId)
    if (cached) return { kind: 'ready', briefing: cached.briefing, generatedAt: cached.generatedAt }
    return { kind: 'idle' }
  })

  // When customer changes, reset state from cache (if present) or idle.
  useEffect(() => {
    const cached = briefingCache.get(customerId)
    if (cached) setState({ kind: 'ready', briefing: cached.briefing, generatedAt: cached.generatedAt })
    else        setState({ kind: 'idle' })
  }, [customerId])

  const run = async () => {
    if (!customer) return
    setState({ kind: 'loading' })
    try {
      const briefing = await generateBriefing({
        customer,
        notes,
        noteBooks,
        todos,
        events,
        invoices,
        deals,
        activities,
        emails,
        followUps,
      })
      const generatedAt = Date.now()
      briefingCache.set(customerId, { briefing, generatedAt })
      setState({ kind: 'ready', briefing, generatedAt })
    } catch (err) {
      const e = err as { message?: string }
      if (err instanceof MissingApiKeyError) {
        setState({ kind: 'error', error: e.message ?? 'Kein API-Key', missingKey: true })
      } else {
        setState({ kind: 'error', error: e.message ?? String(err) })
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!customer) return null

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: '20px 24px',
        background: 'linear-gradient(135deg, oklch(60% 0.18 280 / 0.07), oklch(60% 0.16 235 / 0.04))',
        border: '1px solid oklch(60% 0.18 280 / 0.3)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: -50, right: -50,
        width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, oklch(60% 0.18 280 / 0.2), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <Header
        state={state}
        onRun={run}
      />

      <div style={{ position: 'relative', marginTop: 16 }}>
        <AnimatePresence mode="wait" initial={false}>
          {state.kind === 'idle'    && <Idle    key="idle"    onRun={run} />}
          {state.kind === 'loading' && <Loading key="loading" />}
          {state.kind === 'error'   && (
            <Error
              key="error"
              error={state.error}
              missingKey={state.missingKey}
              onOpenSettings={() => setAppView('settings')}
              onRetry={run}
            />
          )}
          {state.kind === 'ready' && (
            <Ready
              key="ready"
              briefing={state.briefing}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents

function Header({ state, onRun }: { state: State; onRun: () => void }) {
  const isReady   = state.kind === 'ready'
  const isLoading = state.kind === 'loading'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: 'oklch(60% 0.18 280)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 18px -8px oklch(60% 0.18 280 / 0.7)',
        }}>
          <Bot size={18} style={{ color: '#fff' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
              KI-Briefing
            </span>
            <Sparkles size={12} style={{ color: 'oklch(60% 0.18 280)' }} />
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 1 }}>
            {isReady && state.kind === 'ready' && `Generiert ${formatRel(state.generatedAt)}`}
            {isLoading && 'Analysiert Kundendaten…'}
            {state.kind === 'idle' && 'Klick zum Generieren'}
            {state.kind === 'error' && 'Fehler beim Generieren'}
          </span>
        </div>
      </div>
      {(isReady || state.kind === 'error') && (
        <button
          onClick={onRun}
          disabled={isLoading}
          className="btn-ghost"
          style={{ fontSize: 11.5, padding: '6px 12px' }}
        >
          <RefreshCw size={11} /> Aktualisieren
        </button>
      )}
    </div>
  )
}

function Idle({ onRun }: { onRun: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Claude analysiert die Notizen, Aufgaben, Mails, Deals und Rechnungen dieses Kunden und erstellt ein <strong style={{ color: 'var(--fg)' }}>kompaktes Briefing</strong>: was läuft, was kommt, was zu tun ist.
      </p>
      <button
        onClick={onRun}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 99,
          background: 'oklch(60% 0.18 280)', color: '#fff',
          fontSize: 13, fontWeight: 600,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 22px -8px oklch(60% 0.18 280 / 0.6)',
          transition: 'transform 150ms, box-shadow 220ms',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = '0 14px 32px -10px oklch(60% 0.18 280 / 0.7)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 8px 22px -8px oklch(60% 0.18 280 / 0.6)'
        }}
      >
        <Bot size={13} /> Brief mich
      </button>
    </motion.div>
  )
}

function Loading() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <Skeleton height={16} width="92%" />
      <Skeleton height={16} width="78%" />
      <Skeleton height={16} width="65%" />
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Skeleton height={48} width="100%" radius={12} />
        <Skeleton height={48} width="100%" radius={12} />
        <Skeleton height={48} width="100%" radius={12} />
      </div>
      <Skeleton height={14} width="40%" style={{ marginTop: 4 }} />
      <Skeleton height={32} width="100%" radius={10} />
      <Skeleton height={32} width="90%"  radius={10} />
    </motion.div>
  )
}

function Error({
  error, missingKey, onOpenSettings, onRetry,
}: {
  error: string; missingKey?: boolean; onOpenSettings: () => void; onRetry: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        padding: 14, borderRadius: 12,
        background: 'oklch(72% 0.18 25 / 0.08)',
        border: '1px solid oklch(72% 0.18 25 / 0.3)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}
    >
      <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>{error}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {missingKey && (
            <button onClick={onOpenSettings} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              <Settings size={12} /> Zu Einstellungen
            </button>
          )}
          <button onClick={onRetry} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
            <RefreshCw size={12} /> Erneut versuchen
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function Ready({ briefing }: { briefing: CustomerBriefing }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Headline */}
      {briefing.headline && (
        <p style={{
          fontSize: 14.5, lineHeight: 1.6, color: 'var(--fg)',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.005em',
          margin: 0,
        }}>
          {briefing.headline}
        </p>
      )}

      {/* Highlights */}
      {briefing.highlights.length > 0 && (
        <Section title="Highlights">
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10,
          }}>
            {briefing.highlights.map((h, i) => (
              <HighlightCard key={i} highlight={h} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* Signals */}
      {briefing.signals.length > 0 && (
        <Section title="Signale">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {briefing.signals.map((s, i) => (
              <SignalRow key={i} signal={s} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* Next steps */}
      {briefing.nextSteps.length > 0 && (
        <Section title="Nächste Schritte">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {briefing.nextSteps.map((s, i) => (
              <NextStepRow key={i} step={s} index={i} />
            ))}
          </div>
        </Section>
      )}
    </motion.div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="card-label">{title}</span>
      {children}
    </div>
  )
}

const TONE_STYLES: Record<BriefingHighlight['tone'], { bg: string; border: string; text: string }> = {
  info: { bg: 'oklch(78% 0.13 235 / 0.10)', border: 'oklch(78% 0.13 235 / 0.30)', text: 'var(--info)' },
  ok:   { bg: 'oklch(82% 0.18 155 / 0.10)', border: 'oklch(82% 0.18 155 / 0.30)', text: 'var(--ok)' },
  warn: { bg: 'oklch(82% 0.16 70 / 0.10)',  border: 'oklch(82% 0.16 70 / 0.30)',  text: 'var(--warn)' },
  bad:  { bg: 'oklch(72% 0.18 25 / 0.10)',  border: 'oklch(72% 0.18 25 / 0.30)',  text: 'var(--danger)' },
}

function HighlightCard({ highlight, index }: { highlight: BriefingHighlight; index: number }) {
  const tone = TONE_STYLES[highlight.tone] ?? TONE_STYLES.info
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      style={{
        padding: '12px 14px', borderRadius: 12,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <span style={{
        fontSize: 11.5, fontWeight: 700, color: tone.text,
        letterSpacing: '0.01em', textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
      }}>
        {highlight.title}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
        {highlight.text}
      </span>
    </motion.div>
  )
}

const SEVERITY_ICONS: Record<BriefingSignal['severity'], { icon: typeof Info; color: string; bg: string }> = {
  info:    { icon: Info,          color: 'var(--info)',   bg: 'oklch(78% 0.13 235 / 0.10)' },
  warning: { icon: AlertTriangle, color: 'var(--warn)',   bg: 'oklch(82% 0.16 70 / 0.10)' },
  alert:   { icon: AlertCircle,   color: 'var(--danger)', bg: 'oklch(72% 0.18 25 / 0.10)' },
}

function SignalRow({ signal, index }: { signal: BriefingSignal; index: number }) {
  const meta = SEVERITY_ICONS[signal.severity] ?? SEVERITY_ICONS.info
  const Icon = meta.icon
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 10,
        background: meta.bg,
      }}
    >
      <Icon size={14} style={{ color: meta.color, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5 }}>{signal.text}</span>
    </motion.div>
  )
}

function NextStepRow({ step, index }: { step: BriefingNextStep; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 14px', borderRadius: 12,
        background: 'oklch(50% 0 0 / 0.04)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        background: 'oklch(60% 0.18 280 / 0.15)',
        border: '1px solid oklch(60% 0.18 280 / 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 2,
      }}>
        <ArrowRight size={11} style={{ color: 'oklch(60% 0.18 280)' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }}>
          {step.action}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', lineHeight: 1.45 }}>
          {step.reason}
        </span>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers

function formatRel(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'gerade eben'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `vor ${mins} Min.`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `vor ${hours} Std.`
  return new Date(timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

// Re-export icon to silence unused warning if Header uses it
export { CheckCircle2 }
