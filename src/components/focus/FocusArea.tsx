import { useState } from 'react'
import { useFocusStore } from '@/store/focus.store'
import { Section } from './Section'
import { BUCKET_CONFIG } from '@/types/focus.types'
import type { FocusTodo, FocusBucket } from '@/types/focus.types'

const BUCKETS: FocusBucket[] = ['today', 'tomorrow', 'this_week', 'later']

function SlidePanel({ task, onClose }: { task: FocusTodo; onClose: () => void }) {
  const remove = useFocusStore(s => s.remove)
  const { color } = BUCKET_CONFIG[task.when]

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.18)' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          padding: '36px 32px 48px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
          animation: 'focusSlideUp 0.3s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: 'rgba(17,17,17,0.15)', borderRadius: 99, margin: '-16px auto 28px' }} />

        {/* Content */}
        <div style={{ borderLeft: `6px solid ${color}`, paddingLeft: '18px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {BUCKET_CONFIG[task.when].label}
          </p>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111111', lineHeight: 1.3 }}>
            {task.title}
          </h2>
          {task.customer && (
            <p style={{ fontSize: '14px', color: 'rgba(17,17,17,0.55)', marginTop: '4px' }}>
              {task.customer}
            </p>
          )}
        </div>

        {task.notes && (
          <p style={{ fontSize: '16px', color: 'rgba(17,17,17,0.65)', lineHeight: 1.6, marginBottom: '28px' }}>
            {task.notes}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '14px',
              background: color,
              color: task.when === 'later' ? '#111111' : '#FFFFFF',
              fontSize: '15px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Schließen
          </button>
          <button
            onClick={() => { remove(task.id); onClose() }}
            style={{
              padding: '14px 20px',
              borderRadius: '14px',
              background: 'rgba(17,17,17,0.06)',
              color: 'rgba(17,17,17,0.5)',
              fontSize: '15px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Löschen
          </button>
        </div>
      </div>
    </>
  )
}

export function FocusArea() {
  const todos = useFocusStore(s => s.todos)
  const [selected, setSelected] = useState<FocusTodo | null>(null)

  function getSection(bucket: FocusBucket): FocusTodo[] {
    return todos
      .filter(t => t.when === bucket)
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: '#F7F7F7' }}
    >
      <div
        style={{
          maxWidth: '768px',
          margin: '0 auto',
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
        }}
      >
        {/* Header */}
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111111' }}>Fokus</h1>
          <p style={{ fontSize: '14px', color: 'rgba(17,17,17,0.50)', marginTop: '6px' }}>
            Deine Tasks nach Zeitraum sortiert
          </p>
        </div>

        {/* Sections */}
        {BUCKETS.map(bucket => (
          <Section
            key={bucket}
            title={BUCKET_CONFIG[bucket].label}
            tasks={getSection(bucket)}
            priorityColor={BUCKET_CONFIG[bucket].color}
            onSelect={setSelected}
          />
        ))}
      </div>

      {selected && (
        <SlidePanel task={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
