import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DatenschutzSettings } from './DatenschutzSettings'

afterEach(cleanup)

describe('DatenschutzSettings', () => {
  it('renders the KI privacy heading', () => {
    render(<DatenschutzSettings />)
    expect(screen.getByText('KI-Funktionen & Datenschutz')).toBeTruthy()
  })

  it('names Anthropic and the USA as the data recipient', () => {
    render(<DatenschutzSettings />)
    expect(screen.getByText(/Anthropic PBC \(USA\)/)).toBeTruthy()
    expect(screen.getByText(/nicht zum Training/)).toBeTruthy()
  })
})
