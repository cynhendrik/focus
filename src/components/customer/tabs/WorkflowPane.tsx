import { useEffect, useMemo, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { TasksHeader } from '@/components/tasks/TasksHeader'
import { TasksListView } from '@/components/tasks/TasksListView'
import { TasksBoardView } from '@/components/tasks/TasksBoardView'
import { TasksFocusView } from '@/components/tasks/TasksFocusView'
import { CyPlanPanel } from '@/components/tasks/CyPlanPanel'

interface Props { customerId: string }

export function WorkflowPane({ customerId }: Props) {
  const loadForCustomer = useTodosStore(s => s.loadForCustomer)
  const allTodos        = useTodosStore(s => s.allTodos)

  const [cyOpen, setCyOpen]       = useState(false)
  const [focusMode, setFocusMode] = useState(false)

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
      padding: '20px 24px 64px',
      display: 'flex', flexDirection: 'column',
      gap: 24, overflowY: 'auto', flex: 1,
    }}>
      <TasksHeader
        compact
        total={total}
        completedToday={completedToday}
        plannedHours={plannedHours}
        onOpenCyPanel={() => setCyOpen(true)}
        focusActive={focusMode}
        onToggleFocus={() => setFocusMode(v => !v)}
      />

      {focusMode ? (
        <TasksFocusView customerId={customerId} />
      ) : (
        // Links: breite Arbeitsliste (Composer + Aufgaben). Rechts: die Stages
        // nebeneinander als schmale Spalten.
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(440px, 1.2fr) minmax(360px, 1fr)',
          gap: 24, alignItems: 'start',
        }}>
          <TasksListView customerId={customerId} defaultGroupBy="priority" />
          <TasksBoardView customerId={customerId} showComposer={false} />
        </div>
      )}

      <CyPlanPanel open={cyOpen} onClose={() => setCyOpen(false)} customerId={customerId} />
    </div>
  )
}
