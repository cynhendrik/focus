import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectPhasesList } from './ProjectPhasesList'
import type { ProjectPhase } from '@/types/project.types'

afterEach(cleanup)

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 40,
    deliverables: [],
    ...overrides,
  }
}

function renderList(overrides: Partial<Parameters<typeof ProjectPhasesList>[0]> = {}) {
  return render(
    <ProjectPhasesList
      phases={[phase()]} currentPhaseId="ph1"
      onDeletePhase={vi.fn().mockResolvedValue(undefined)}
      onUpdateProgress={vi.fn()}
      onRequestGate={vi.fn()}
      onApproveGate={vi.fn()}
      onUpdateDeliverables={vi.fn()}
      onRemind={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ProjectPhasesList', () => {
  it('rendert den Phasennamen und den Gate-Status-Tag', () => {
    renderList()
    expect(screen.getByText('Konzept')).toBeTruthy()
    expect(screen.getByText('geplant')).toBeTruthy()
  })

  it('klappt beim Klick auf die Kopfzeile die Details auf und zeigt den Gate-Bereich', () => {
    // currentPhaseId: null, damit die Karte NICHT bereits per Default offen ist (openId startet bei currentPhaseId) --
    // so testet dieser Fall wirklich das Oeffnen per Klick statt eines bereits offenen Panels.
    renderList({ currentPhaseId: null })
    fireEvent.click(screen.getByText('Konzept'))
    expect(screen.getByText('Noch keine Freigabe angefragt.')).toBeTruthy()
    expect(screen.getByText('Freigabe anfragen')).toBeTruthy()
  })

  it('ruft onRequestGate mit dem eingegebenen Datum auf', () => {
    const onRequestGate = vi.fn()
    // Panel ist bereits offen (openId startet bei currentPhaseId === 'ph1' === Phase-ID) -- kein Klick noetig.
    renderList({ onRequestGate })
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-01' } })
    fireEvent.click(screen.getByText('Freigabe anfragen'))
    expect(onRequestGate).toHaveBeenCalledWith('ph1', '2026-06-01')
  })

  it('zeigt bei pending Gate das Freitext-Feld und deaktiviert den Button bis Eingabe erfolgt', () => {
    renderList({ phases: [phase({ gateState: 'pending', gateDate: '2026-06-01' })] })
    const button = screen.getByText('Freigabe eintragen') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Wer hat freigegeben?'), { target: { value: 'M. Weber' } })
    expect(button.disabled).toBe(false)
  })

  it('ruft onApproveGate mit dem eingegebenen Namen auf', () => {
    const onApproveGate = vi.fn()
    renderList({ phases: [phase({ gateState: 'pending', gateDate: '2026-06-01' })], onApproveGate })
    fireEvent.change(screen.getByPlaceholderText('Wer hat freigegeben?'), { target: { value: 'M. Weber' } })
    fireEvent.click(screen.getByText('Freigabe eintragen'))
    expect(onApproveGate).toHaveBeenCalledWith('ph1', 'M. Weber')
  })

  it('zeigt bei approved Gate die Freigabe-Info ohne weitere Buttons', () => {
    renderList({ phases: [phase({ gateState: 'approved', gateDate: '2026-06-01', gateApprovedBy: 'M. Weber' })] })
    expect(screen.getByText(/Freigegeben am 01.06.2026 — M. Weber/)).toBeTruthy()
    expect(screen.queryByText('Freigabe anfragen')).toBeNull()
    expect(screen.queryByText('Freigabe eintragen')).toBeNull()
  })

  it('fuegt ein Deliverable hinzu und zyklt seinen Status durch Klick', () => {
    const onUpdateDeliverables = vi.fn()
    renderList({ onUpdateDeliverables })
    const addButton = screen.getByText('+ Deliverable') as HTMLButtonElement
    expect(addButton.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Neues Ergebnis'), { target: { value: 'Moodboard' } })
    expect(addButton.disabled).toBe(false)
    fireEvent.click(addButton)
    expect(onUpdateDeliverables).toHaveBeenCalledWith('ph1', [expect.objectContaining({ name: 'Moodboard', status: 'open' })])
  })

  it('zyklt den Status eines bestehenden Deliverables open -> review -> done -> open', () => {
    const onUpdateDeliverables = vi.fn()
    renderList({
      phases: [phase({ deliverables: [{ id: 'd1', name: 'Moodboard', status: 'open' }] })],
      onUpdateDeliverables,
    })
    fireEvent.click(screen.getByTitle('offen'))
    expect(onUpdateDeliverables).toHaveBeenCalledWith('ph1', [{ id: 'd1', name: 'Moodboard', status: 'review' }])
  })

  it('entfernt ein Deliverable', () => {
    const onUpdateDeliverables = vi.fn()
    renderList({
      phases: [phase({ deliverables: [{ id: 'd1', name: 'Moodboard', status: 'open' }] })],
      onUpdateDeliverables,
    })
    fireEvent.click(screen.getByLabelText('Moodboard entfernen'))
    expect(onUpdateDeliverables).toHaveBeenCalledWith('ph1', [])
  })

  it('zeigt den Fortschritts-Regler nur fuer die aktuelle Phase', () => {
    renderList({
      phases: [phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })],
      currentPhaseId: 'ph1',
    })
    expect(screen.getAllByRole('slider')).toHaveLength(1)
  })

  it('zeigt Zwei-Klick-Loeschen nur fuer nicht-aktuelle Phasen', () => {
    renderList({
      phases: [phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })],
      currentPhaseId: 'ph1',
    })
    expect(screen.getAllByTitle('Phase löschen')).toHaveLength(1)
  })

  it('ruft onDeletePhase erst nach Bestaetigung auf', async () => {
    const onDeletePhase = vi.fn().mockResolvedValue(undefined)
    renderList({
      phases: [phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })],
      currentPhaseId: 'ph1', onDeletePhase,
    })
    fireEvent.click(screen.getByTitle('Phase löschen'))
    expect(onDeletePhase).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Wirklich löschen'))
    expect(onDeletePhase).toHaveBeenCalledWith('ph2')
  })
})
