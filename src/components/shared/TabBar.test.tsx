import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from './TabBar'
import { Target, Milestone } from 'lucide-react'

afterEach(cleanup)

const tabs = [
  { id: 'a', label: 'Cockpit', icon: Target },
  { id: 'b', label: 'Phasen', icon: Milestone, count: 2 },
]

describe('TabBar', () => {
  it('rendert alle Tab-Labels', () => {
    render(<TabBar tabs={tabs} activeId="a" onChange={() => {}} />)
    expect(screen.getByText('Cockpit')).toBeTruthy()
    expect(screen.getByText('Phasen')).toBeTruthy()
  })

  it('zeigt die Badge-Zahl nur, wenn count gesetzt ist', () => {
    render(<TabBar tabs={tabs} activeId="a" onChange={() => {}} />)
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('ruft onChange mit der geklickten Tab-Id auf', () => {
    const clicked: string[] = []
    render(<TabBar tabs={tabs} activeId="a" onChange={id => clicked.push(id)} />)
    fireEvent.click(screen.getByText('Phasen'))
    expect(clicked).toEqual(['b'])
  })
})
