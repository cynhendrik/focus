import { Check, X, ArrowRight } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import {
  useOnboardingStore, ONBOARDING_STEPS, selectAllDone, selectDoneCount,
} from '@/store/onboarding.store'
import type { AppView } from '@/store/ui.store'

/**
 * Pop-up-Karte beim Erststart: die 5 Schritte als Kacheln, die man abarbeitet.
 * Klick auf eine Kachel (→ navigiert), das ✕, der Backdrop oder das Erledigen
 * des ersten Schritts klappt sie in die schmale OnboardingBar ein.
 */
export function OnboardingCard() {
  const done          = useOnboardingStore(s => s.done)
  const welcomeSeen   = useOnboardingStore(s => s.welcomeSeen)
  const companyDone   = useOnboardingStore(s => s.companyDone)
  const cardCollapsed = useOnboardingStore(s => s.cardCollapsed)
  const barDismissed  = useOnboardingStore(s => s.barDismissed)
  const collapseCard  = useOnboardingStore(s => s.collapseCard)
  const allDone       = useOnboardingStore(selectAllDone)
  const count         = useOnboardingStore(selectDoneCount)
  const setAppView    = useUiStore(s => s.setAppView)

  // Erst nach dem Unternehmensdaten-Schritt.
  if (!welcomeSeen || !companyDone || cardCollapsed || barDismissed || allDone) return null

  const go = (view: AppView) => { setAppView(view); collapseCard() }

  return (
    <div className="onboarding-card__overlay" onClick={collapseCard}>
      <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-card__head">
          <div>
            <h2 className="onboarding-card__title">Erste Schritte</h2>
            <p className="onboarding-card__sub">Arbeite die Schritte ab — sie haken sich automatisch ab.</p>
          </div>
          <span className="onboarding-card__progress">{count} / {ONBOARDING_STEPS.length}</span>
          <button
            type="button"
            className="onboarding-card__close"
            onClick={collapseCard}
            title="Einklappen"
            aria-label="Einklappen"
          >
            <X size={16} />
          </button>
        </div>

        <div className="onboarding-progress" aria-hidden="true">
          <div className="onboarding-progress__fill" style={{ width: `${(count / ONBOARDING_STEPS.length) * 100}%` }} />
        </div>

        <div className="onboarding-card__grid">
          {ONBOARDING_STEPS.map((step, i) => {
            const isDone = done[step.id]
            return (
              <button
                key={step.id}
                type="button"
                className="onboarding-tile"
                data-done={isDone ? 'true' : 'false'}
                onClick={() => go(step.view)}
              >
                <span className="onboarding-tile__dot">
                  {isDone ? <Check size={13} /> : i + 1}
                </span>
                <span className="onboarding-tile__body">
                  <span className="onboarding-tile__label">{step.label}</span>
                  <span className="onboarding-tile__hint">{step.hint}</span>
                </span>
                {!isDone && <ArrowRight size={14} className="onboarding-tile__arrow" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
