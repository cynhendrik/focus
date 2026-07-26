import type { ProjectPhase } from '@/types/project.types'

export type HealthLevel = 'ok' | 'warn' | 'bad' | 'unknown'

export interface ProjectSignal {
  kind: 'gate_pending'
  tone: 'warn' | 'bad'
  label: string
  detail: string
  phaseId: string
}

export interface NextMove {
  kind: 'gate_pending' | 'ruhe'
  tone: 'bad' | 'warn' | 'ok'
  title: string
  why: string
  phaseId: string | null
}

export const GATE_COLOR: Record<ProjectPhase['gateState'], string> = {
  approved: 'var(--ok)', pending: 'var(--warn)', open: 'var(--border-strong)',
}

const GATE_WARN_DAYS = 5

function daysUntil(dateIso: string, today: Date): number {
  const d = new Date(`${dateIso}T00:00:00`)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

export function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Zeit-Ampel: aus überfälligen/bald fälligen pending-Gates abgeleitet.
 * Budget/Stimmung sind in dieser Etappe fix 'unknown' -- es gibt noch keine
 * Zeiterfassung (Budget) bzw. kein Moodboard (Stimmung), also keine echte
 * Datengrundlage. Ein fixes 'ok' waere eine Value-Luege (grüner Punkt fuer
 * "alles im Rahmen", obwohl schlicht nichts gemessen wird). */
export function projectHealthZeit(phases: ProjectPhase[], today: Date): HealthLevel {
  const pendingWithDate = phases.filter(p => p.gateState === 'pending' && p.gateDate)
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) < 0)) return 'bad'
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) <= GATE_WARN_DAYS)) return 'warn'
  return 'ok'
}

export function projectHealthBudget(): HealthLevel {
  return 'unknown'
}

export function projectHealthStimmung(): HealthLevel {
  return 'unknown'
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

/** "Nächster Zug" fürs Cockpit: das dringendste pending Gate (überfällig oder
 * am nächsten fällig zuerst, ohne Termin zuletzt), sonst eine neutrale
 * Ruhe-Meldung. Nur Gate-basiert -- Rechnungs-/Scope-/Moodboard-Zweige
 * kommen erst mit späteren Etappen dazu. */
export function nextMove(phases: ProjectPhase[], today: Date): NextMove {
  const pending = phases
    .filter(p => p.gateState === 'pending')
    .map(p => ({ p, days: p.gateDate ? daysUntil(p.gateDate, today) : Infinity }))
    .sort((a, b) => a.days - b.days)

  if (pending.length > 0) {
    const { p, days } = pending[0]
    const overdue = days < 0
    return {
      kind: 'gate_pending',
      tone: overdue ? 'bad' : 'warn',
      title: `${p.gateName} einholen` + (p.gateDate ? ` — ${formatDateDe(p.gateDate)}` : ''),
      why: `Phase „${p.name}" wartet auf Freigabe. Ohne sie startet die nächste Phase nicht.`,
      phaseId: p.id,
    }
  }

  return {
    kind: 'ruhe',
    tone: 'ok',
    title: 'Nichts brennt. Nächster Meilenstein läuft planmäßig.',
    why: 'Kein offenes Gate wartet auf Freigabe.',
    phaseId: null,
  }
}
