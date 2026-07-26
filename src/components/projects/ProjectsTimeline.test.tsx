import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectsTimeline } from './ProjectsTimeline'
import { rollingWeeks } from '@/lib/projects/timeline-weeks'
import type { Project, ProjectPhase } from '@/types/project.types'

afterEach(cleanup)

const today = new Date(2026, 4, 18) // Mo, 18.05.2026 -> KW 21
const weeks = rollingWeeks(today, 4, 10)

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws-1', accountId: 'a1', title: 'Brand Refresh', description: null,
    status: 'active', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', completedAt: null,
    retainerMonthly: 8500, retainerHours: 60, retainerMonths: 12,
    ...overrides,
  }
}

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzeptfreigabe', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'pending', gateDate: '2026-05-11', gateApprovedBy: null, progressPercent: 78,
    ...overrides,
  }
}

describe('ProjectsTimeline', () => {
  it('zeigt eine Leer-Meldung, wenn kein Projekt im Filter ist', () => {
    render(<ProjectsTimeline projects={[]} phasesByProject={{}} customerNameFor={() => 'Kunde'} weeks={weeks} today={today} onOpen={() => {}} />)
    expect(screen.getByText('Kein Projekt in diesem Filter.')).toBeTruthy()
  })

  it('rendert die KW-Nummer der ersten Woche im Kopf', () => {
    render(<ProjectsTimeline projects={[]} phasesByProject={{}} customerNameFor={() => 'Kunde'} weeks={weeks} today={today} onOpen={() => {}} />)
    expect(screen.getByText(String(weeks[0].kw))).toBeTruthy()
  })

  it('rendert Projekttitel und Phasenbalken-Titel mit Fortschritt', () => {
    render(
      <ProjectsTimeline
        projects={[project()]} phasesByProject={{ p1: [phase()] }}
        customerNameFor={() => 'TechCorp'} weeks={weeks} today={today} onOpen={() => {}}
      />,
    )
    expect(screen.getByText('Brand Refresh')).toBeTruthy()
    expect(screen.getByTitle('Konzeptfreigabe · 78 %')).toBeTruthy()
  })

  it('ruft onOpen mit der Projekt-Id auf, wenn eine Zeile geklickt wird', () => {
    const opened: string[] = []
    render(
      <ProjectsTimeline
        projects={[project()]} phasesByProject={{ p1: [phase()] }}
        customerNameFor={() => 'TechCorp'} weeks={weeks} today={today} onOpen={id => opened.push(id)}
      />,
    )
    fireEvent.click(screen.getByText('Brand Refresh'))
    expect(opened).toEqual(['p1'])
  })

  it('stapelt sich zeitlich überlappende Phasen auf unterschiedliche Reihen statt sich zu überdecken', () => {
    const overlappingA = phase({ id: 'phA', name: 'Moodboard', startDate: '2026-05-04', endDate: '2026-05-18' })
    const overlappingB = phase({ id: 'phB', name: 'Entwicklung Phase 1', startDate: '2026-05-04', endDate: '2026-05-18' })
    render(
      <ProjectsTimeline
        projects={[project()]} phasesByProject={{ p1: [overlappingA, overlappingB] }}
        customerNameFor={() => 'TechCorp'} weeks={weeks} today={today} onOpen={() => {}}
      />,
    )
    const barA = screen.getByTitle('Moodboard · 78 %')
    const barB = screen.getByTitle('Entwicklung Phase 1 · 78 %')
    expect(barA.style.top).not.toBe(barB.style.top)
  })

  it('lässt nicht-überlappende Phasen weiterhin auf derselben Reihe (top) liegen', () => {
    const sequentialA = phase({ id: 'phA', name: 'Moodboard', startDate: '2026-04-27', endDate: '2026-05-04' })
    const sequentialB = phase({ id: 'phB', name: 'Entwicklung Phase 1', startDate: '2026-05-04', endDate: '2026-05-11' })
    render(
      <ProjectsTimeline
        projects={[project()]} phasesByProject={{ p1: [sequentialA, sequentialB] }}
        customerNameFor={() => 'TechCorp'} weeks={weeks} today={today} onOpen={() => {}}
      />,
    )
    const barA = screen.getByTitle('Moodboard · 78 %')
    const barB = screen.getByTitle('Entwicklung Phase 1 · 78 %')
    expect(barA.style.top).toBe(barB.style.top)
  })
})
