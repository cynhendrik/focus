import { useEffect, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useTodosStore } from '@/store/todos.store'
import { useFocusStack } from '@/hooks/useFocusStack'
import { FocusCustomerPanel } from './FocusCustomerPanel'
import { FocusBatchSidebar } from './FocusBatchSidebar'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusCardInvoice } from './FocusCardInvoice'
import { FocusCardFollowUp } from './FocusCardFollowUp'
import { FocusCorraChat } from './FocusCorraChat'
import { FocusCockpitBar } from './FocusCockpitBar'
import { Sparkles } from 'lucide-react'

interface Props {
  customerId: string | undefined
  onBack: () => void
}

export function FocusSessionView({ customerId, onBack }: Props) {
  const focusApi    = useFocusStack(customerId)
  const { current, currentIndex, total, stack, prev, skip, complete, postpone, completedToday } = focusApi
  const allTodos    = useTodosStore(s => s.allTodos)
  const accounts    = useAccountsStore(s => s.accounts)
  const setAppView  = useUiStore(s => s.setAppView)
  const [showCorra, setShowCorra] = useState(false)

  const account = customerId ? accounts.find(a => a.id === customerId) : undefined
  const customerName = account?.name ?? (customerId ? 'Kunden-Session' : 'Allgemein')

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { onBack(); return }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); postpone() }
      if (
        e.key === ' ' &&
        current?.actionType !== 'send_reminder' &&
        current?.actionType !== 'create_invoice' &&
        current?.actionType !== 'followup' &&
        current?.actionType !== 'reply_mail'
      ) {
        e.preventDefault(); complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, skip, postpone, complete, current?.actionType, onBack])

  // Auto-return to customer select when all tasks done
  useEffect(() => {
    if (stack.length === 0) {
      const timer = setTimeout(onBack, 1800)
      return () => clearTimeout(timer)
    }
  }, [stack.length, onBack])

  // Progress dots in top bar
  const dots = Math.min(total, 5)
  const ProgressDots = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: dots }, (_, i) => (
        <div key={i} style={{
          width:  i === currentIndex ? 8 : 5,
          height: i === currentIndex ? 8 : 5,
          borderRadius: 99,
          background: i === currentIndex
            ? 'var(--accent)'
            : i < currentIndex ? 'oklch(50% 0 0 / 0.35)' : 'oklch(50% 0 0 / 0.2)',
          boxShadow: i === currentIndex ? '0 0 5px var(--accent)' : undefined,
          transition: 'all 260ms',
          flexShrink: 0,
        }} />
      ))}
      {total > 5 && (
        <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 2 }}>
          +{total - 5}
        </span>
      )}
    </div>
  )

  const TopBar = (
    <div style={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 20,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Focus</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.03em' }}>
          {customerName} · Session
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        {ProgressDots}
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', flexShrink: 0 }}>
          {total > 0 ? `${currentIndex + 1} / ${total}` : '— / —'}
        </span>
        <div style={{ flex: 1, height: 3, borderRadius: 99, background: 'oklch(50% 0 0 / 0.15)', overflow: 'hidden' }}>
          <div style={{
            width: `${total > 0 ? ((currentIndex + 1) / total) * 100 : 0}%`,
            height: '100%', background: 'var(--accent)', borderRadius: 99,
            transition: 'width 300ms ease',
          }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setShowCorra(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid var(--border)',
            background: showCorra ? 'var(--accent-soft)' : 'transparent',
            color: showCorra ? 'var(--accent)' : 'var(--fg-muted)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            transition: 'all 160ms',
          }}
        >
          <Sparkles size={12} />
          CORRA
        </button>
        <button
          type="button"
          onClick={() => setAppView('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Schließen
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)',
            background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3,
          }}>ESC</span>
        </button>
      </div>
    </div>
  )

  // All done state
  if (stack.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {TopBar}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 52 }}>🙌</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
            letterSpacing: '-0.02em', margin: 0,
          }}>
            {customerName} — alles erledigt!
          </h2>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>Geht zurück zur Kunden-Auswahl…</p>
        </div>
      </div>
    )
  }

  if (!current) return null

  const isReminder = current.actionType === 'send_reminder'
  const isInvoice  = current.actionType === 'create_invoice'
  const isFollowup = current.actionType === 'followup' || current.actionType === 'reply_mail'

  // today's total completed across all customers
  const todayStr = new Date().toISOString().slice(0, 10)
  const totalDoneToday = allTodos.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === todayStr).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {TopBar}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: customer panel */}
        <FocusCustomerPanel
          customerId={customerId}
          customerName={customerName}
          completedCount={completedToday}
          totalCount={total + completedToday}
          onBack={onBack}
        />

        {/* Center: active card OR CORRA chat */}
        {showCorra ? (
          <FocusCorraChat
            stack={stack}
            currentIndex={currentIndex}
            onClose={() => setShowCorra(false)}
          />
        ) : (
          <div style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Cards scrollable area */}
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '32px 40px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            }}>
              <div style={{ width: '100%', maxWidth: 580 }}>
                {isReminder ? (
                  <FocusCardReminder todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                ) : isInvoice ? (
                  <FocusCardInvoice  todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                ) : isFollowup ? (
                  <FocusCardFollowUp todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                ) : (
                  <FocusCardDefault  todo={current} onComplete={complete} onSkip={skip} onPostpone={postpone} />
                )}
              </div>
            </div>

            {/* Cockpit Bar — persistent at bottom */}
            <FocusCockpitBar
              customerId={customerId}
              customerName={customerName}
            />
          </div>
        )}

        {/* Right: batch sidebar */}
        <FocusBatchSidebar
          stack={stack}
          currentIndex={currentIndex}
          completedToday={completedToday}
          totalToday={totalDoneToday}
        />
      </div>
    </div>
  )
}
