import { useEffect, useMemo, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useUiStore } from '@/store/ui.store'
import { TasksHeader } from '@/components/tasks/TasksHeader'
import { TasksListView } from '@/components/tasks/TasksListView'
import { TasksBoardView } from '@/components/tasks/TasksBoardView'
import { TasksFocusView } from '@/components/tasks/TasksFocusView'
import { CyPlanPanel } from '@/components/tasks/CyPlanPanel'

export function TasksRoute() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const loadAll     = useTodosStore(s => s.loadAll)
  const allTodos    = useTodosStore(s => s.allTodos)
  const tasksTab    = useUiStore(s => s.tasksTab)

  const [cyOpen, setCyOpen] = useState(false)

  useEffect(() => {
    if (workspaceId) loadAll(workspaceId)
  }, [workspaceId, loadAll])

  const openCount = allTodos.filter(t => t.status !== 'done').length
  const completedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allTodos.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === today).length
  }, [allTodos])
  const total = openCount + completedToday
  const plannedHours = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allTodos
      .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today))
      .reduce((sum, t) => sum + (t.plannedMinutes ?? 0), 0) / 60
  }, [allTodos])

  return (
    <div className="main-inner">
      <TasksHeader
        total={total}
        completedToday={completedToday}
        plannedHours={plannedHours}
        onOpenCyPanel={() => setCyOpen(true)}
      />

      {tasksTab === 'list'  && <TasksListView />}
      {tasksTab === 'board' && <TasksBoardView />}
      {tasksTab === 'focus' && <TasksFocusView />}

      <CyPlanPanel open={cyOpen} onClose={() => setCyOpen(false)} />
    </div>
  )
}
