import { useState } from 'react'
import { X, Check, ChevronRight } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useOnboardingStore, ONBOARDING_STEPS, selectDoneCount } from '@/store/onboarding.store'
import { HELP_CONTENT } from '@/lib/help-content'
import type { AppView } from '@/store/ui.store'

/** Hilfe-Panel von rechts: Erste-Schritte + alle Funktionen nach Kategorie. */
export function HelpDrawer() {
  const helpOpen   = useUiStore(s => s.helpOpen)
  const setHelpOpen = useUiStore(s => s.setHelpOpen)
  const setAppView = useUiStore(s => s.setAppView)
  const done       = useOnboardingStore(s => s.done)
  const doneCount  = useOnboardingStore(selectDoneCount)
  const [openCat, setOpenCat] = useState<string | null>(null)

  if (!helpOpen) return null

  const go = (view: AppView) => { setAppView(view); setHelpOpen(false) }

  return (
    <div className="help-drawer__overlay" onClick={() => setHelpOpen(false)}>
      <aside className="help-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="help-drawer__head">
          <h2 className="help-drawer__title">Hilfe & Erste Schritte</h2>
          <button type="button" className="help-drawer__close" onClick={() => setHelpOpen(false)}
            title="Schließen" aria-label="Schließen">
            <X size={16} />
          </button>
        </header>

        <div className="help-drawer__body">
          <div className="help-drawer__group-label">Erste Schritte · {doneCount} / {ONBOARDING_STEPS.length}</div>
          {ONBOARDING_STEPS.map(step => (
            <button key={step.id} type="button" className="help-step" data-done={done[step.id] ? 'true' : 'false'}
              onClick={() => go(step.view)}>
              <span className="help-step__dot">{done[step.id] ? <Check size={11} /> : null}</span>
              <span>{step.label}</span>
            </button>
          ))}

          <div className="help-drawer__group-label" style={{ marginTop: 16 }}>Alle Funktionen</div>
          {HELP_CONTENT.map(cat => {
            const isOpen = openCat === cat.id
            return (
              <div key={cat.id} className="help-cat">
                <button type="button" className="help-cat__head"
                  onClick={() => setOpenCat(isOpen ? null : cat.id)}>
                  <span>{cat.label}</span>
                  <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                </button>
                {isOpen && (
                  <div className="help-cat__body">
                    {cat.entries.map(e => (
                      <div key={e.title} className="help-entry">
                        <div className="help-entry__title">{e.title}</div>
                        <div className="help-entry__body">{e.body}</div>
                        {e.action && (
                          <button type="button" className="help-entry__link" onClick={() => { e.action!(); setHelpOpen(false) }}>
                            {e.title} starten <ChevronRight size={12} />
                          </button>
                        )}
                        {!e.action && e.view && (
                          <button type="button" className="help-entry__link" onClick={() => go(e.view!)}>
                            {e.title} öffnen <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
