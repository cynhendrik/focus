import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StapelCard } from './StapelCard'

vi.mock('@/lib/ai/corra', () => ({ generateCorraDraft: vi.fn().mockResolvedValue('KI-TEXT') }))

const item = {
  id: 'p1', workspaceId: 'ws1', type: 'mahnung', sourceKind: 'invoice_reminder',
  sourceId: 'inv1:0', assignee: null,
  payload: {
    title: 'Zahlungserinnerung an Meyer GmbH — 1.190,00 €',
    why: 'Zahlungserinnerung, weil Rechnung R-100 seit 14 Tagen ohne Zahlung ist.',
    draftSubject: 'Betreff', draftBody: 'Entwurfstext', amount: 1190, level: 0,
  },
  score: 1000, status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
  createdAt: '', updatedAt: '', approvedAt: null,
} as never

describe('StapelCard', () => {
  it('zeigt Titel, Begruendung und die vier Aktionen', () => {
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText(/Zahlungserinnerung an Meyer GmbH/)).toBeInTheDocument()
    expect(screen.getByText(/seit 14 Tagen ohne Zahlung/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Freigeben' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anpassen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Später' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeInTheDocument()
  })

  it('Freigeben ruft onApprove; busy deaktiviert den Knopf', () => {
    const onApprove = vi.fn()
    const { rerender } = render(<StapelCard item={item} focused onApprove={onApprove} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Freigeben' }))
    expect(onApprove).toHaveBeenCalledOnce()
    rerender(<StapelCard item={item} focused busy onApprove={onApprove} onSaveDraft={vi.fn()} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Freigeben' })).toBeDisabled()
  })

  it('Anpassen oeffnet den Editor mit dem Entwurf; Speichern liefert das geaenderte Payload', () => {
    const onSaveDraft = vi.fn()
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={onSaveDraft} onSnooze={vi.fn()} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Anpassen' }))
    const textarea = screen.getByLabelText('Entwurf')
    expect(textarea).toHaveValue('Entwurfstext')
    fireEvent.change(textarea, { target: { value: 'Neuer Text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }))
    expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ draftBody: 'Neuer Text' }))
  })

  it('Spaeter zeigt die drei Fristen und liefert die Tage', () => {
    const onSnooze = vi.fn()
    render(<StapelCard item={item} focused onApprove={vi.fn()} onSaveDraft={vi.fn()} onSnooze={onSnooze} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    fireEvent.click(screen.getByRole('button', { name: 'In 3 Tagen' }))
    expect(onSnooze).toHaveBeenCalledWith(3)
  })
})
