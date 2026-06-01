import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'
import type { FocusStackApi } from '@/hooks/useFocusStack'
import { FocusCardDefault } from './FocusCardDefault'
import { FocusCardReminder } from './FocusCardReminder'
import { FocusCardInvoice } from './FocusCardInvoice'
import { FocusQueueSidebar } from './FocusQueueSidebar'

interface Props {
  focusApi: FocusStackApi
}

export function FocusWorkspace({ focusApi }: Props) {
  const { current, currentIndex, total, stack, prev, skip, complete, postpone } = focusApi
  const setAppView = useUiStore(s => s.setAppView)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAppView('dashboard'); return }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')            { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight')           { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm')      { e.preventDefault(); postpone() }
      if (e.key === ' ' && current?.actionType !== 'send_reminder' && current?.actionType !== 'create_invoice') {
        e.preventDefault()
        complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, skip, postpone, complete, current?.actionType, setAppView])

  if (total === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 52 }}>🙌</div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 600,
          margin: 0,
        }}>
          Alles erledigt!
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
          Keine offenen Aufgaben für heute.
        </p>
      </div>
    )
  }

  if (!current) return null

  const isReminder = current.actionType === 'send_reminder'
  const isInvoice  = current.actionType === 'create_invoice'

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      padding: '40px 40px 40px 60px',
    }}>
      {/* Left: card */}
      <div style={{
        flex: 1,
        minWidth: 0,
        paddingRight: 32,
        overflowY: 'auto',
      }}>
        {isReminder ? (
          <FocusCardReminder
            todo={current}
            onComplete={complete}
            onSkip={skip}
            onPostpone={postpone}
          />
        ) : isInvoice ? (
          <FocusCardInvoice
            todo={current}
            onComplete={complete}
            onSkip={skip}
            onPostpone={postpone}
          />
        ) : (
          <FocusCardDefault
            todo={current}
            onComplete={complete}
            onSkip={skip}
            onPostpone={postpone}
          />
        )}
      </div>

      {/* Right: queue */}
      <FocusQueueSidebar stack={stack} currentIndex={currentIndex} />
    </div>
  )
}
