import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectMoodboard } from './ProjectMoodboard'
import type { MoodboardItem } from '@/types/project.types'

afterEach(cleanup)

function renderBoard(items: MoodboardItem[] = [], overrides: Partial<Parameters<typeof ProjectMoodboard>[0]> = {}) {
  return render(
    <ProjectMoodboard
      items={items}
      onChange={vi.fn()}
      onUploadImage={vi.fn()}
      onRemoveImage={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ProjectMoodboard', () => {
  it('zeigt einen leeren Hinweis, wenn keine Kacheln vorhanden sind', () => {
    renderBoard([])
    expect(screen.getByText('Noch keine Kacheln auf diesem Board.')).toBeTruthy()
  })

  it('fuegt eine Notiz-Kachel mit Default-Werten hinzu', () => {
    const onChange = vi.fn()
    renderBoard([], { onChange })
    fireEvent.click(screen.getByText('Notiz'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'note', cap: 'Notiz', text: 'Neue Notiz — hier tippen.' }),
    ])
  })

  it('fuegt eine Farb-Kachel mit drei Default-Farben hinzu', () => {
    const onChange = vi.fn()
    renderBoard([], { onChange })
    fireEvent.click(screen.getByText('Farbe'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'color', colors: expect.arrayContaining([expect.any(String)]) }),
    ])
  })

  it('fuegt eine Typo-Kachel hinzu', () => {
    const onChange = vi.fn()
    renderBoard([], { onChange })
    fireEvent.click(screen.getByText('Typo'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'type', cap: 'Typo', sample: 'Aa' }),
    ])
  })

  it('rendert eine bestehende Notiz-Kachel mit ihrem Text', () => {
    renderBoard([{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Hallo Board' }])
    expect(screen.getByText('Hallo Board')).toBeTruthy()
  })

  it('rendert eine Farb-Kachel mit ihren Farbfeldern', () => {
    renderBoard([{ id: 'm1', kind: 'color', x: 10, y: 10, w: 24, h: 12, cap: 'Palette', colors: ['#111', '#222', '#333'] }])
    expect(screen.getAllByTitle(/#111|#222|#333/)).toHaveLength(3)
  })

  it('rendert eine Typo-Kachel mit Schriftprobe und Notiz', () => {
    renderBoard([{ id: 'm1', kind: 'type', x: 10, y: 10, w: 24, h: 22, cap: 'Typo', font: 'serif', sample: 'Aa', note: 'Schrift waehlen' }])
    expect(screen.getByText('Aa')).toBeTruthy()
    expect(screen.getByDisplayValue('Schrift waehlen')).toBeTruthy()
  })

  it('entfernt eine Kachel', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Hallo' }],
      { onChange },
    )
    fireEvent.click(screen.getByLabelText('Kachel entfernen'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('editiert den Text einer Notiz-Kachel inline', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Alt' }],
      { onChange },
    )
    fireEvent.change(screen.getByDisplayValue('Alt'), { target: { value: 'Neu' } })
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1', text: 'Neu' }),
    ])
  })
})
