// ─────────────────────────────────────────────────────────────────────────────
// PrivateShell — komplettes Layout fuer den "Privaten Raum".
// Ersetzt die normale App-Navigation. Sehr schmale eigene Sidebar links,
// warm-getoenter Hintergrund (statt kuehl-anthrazit), Inhalt rechts.
// ESC-Taste oder der Button unten links bringen zurueck in den Arbeitsmodus.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { useUiStore } from '@/store/ui.store'
import { PrivateSidebar } from './PrivateSidebar'

import { QuickCaptureRoute } from './QuickCaptureRoute'
import { PrivateTodosRoute } from './PrivateTodosRoute'
import { PrivateNotesRoute } from './PrivateNotesRoute'
import { PrivateJournalRoute } from './PrivateJournalRoute'
import { PrivateGoalsRoute } from './PrivateGoalsRoute'
import { WeeklyReviewRoute } from './WeeklyReviewRoute'
import { PrivateDocsRoute } from './PrivateDocsRoute'

export function PrivateShell() {
  const view         = useUiStore(s => s.privateView)
  const leavePrivate = useUiStore(s => s.leavePrivate)

  // ESC bringt zurueck in den Arbeitsmodus — schnelle Eskape, ueberall.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Nur reagieren wenn der Fokus nicht in einem Texteingabe-Element liegt
        const t = e.target
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
        if (t instanceof HTMLElement && t.isContentEditable) return
        leavePrivate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leavePrivate])

  return (
    <div className="private-shell" data-private-view={view}>
      <PrivateSidebar />
      <main className="private-main">
        {renderRoute(view)}
      </main>
    </div>
  )
}

function renderRoute(view: ReturnType<typeof useUiStore.getState>['privateView']) {
  switch (view) {
    case 'capture': return <QuickCaptureRoute />
    case 'todos':   return <PrivateTodosRoute />
    case 'notes':   return <PrivateNotesRoute />
    case 'journal': return <PrivateJournalRoute />
    case 'goals':   return <PrivateGoalsRoute />
    case 'review':  return <WeeklyReviewRoute />
    case 'docs':    return <PrivateDocsRoute />
  }
}

