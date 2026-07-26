import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectsArchiveList } from './ProjectsArchiveList'
import type { Project } from '@/types/project.types'

afterEach(cleanup)

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws-1', accountId: 'a1', title: 'Test-Projekt', description: null,
    status: 'paused', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', completedAt: null,
    retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
    ...overrides,
  }
}

describe('ProjectsArchiveList', () => {
  it('zeigt eine Leer-Meldung, wenn kein Projekt pausiert oder abgeschlossen ist', () => {
    render(<ProjectsArchiveList projects={[]} customerNameFor={() => 'Kunde'} onOpen={() => {}} />)
    expect(screen.getByText(/Kein pausiertes oder abgeschlossenes Projekt/)).toBeTruthy()
  })

  it('gruppiert Projekte nach pausiert und abgeschlossen', () => {
    render(
      <ProjectsArchiveList
        projects={[project({ id: 'p1', title: 'Pausiert-Projekt', status: 'paused' }), project({ id: 'p2', title: 'Fertig-Projekt', status: 'completed' })]}
        customerNameFor={() => 'Kunde'} onOpen={() => {}}
      />,
    )
    expect(screen.getByText('Pausiert-Projekt')).toBeTruthy()
    expect(screen.getByText('Fertig-Projekt')).toBeTruthy()
    expect(screen.getByText('Pausiert')).toBeTruthy()
    expect(screen.getByText('Abgeschlossen')).toBeTruthy()
  })

  it('ruft onOpen mit der Projekt-Id auf, wenn eine Zeile geklickt wird', () => {
    const opened: string[] = []
    render(
      <ProjectsArchiveList
        projects={[project({ id: 'p1', title: 'Pausiert-Projekt' })]}
        customerNameFor={() => 'Kunde'} onOpen={id => opened.push(id)}
      />,
    )
    fireEvent.click(screen.getByText('Pausiert-Projekt'))
    expect(opened).toEqual(['p1'])
  })
})
