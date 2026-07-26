import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectCockpit } from './ProjectCockpit'
import type { ProjectPhase } from '@/types/project.types'

afterEach(cleanup)

const today = new Date(2026, 4, 18) // Mo, 18.05.2026

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 50,
    ...overrides,
  }
}

describe('ProjectCockpit', () => {
  it('zeigt die Ruhe-Meldung, wenn kein Gate pending ist', () => {
    render(<ProjectCockpit phases={[phase()]} currentPhaseId="ph1" today={today} onGoToPhases={() => {}} />)
    expect(screen.getByText('Nichts brennt. Nächster Meilenstein läuft planmäßig.')).toBeTruthy()
  })

  it('zeigt das pending Gate im Naechster-Zug-Titel und einen CTA-Button', () => {
    render(
      <ProjectCockpit
        phases={[phase({ gateState: 'pending', gateDate: '2026-05-22' })]}
        currentPhaseId="ph1" today={today} onGoToPhases={() => {}}
      />,
    )
    expect(screen.getByText(/Konzeptfreigabe einholen/)).toBeTruthy()
    expect(screen.getByText('Zur Phase')).toBeTruthy()
  })

  it('ruft onGoToPhases auf, wenn der Zur-Phase-Button geklickt wird', () => {
    const onGoToPhases = vi.fn()
    render(
      <ProjectCockpit
        phases={[phase({ gateState: 'pending', gateDate: '2026-05-22' })]}
        currentPhaseId="ph1" today={today} onGoToPhases={onGoToPhases}
      />,
    )
    fireEvent.click(screen.getByText('Zur Phase'))
    expect(onGoToPhases).toHaveBeenCalledTimes(1)
  })

  it('zeigt "X von Y Phasen" in der Phasen-Rail-Kopfzeile', () => {
    render(
      <ProjectCockpit
        phases={[phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })]}
        currentPhaseId="ph2" today={today} onGoToPhases={() => {}}
      />,
    )
    expect(screen.getByText('1 von 2 Phasen')).toBeTruthy()
  })

  it('zeigt Budget und Stimmung in der Ampel als "noch nicht erfasst", nicht als gruen/ok', () => {
    render(<ProjectCockpit phases={[phase()]} currentPhaseId="ph1" today={today} onGoToPhases={() => {}} />)
    const labels = screen.getAllByText('noch nicht erfasst')
    expect(labels).toHaveLength(2)
  })

  it('zeigt "Alles ruhig", wenn keine Signale vorliegen', () => {
    render(<ProjectCockpit phases={[phase()]} currentPhaseId="ph1" today={today} onGoToPhases={() => {}} />)
    expect(screen.getByText('Alles ruhig.')).toBeTruthy()
  })

  it('listet Signale und ruft onGoToPhases bei Klick auf', () => {
    const onGoToPhases = vi.fn()
    render(
      <ProjectCockpit
        phases={[phase({ gateState: 'pending', gateDate: '2026-05-22' })]}
        currentPhaseId="ph1" today={today} onGoToPhases={onGoToPhases}
      />,
    )
    fireEvent.click(screen.getByText('Konzeptfreigabe wartet'))
    expect(onGoToPhases).toHaveBeenCalled()
  })
})
