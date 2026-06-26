import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LizenzenSettings } from './LizenzenSettings'

afterEach(cleanup)

describe('LizenzenSettings', () => {
  it('zeigt Überschrift + die drei Blöcke', () => {
    render(<LizenzenSettings />)
    expect(screen.getByText('Lizenzen & Upgrades')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.getByText(/Team-Sitze/)).toBeTruthy()
    expect(screen.getByText(/Zahlung/)).toBeTruthy()
  })
})
