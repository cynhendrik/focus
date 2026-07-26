import type { ProjectPhase } from '@/types/project.types'

export type HealthLevel = 'ok' | 'warn' | 'bad'

export interface ProjectSignal {
  kind: 'gate_pending'
  tone: 'warn' | 'bad'
  label: string
  detail: string
  phaseId: string
}

const GATE_WARN_DAYS = 5

function daysUntil(dateIso: string, today: Date): number {
  const d = new Date(`${dateIso}T00:00:00`)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Zeit-Ampel: aus überfälligen/bald fälligen pending-Gates abgeleitet.
 * Budget/Stimmung sind in dieser Etappe fix 'ok' (siehe Spec Etappe 1). */
export function projectHealthZeit(phases: ProjectPhase[], today: Date): HealthLevel {
  const pendingWithDate = phases.filter(p => p.gateState === 'pending' && p.gateDate)
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) < 0)) return 'bad'
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) <= GATE_WARN_DAYS)) return 'warn'
  return 'ok'
}

export function projectHealthBudget(): HealthLevel {
  return 'ok'
}

export function projectHealthStimmung(): HealthLevel {
  return 'ok'
}

/** Aktuell nur "Gate wartet"-Signale. Erweiterbar (Etappe 6: Rechnungssignale),
 * ohne dass Aufrufer (Filter, "Diese Woche wird entschieden"-Liste) sich ändern. */
export function projectSignals(phases: ProjectPhase[], today: Date): ProjectSignal[] {
  return phases
    .filter(p => p.gateState === 'pending')
    .map(p => {
      const overdue = p.gateDate ? daysUntil(p.gateDate, today) < 0 : false
      return {
        kind: 'gate_pending' as const,
        tone: overdue ? ('bad' as const) : ('warn' as const),
        label: `${p.gateName} wartet`,
        detail: p.gateDate ? `fällig ${formatDateDe(p.gateDate)}` : 'kein Termin gesetzt',
        phaseId: p.id,
      }
    })
}
