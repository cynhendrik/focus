import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectInvoices } from './ProjectInvoices'
import type { Invoice } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

afterEach(cleanup)

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', description: null,
    status: 'active', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    completedAt: null, retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
    moodboardItems: [],
    ...overrides,
  }
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', projectId: 'p1',
    date: '2026-01-01', dueDate: '2026-01-15', status: 'open', taxMode: 'standard',
    subtotal: 100, taxAmount: 19, total: 119, bankInfo: '{}',
    isSuggestion: false, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderPane(overrides: Partial<Parameters<typeof ProjectInvoices>[0]> = {}) {
  return render(
    <ProjectInvoices
      project={project()} invoices={[]} payments={[]} pdfBusy={null}
      onAssignProject={vi.fn()} onCreateInvoice={vi.fn()}
      onPayment={vi.fn()} onDownload={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ProjectInvoices', () => {
  it('zeigt einen leeren Hinweis ohne Rechnungen', () => {
    renderPane()
    expect(screen.getByText('Keine Rechnungen')).toBeTruthy()
  })

  it('rendert eine Rechnungszeile pro Rechnung', () => {
    renderPane({ invoices: [invoice({ number: 'R-2026-001' })] })
    expect(screen.getByText('R-2026-001')).toBeTruthy()
  })

  it('berechnet die Summen-Kopfzeile korrekt (Bezahlt/Offen/Gestellt)', () => {
    renderPane({
      invoices: [
        invoice({ id: 'inv1', status: 'paid', total: 100 }),
        invoice({ id: 'inv2', status: 'open', total: 50 }),
        invoice({ id: 'inv3', status: 'draft', total: 30 }),
      ],
    })
    // Die Beträge stehen zusammen mit ihrem Label in einem Text-Node (`<span>Bezahlt {..}</span>`).
    // Ein reiner getByText('100,00 €') würde hier mit der Rechnungszeile derselben Summe kollidieren
    // (mehrfacher Treffer) bzw. beim Gestellt-Betrag (der in keiner Zeile vorkommt) gar nicht matchen,
    // weil RTL den vollen normalisierten textContent des Elements vergleicht. Daher gegen den vollen
    // Label+Betrag-Text prüfen.
    expect(screen.getByText('Bezahlt 100,00 €')).toBeTruthy()
    expect(screen.getByText('Offen 50,00 €')).toBeTruthy()
    expect(screen.getByText('Gestellt 150,00 €')).toBeTruthy()
  })

  it('ruft onCreateInvoice beim Klick auf "Neue Rechnung" auf', () => {
    const onCreateInvoice = vi.fn()
    renderPane({ onCreateInvoice })
    fireEvent.click(screen.getByText('Neue Rechnung'))
    expect(onCreateInvoice).toHaveBeenCalled()
  })

  it('ruft onDownload mit der Rechnung beim Klick auf "PDF" auf (echte Verdrahtung, kein No-Op)', () => {
    const onDownload = vi.fn()
    const inv = invoice({ number: 'R-2026-001' })
    renderPane({ invoices: [inv], onDownload })
    fireEvent.click(screen.getByText('PDF'))
    expect(onDownload).toHaveBeenCalledWith(inv)
  })

  it('ruft onPayment mit der Rechnung beim Klick auf "Zahlung" auf (echte Verdrahtung, kein No-Op)', () => {
    const onPayment = vi.fn()
    const inv = invoice({ number: 'R-2026-001', status: 'open' })
    renderPane({ invoices: [inv], onPayment })
    fireEvent.click(screen.getByText('Zahlung'))
    expect(onPayment).toHaveBeenCalledWith(inv)
  })

  it('deaktiviert den PDF-Button für die Rechnung, die gerade pdfBusy ist', () => {
    const inv = invoice({ number: 'R-2026-001' })
    renderPane({ invoices: [inv], pdfBusy: inv.id })
    expect(screen.getByText('…').closest('button')).toBeDisabled()
  })
})
