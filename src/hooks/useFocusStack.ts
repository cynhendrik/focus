import { useMemo, useState, useCallback } from 'react'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoPriority } from '@/types/todo.types'

const PRIO_ORDER: Record<TodoPriority, number> = { p1: 0, p2: 1, p3: 2, p4: 3 }

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isToday(t: Todo): boolean {
  if (t.bucket === 'today' || t.bucket === 'in_progress') return true
  if (t.scheduledAt && t.scheduledAt.slice(0, 10) === todayDateString()) return true
  return false
}

export function sortFocus(a: Todo, b: Todo): number {
  const p = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]
  if (p !== 0) return p
  const sa = a.scheduledAt ?? ''
  const sb = b.scheduledAt ?? ''
  if (sa !== sb) return sa.localeCompare(sb)
  return a.createdAt.localeCompare(b.createdAt)
}

export interface FocusStackApi {
  stack: Todo[]
  currentIndex: number
  current: Todo | undefined
  total: number
  completedToday: number
  prev:     () => void
  skip:     () => void
  complete: () => Promise<void>
  postpone: () => Promise<void>
}

export function useFocusStack(customerId?: string): FocusStackApi {
  const allTodos = useTodosStore(s => s.allTodos)
  const complete = useTodosStore(s => s.complete)
  const postpone = useTodosStore(s => s.postpone)

  const scoped = useMemo(
    () => customerId ? allTodos.filter(t => t.customerId === customerId) : allTodos,
    [allTodos, customerId],
  )

  const stack = useMemo(
    () => scoped.filter(t => isToday(t) && t.status !== 'done').sort(sortFocus),
    [scoped],
  )
  const completedToday = useMemo(
    () => scoped.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === todayDateString()).length,
    [scoped],
  )

  const [currentIndex, setCurrentIndex] = useState(0)

  const safeIndex = stack.length === 0 ? 0 : Math.min(currentIndex, stack.length - 1)
  const current = stack[safeIndex]

  const prev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1))
  }, [])

  const skip = useCallback(() => {
    setCurrentIndex(i => {
      if (stack.length === 0) return 0
      return (i + 1) % stack.length
    })
  }, [stack.length])

  const completeAction = useCallback(async () => {
    if (!current) return
    await complete(current.id)
  }, [current, complete])

  const postponeAction = useCallback(async () => {
    if (!current) return
    await postpone(current.id)
  }, [current, postpone])

  return {
    stack,
    currentIndex: safeIndex,
    current,
    total: stack.length,
    completedToday,
    prev,
    skip,
    complete: completeAction,
    postpone: postponeAction,
  }
}
