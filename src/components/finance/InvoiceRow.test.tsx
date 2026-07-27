import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InvoiceRow } from './InvoiceRow'
import type { Invoice, Payment } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

afterEach(cleanup)

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
    date: '2026-01-01', dueDate: '2099-01-15', status: 'open', taxMode: 'standard',
    subtotal: 100, taxAmount: 19, total: 119, bankInfo: '{}',
    isSuggestion: false, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', description: null,
    status: 'active', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    completedAt: null, retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
    moodboardItems: [],
    ...overrides,
  }
}

function renderRow(overrides: Partial<Parameters<typeof InvoiceRow>[0]> = {}) {
  return render(
    <table><tbody>
      <InvoiceRow
        inv={invoice()} payments={[]} pdfBusy={null} projects={[project()]}
        onPayment={vi.fn()} onDownload={vi.fn()} onAssignProject={vi.fn()}
        {...overrides}
      />
    </tbody></table>,
  )
}

describe('InvoiceRow', () => {
  it('zeigt Rechnungsnummer, Betrag und Status', () => {
    renderRow({ inv: invoice({ number: 'R-2026-001' }) })
    expect(screen.getByText('R-2026-001')).toBeTruthy()
    expect(screen.getByText('Offen')).toBeTruthy()
  })

  it('zeigt "Kein Projekt" im Zuordnen-Dropdown, wenn keine Zuordnung besteht', () => {
    renderRow({ inv: invoice({ projectId: undefined }) })
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('zeigt das zugeordnete Projekt im Dropdown vorausgewaehlt', () => {
    renderRow({ inv: invoice({ projectId: 'p1' }) })
    expect(screen.getByRole('combobox')).toHaveValue('p1')
  })

  it('ruft onAssignProject beim Aendern der Auswahl auf', () => {
    const onAssignProject = vi.fn()
    renderRow({ inv: invoice({ projectId: undefined }), onAssignProject })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } })
    expect(onAssignProject).toHaveBeenCalledWith('inv1', 'p1')
  })

  it('ruft onAssignProject mit null auf, wenn "Kein Projekt" gewaehlt wird', () => {
    const onAssignProject = vi.fn()
    renderRow({ inv: invoice({ projectId: 'p1' }), onAssignProject })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onAssignProject).toHaveBeenCalledWith('inv1', null)
  })
})
