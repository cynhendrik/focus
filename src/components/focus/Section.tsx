import { TaskCard } from './TaskCard'
import type { FocusTodo } from '@/types/focus.types'

interface Props {
  title: string
  tasks: FocusTodo[]
  priorityColor: string
  onSelect: (task: FocusTodo) => void
}

export function Section({ title, tasks, priorityColor, onSelect }: Props) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#111111' }}>{title}</h2>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: priorityColor,
            background: `${priorityColor}18`,
            borderRadius: '99px',
            padding: '2px 10px',
          }}
        >
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'rgba(17,17,17,0.35)', padding: '12px 0' }}>
          Keine Tasks
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {tasks.map((task, i) => (
            <TaskCard
              key={task.id}
              task={task}
              priorityColor={priorityColor}
              onClick={() => onSelect(task)}
              index={i}
            />
          ))}
        </div>
      )}
    </section>
  )
}
