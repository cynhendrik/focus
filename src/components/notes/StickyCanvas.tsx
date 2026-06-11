import { useCallback } from 'react'
import type { StickyNote } from '@/types/notes-module.types'
import { StickyCard, STICKY_COLORS } from './StickyCard'

interface Props {
  stickies:  StickyNote[]
  onChange:  (stickies: StickyNote[]) => void
}

export function StickyCanvas({ stickies, onChange }: Props) {
  const handleChange = useCallback((updated: StickyNote) => {
    onChange(stickies.map(s => s.id === updated.id ? updated : s))
  }, [stickies, onChange])

  const handleDelete = useCallback((id: string) => {
    onChange(stickies.filter(s => s.id !== id))
  }, [stickies, onChange])

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', zIndex: 10,
    }}>
      {stickies.map(s => (
        <StickyCard
          key={s.id}
          note={s}
          onChange={handleChange}
          onDelete={() => handleDelete(s.id)}
        />
      ))}
    </div>
  )
}

export function createSticky(existingCount: number): StickyNote {
  return {
    id:     crypto.randomUUID(),
    x:      40 + existingCount * 20,
    y:      40 + existingCount * 20,
    color:  STICKY_COLORS[existingCount % STICKY_COLORS.length],
    title:  '',
    text:   '',
    checks: [],
  }
}
