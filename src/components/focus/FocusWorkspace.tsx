import { useEffect, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useTodosStore } from '@/store/todos.store'
import type { FocusStackApi } from '@/hooks/useFocusStack'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusCardInvoice } from './FocusCardInvoice'
import { FocusCardFollowUp } from './FocusCardFollowUp'
import { FocusQueueSidebar } from './FocusQueueSidebar'
import { FocusCorraChat } from './FocusCorraChat'
import { Sparkles } from 'lucide-react'

interface Props { focusApi: FocusStackApi }

function ProgressDots({ current, total }: { current: number; total: number }) {
  const dots = Math.min(total, 7)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: dots }, (_, i) => (
        <div key={i} style={{
          width:  i === current ? 8 : 5,
          height: i === current ? 8 : 5,
          borderRadius: 99,
          background: i === current
            ? 'var(--accent)'
            : i < current ? 'oklch(50% 0 0 / 0.35)' : 'oklch(50% 0 0 / 0.2)',
          boxShadow: i === current ? '0 0 5px var(--accent)' : undefined,
          transition: 'all 260ms',
          flexShrink: 0,
        }} />
      ))}
      {total > 7 && (
        <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 2 }}>
          +{total - 7}
        </span>
      )}
    </div>
  )
}

export function FocusWorkspace({ focusApi }: Props) {
  const { current, currentIndex, total, stack, prev, skip, complete, postpone } = focusApi
  const setAppView = useUiStore(s => s.setAppView)
  const allTodos   = useTodosStore(s => s.allTodos)
  const [showCorra, setShowCorra] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAppView('dashboard'); return }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); postpone() }
      if (e.key === ' ' &&
          current?.actionType !== 'send_reminder' &&
          current?.actionType !== 'create_invoice' &&
          current?.actionType !== 'followup' &&
          current?.actionType !== 'reply_mail') {
        e.preventDefault(); complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, skip, postpone, complete, current?.actionType, setAppView])

  // ── Top bar ──────────────────────────────────────────────────────────────
  const TopBar = (
    <div style={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 20,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
    }}>
      {/* Left brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Focus</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.03em' }}>
          abarbeiten, ohne Ablenkung
        </span>
      </div>

      {/* Center: dots + counter + progress bar */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <ProgressDots current={currentIndex} total={total} />
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

      {/* Right: CORRA + close */}
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

  // ── All done → show upcoming ─────────────────────────────────────────────
  if (total === 0) {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = allTodos
      .filter(t =>
        t.status !== 'done' &&
        t.scheduledAt &&
        t.scheduledAt.slice(0, 10) > today,
      )
      .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
      .slice(0, 12)

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {TopBar}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 48, padding: '40px 60px',
        }}>
          {/* Done state */}
          <div style={{ flex: 1, maxWidth: 480, textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🙌</div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
              letterSpacing: '-0.02em', margin: '0 0 10px',
            }}>
              Alles erledigt!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 24px' }}>
              Keine offenen Aktionen für heute.
            </p>
            <button
              type="button"
              onClick={() => setAppView('dashboard')}
              style={{
                padding: '10px 24px', borderRadius: 99,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
              }}
            >
              Zurück zum Dashboard
            </button>
          </div>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div style={{
              width: 300, flexShrink: 0,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 16, overflow: 'hidden',
            }}>
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Demnächst</span>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)',
                  background: 'var(--surface-3)', padding: '2px 7px', borderRadius: 99,
                }}>
                  {upcoming.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcoming.map((t, i) => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 18px',
                    borderBottom: i < upcoming.length - 1 ? '1px solid oklch(50% 0 0 / 0.06)' : undefined,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, color: 'var(--fg)', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.title}
                      </div>
                      {t.scheduledAt && (
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>
                          {new Date(t.scheduledAt).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!current) return null

  const isReminder = current.actionType === 'send_reminder'
  const isInvoice  = current.actionType === 'create_invoice'
  const isFollowup = current.actionType === 'followup' || current.actionType === 'reply_mail'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {TopBar}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Card area */}
        <div style={{
          flex: 1, minWidth: 0,
          overflowY: 'auto',
          padding: '36px 48px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: 680 }}>
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

        {/* Right panel: CORRA chat OR queue sidebar */}
        {showCorra ? (
          <FocusCorraChat
            stack={stack}
            currentIndex={currentIndex}
            onClose={() => setShowCorra(false)}
          />
        ) : (
          <FocusQueueSidebar stack={stack} currentIndex={currentIndex} />
        )}
      </div>
    </div>
  )
}
