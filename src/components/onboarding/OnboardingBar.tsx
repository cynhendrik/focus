import { Check, X } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import {
  useOnboardingStore, ONBOARDING_STEPS, runOnboardingStep, selectAllDone, selectDoneCount,
} from '@/store/onboarding.store'

/**
 * Schmale, app-weite Leiste ganz oben mit den 5 Erste-Schritte-Pills.
 * Hakt automatisch ab (über den Store) und verschwindet bei 5/5 oder Ausblenden.
 */
export function OnboardingBar() {
  const done          = useOnboardingStore(s => s.done)
  const welcomeSeen   = useOnboardingStore(s => s.welcomeSeen)
  const companyDone   = useOnboardingStore(s => s.companyDone)
  const cardCollapsed = useOnboardingStore(s => s.cardCollapsed)
  const barDismissed  = useOnboardingStore(s => s.barDismissed)
  const dismissBar    = useOnboardingStore(s => s.dismissBar)
  const allDone       = useOnboardingStore(selectAllDone)
  const count         = useOnboardingStore(selectDoneCount)
  const setAppView    = useUiStore(s => s.setAppView)

  // Erst sichtbar, wenn die Pop-up-Karte eingeklappt ist.
  if (!welcomeSeen || !companyDone || !cardCollapsed || barDismissed || allDone) return null

  const firstOpen = ONBOARDING_STEPS.find(s => !done[s.id])?.id

  return (
    <div className="onboarding-bar">
      <span className="onboarding-bar__label">Erste Schritte</span>
      <div className="onboarding-bar__pills">
        {ONBOARDING_STEPS.map((step, i) => {
          const isDone = done[step.id]
          const isCur  = step.id === firstOpen
          return (
            <button
              key={step.id}
              type="button"
              className="onboarding-pill"
              data-done={isDone ? 'true' : 'false'}
              data-current={isCur ? 'true' : 'false'}
              onClick={() => runOnboardingStep(step, setAppView)}
              title={step.hint}
            >
              <span className="onboarding-pill__dot">
                {isDone ? <Check size={10} /> : i + 1}
              </span>
              <span className="onboarding-pill__label">{step.label}</span>
            </button>
          )
        })}
      </div>
      <div className="onboarding-bar__track" aria-hidden="true">
        <div className="onboarding-bar__fill" style={{ width: `${(count / ONBOARDING_STEPS.length) * 100}%` }} />
      </div>
      <span className="onboarding-bar__progress">{count} / {ONBOARDING_STEPS.length}</span>
      <button
        type="button"
        className="onboarding-bar__close"
        onClick={dismissBar}
        title="Ausblenden"
        aria-label="Ausblenden"
      >
        <X size={13} />
      </button>
    </div>
  )
}
