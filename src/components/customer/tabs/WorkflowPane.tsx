import { useEffect, useMemo, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useUiStore } from '@/store/ui.store'
import { TasksHeader } from '@/components/tasks/TasksHeader'
import { TasksListView } from '@/components/tasks/TasksListView'
import { TasksBoardView } from '@/components/tasks/TasksBoardView'
import { TasksFocusView } from '@/components/tasks/TasksFocusView'
import { CyPlanPanel } from '@/components/tasks/CyPlanPanel'

interface Props { customerId: string }

export function WorkflowPane({ customerId }: Props) {
  const loadForCustomer = useTodosStore(s => s.loadForCustomer)
  const allTodos        = useTodosStore(s => s.allTodos)
  const tasksTab        = useUiStore(s => s.tasksTab)

  const [cyOpen, setCyOpen] = useState(false)

  useEffect(() => {
    loadForCustomer(customerId)
  }, [customerId, loadForCustomer])

  const customerTodos = useMemo(
    () => allTodos.filter(t => t.customerId === customerId),
    [allTodos, customerId],
  )

  const openCount = customerTodos.filter(t => t.status !== 'done').length
  const completedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return customerTodos.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === today).length
  }, [customerTodos])
  const total = openCount + completedToday
  const plannedHours = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return customerTodos
      .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today))
      .reduce((sum, t) => sum + (t.plannedMinutes ?? 0), 0) / 60
  }, [customerTodos])

  return (
    <div style={{
      maxWidth: 760,
      margin: '0 auto',
      padding: '8px 24px 80px',
      display: 'flex', flexDirection: 'column',
      gap: 24,
    }}>
      <TasksHeader
        compact
        total={total}
        completedToday={completedToday}
        plannedHours={plannedHours}
        onOpenCyPanel={() => setCyOpen(true)}
      />

      {tasksTab === 'list'  && <TasksListView  customerId={customerId} />}
      {tasksTab === 'board' && <TasksBoardView customerId={customerId} />}
      {tasksTab === 'focus' && <TasksFocusView customerId={customerId} />}

      <CyPlanPanel open={cyOpen} onClose={() => setCyOpen(false)} customerId={customerId} />
    </div>
  )
}
