import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectMoodboard } from './ProjectMoodboard'
import type { MoodboardItem } from '@/types/project.types'

afterEach(cleanup)

// URL.createObjectURL / URL.revokeObjectURL are polyfilled globally in src/test/setup.js
// (with distinguishable per-call values so revoke-correctness can be asserted).

function renderBoard(items: MoodboardItem[] = [], overrides: Partial<Parameters<typeof ProjectMoodboard>[0]> = {}) {
  return render(
    <ProjectMoodboard
      items={items}
      onChange={vi.fn()}
      onUploadImage={vi.fn()}
      onRemoveImage={vi.fn()}
      onSnip={vi.fn()}
      readImage={vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))}
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

  it('editiert den Text einer Notiz-Kachel inline (persistiert erst bei Blur)', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Alt' }],
      { onChange },
    )
    const textarea = screen.getByDisplayValue('Alt')
    fireEvent.change(textarea, { target: { value: 'Neu' } })
    expect(screen.getByDisplayValue('Neu')).toBeTruthy()
    fireEvent.blur(textarea)
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1', text: 'Neu' }),
    ])
  })

  it('persistiert den Notiz-Text NICHT bei jedem Tastenanschlag, nur bei Blur', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Alt' }],
      { onChange },
    )
    const textarea = screen.getByDisplayValue('Alt')
    fireEvent.change(textarea, { target: { value: 'A' } })
    fireEvent.change(textarea, { target: { value: 'Ab' } })
    expect(screen.getByDisplayValue('Ab')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('editiert die Notiz einer Typo-Kachel inline (persistiert erst bei Blur)', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'type', x: 10, y: 10, w: 24, h: 22, cap: 'Typo', font: 'serif', sample: 'Aa', note: 'Alt' }],
      { onChange },
    )
    const input = screen.getByDisplayValue('Alt')
    fireEvent.change(input, { target: { value: 'Neu' } })
    expect(screen.getByDisplayValue('Neu')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1', note: 'Neu' }),
    ])
  })

  it('zeigt einen Auswahl-Button bei einer Bild-Kachel ohne storageKey', () => {
    renderBoard([{ id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Neues Bild', storageKey: null }])
    expect(screen.getByText('Bild auswählen')).toBeTruthy()
  })

  it('ruft onUploadImage mit der ausgewaehlten Datei auf', () => {
    const onUploadImage = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Neues Bild', storageKey: null }],
      { onUploadImage },
    )
    const file = new File(['x'], 'bild.png', { type: 'image/png' })
    const input = screen.getByLabelText('Bild auswählen') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(onUploadImage).toHaveBeenCalledWith('m1', file)
  })

  it('ruft readImage auf und zeigt das Bild bei gesetztem storageKey', async () => {
    const readImage = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    renderBoard(
      [{ id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Bild', storageKey: 'key-1' }],
      { readImage },
    )
    await vi.waitFor(() => expect(readImage).toHaveBeenCalledWith('m1', 'key-1'))
    await vi.waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
  })

  it('fetcht ein Bild nicht erneut, wenn das Board bei gleichem storageKey neu rendert (Drag-Flicker-Regression)', async () => {
    const readImage = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    const item: MoodboardItem = { id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Bild', storageKey: 'key-1' }
    const { rerender } = renderBoard([item], { readImage })

    await vi.waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
    expect(readImage).toHaveBeenCalledTimes(1)
    // URL.createObjectURL/revokeObjectURL are polyfilled once at module scope in
    // src/test/setup.js and shared across every test in this file, so we track
    // deltas rather than absolute counts.
    const createCallsAfterInitialFetch = vi.mocked(URL.createObjectURL).mock.calls.length
    const revokeCallsAfterInitialFetch = vi.mocked(URL.revokeObjectURL).mock.calls.length

    // Simulate what onGrab's forceRerender does on every pointermove during a drag:
    // ProjectMoodboard re-renders with a fresh `items` array while storageKey is unchanged.
    rerender(
      <ProjectMoodboard
        items={[{ ...item }]}
        onChange={vi.fn()}
        onUploadImage={vi.fn()}
        onRemoveImage={vi.fn()}
        readImage={readImage}
      />,
    )

    expect(readImage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(createCallsAfterInitialFetch)
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(revokeCallsAfterInitialFetch)
  })

  it('ruft onSnip auf, wenn der Schnappschuss-Button geklickt wird', () => {
    const onSnip = vi.fn()
    renderBoard([], { onSnip })
    fireEvent.click(screen.getByText('Schnappschuss'))
    expect(onSnip).toHaveBeenCalledOnce()
  })
})
