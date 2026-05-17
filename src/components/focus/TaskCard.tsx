import type { FocusTodo } from '@/types/focus.types'

interface Props {
  task: FocusTodo
  priorityColor: string
  onClick: () => void
  index: number
}

export function TaskCard({ task, priorityColor, onClick, index }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left hover:scale-[1.02] active:scale-[0.99] transition-transform duration-150"
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        borderLeft: `6px solid ${priorityColor}`,
        padding: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        animation: `focusCardIn 0.35s ease both`,
        animationDelay: `${index * 0.06}s`,
      }}
    >
      <p style={{ fontSize: '18px', fontWeight: 600, color: '#111111', lineHeight: 1.3 }}>
        {task.title}
      </p>
      {(task.customer || task.notes) && (
        <p style={{ fontSize: '14px', color: 'rgba(17,17,17,0.55)', marginTop: '6px' }}>
          {[task.customer, task.notes].filter(Boolean).join(' · ')}
        </p>
      )}
    </button>
  )
}
