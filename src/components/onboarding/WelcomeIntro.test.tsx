import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { WelcomeIntro } from './WelcomeIntro'

afterEach(cleanup)

describe('WelcomeIntro', () => {
  it('renders the welcome headline', () => {
    render(<WelcomeIntro onDone={() => {}} />)
    expect(screen.getByText('Willkommen.')).toBeTruthy()
  })

  it('calls onDone when the CTA is clicked', () => {
    const onDone = vi.fn()
    render(<WelcomeIntro onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /los geht/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
