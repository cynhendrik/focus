import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LizenzenSettings } from './LizenzenSettings'

afterEach(cleanup)

describe('LizenzenSettings', () => {
  it('zeigt Testphase-Karte', () => {
    render(<LizenzenSettings />)
    expect(screen.getByText('Lizenzen & Abrechnung')).toBeTruthy()
    expect(screen.getByText('Testphase')).toBeTruthy()
    expect(screen.getByText('Du bist in der Testphase')).toBeTruthy()
  })
})
