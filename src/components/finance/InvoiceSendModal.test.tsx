import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

vi.mock('@/services/invoice-send.service', () => ({
  prepareInvoiceMail: vi.fn(),
  sendInvoiceMail: vi.fn(),
}))

import { InvoiceSendModal } from './InvoiceSendModal'
import { prepareInvoiceMail, sendInvoiceMail } from '@/services/invoice-send.service'

afterEach(cleanup)

const invoice = {
  id: 'inv1',
  workspaceId: 'ws1',
  createdBy: 'u1',
  accountId: 'acc1',
  number: 'RE-001',
  date: '2026-07-01',
  dueDate: '2026-07-31',
  status: 'open' as const,
  taxMode: 'standard' as const,
  subtotal: 100,
  taxAmount: 19,
  total: 119,
  bankInfo: '',
  isSuggestion: false,
  pendingSync: false,
  createdAt: '',
  updatedAt: '',
}

const preparedData = {
  to: 'kunde@test.de',
  subject: 'Rechnung RE-001 von Mein Betrieb',
  body: 'Sehr geehrte Damen und Herren, anbei Rechnung RE-001...',
  attachmentPath: '/tmp/RE-001.pdf',
}

describe('InvoiceSendModal', () => {
  it('Prefill erscheint nach erfolgreichem Prepare', async () => {
    vi.mocked(prepareInvoiceMail).mockResolvedValue({ ok: true, data: preparedData })
    render(<InvoiceSendModal invoice={invoice} onClose={() => {}} onSent={() => {}} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('kunde@test.de')).toBeTruthy()
      expect(screen.getByDisplayValue('Rechnung RE-001 von Mein Betrieb')).toBeTruthy()
      expect(screen.getByDisplayValue('Sehr geehrte Damen und Herren, anbei Rechnung RE-001...')).toBeTruthy()
    })
  })

  it('Senden ruft sendInvoiceMail mit editierten Werten', async () => {
    vi.mocked(prepareInvoiceMail).mockResolvedValue({ ok: true, data: preparedData })
    vi.mocked(sendInvoiceMail).mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    const onSent = vi.fn()
    render(<InvoiceSendModal invoice={invoice} onClose={onClose} onSent={onSent} />)
    await waitFor(() => screen.getByDisplayValue('kunde@test.de'))

    fireEvent.change(screen.getByDisplayValue('kunde@test.de'), { target: { value: 'neu@test.de' } })
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))

    await waitFor(() => {
      expect(sendInvoiceMail).toHaveBeenCalledWith(
        invoice,
        expect.objectContaining({ to: 'neu@test.de', attachmentPath: '/tmp/RE-001.pdf' }),
      )
    })
  })

  it('prepare-Fehler → Fehlertext + kein Senden-Button', async () => {
    vi.mocked(prepareInvoiceMail).mockResolvedValue({
      ok: false,
      error: 'Kein E-Mail-Konto konfiguriert — unter Mail einrichten.',
    })
    render(<InvoiceSendModal invoice={invoice} onClose={() => {}} onSent={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/Kein E-Mail-Konto/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull()
    })
  })
})
