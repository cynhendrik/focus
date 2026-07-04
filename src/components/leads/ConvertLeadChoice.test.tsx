import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConvertLeadChoice } from './ConvertLeadChoice'

afterEach(cleanup)

describe('ConvertLeadChoice', () => {
  it('zeigt den Lead-Namen', () => {
    render(<ConvertLeadChoice leadName="Anna Beispiel" onChoose={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/Anna Beispiel/)).toBeTruthy()
  })

  it('„Kunde + Deal" wählt withDeal=true', () => {
    const onChoose = vi.fn()
    render(<ConvertLeadChoice leadName="Anna" onChoose={onChoose} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /kunde \+ deal/i }))
    expect(onChoose).toHaveBeenCalledWith(true)
  })

  it('„Nur Kunde" wählt withDeal=false', () => {
    const onChoose = vi.fn()
    render(<ConvertLeadChoice leadName="Anna" onChoose={onChoose} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /nur kunde/i }))
    expect(onChoose).toHaveBeenCalledWith(false)
  })

  it('Abbrechen ruft onCancel und nicht onChoose', () => {
    const onChoose = vi.fn()
    const onCancel = vi.fn()
    render(<ConvertLeadChoice leadName="Anna" onChoose={onChoose} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /abbrechen/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onChoose).not.toHaveBeenCalled()
  })
})
