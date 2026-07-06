import { describe, it, expect } from 'vitest'
import { activityToTodo, todoToCreatePayload, todoToUpdatePayload } from './todos.mapper'
import type { Activity } from '@/types/pipeline.types'

const taskAct: Activity = {
  id: 't1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'task',
  title: 'Anrufen', status: 'open', dueAt: '2026-07-01', assignee: 'u2',
  payload: JSON.stringify({ priority: 'p1', bucket: 'today', tags: ['x'], checklist: [], scheduledAt: '2026-07-01T09:00:00Z' }),
  createdAt: '2026-01-01', updatedAt: '2026-01-02',
} as any

describe('todos.mapper', () => {
  it('activityToTodo: payload-Felder + status + assignee', () => {
    const t = activityToTodo(taskAct)
    expect(t.id).toBe('t1'); expect(t.customerId).toBe('c1'); expect(t.title).toBe('Anrufen')
    expect(t.priority).toBe('p1'); expect(t.bucket).toBe('today'); expect(t.tags).toEqual(['x'])
    expect(t.dueDate).toBe('2026-07-01'); expect(t.assignee).toBe('u2'); expect(t.status).toBe('open')
  })
  it('activityToTodo: Legacy-Priority high→p1, defaults bei kaputtem payload', () => {
    expect(activityToTodo({ ...taskAct, payload: JSON.stringify({ priority: 'high' }) } as any).priority).toBe('p1')
    expect(activityToTodo({ ...taskAct, payload: 'kaputt' } as any).priority).toBe('p3')
  })
  it('todoToCreatePayload: type=task, assignee, payload-JSON', () => {
    const p = todoToCreatePayload(
      { customerId: 'c1', title: 'T', priority: 'p2', tags: ['a'], dueDate: '2026-07-01', assignee: 'u2' },
      { workspaceId: 'ws1', createdBy: 'u1' },
    )
    expect(p.type).toBe('task'); expect(p.accountId).toBe('c1'); expect(p.assignee).toBe('u2'); expect(p.dueAt).toBe('2026-07-01')
    const pl = JSON.parse(p.payload!)
    expect(pl.priority).toBe('p2'); expect(pl.tags).toEqual(['a'])
  })
  it('todoToUpdatePayload: title/status/dueAt/assignee + payload-JSON', () => {
    const p = todoToUpdatePayload({ id: 't1', customerId: 'c1', title: 'T2', status: 'done', dueDate: '2026-07-02', assignee: 'u3', priority: 'p1' })
    expect(p.title).toBe('T2'); expect(p.status).toBe('done'); expect(p.dueAt).toBe('2026-07-02'); expect(p.assignee).toBe('u3')
    expect(JSON.parse(p.payload!).priority).toBe('p1')
  })
})

function baseActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'a1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1',
    type: 'task', status: 'open', payload: '{}',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('todos.mapper — projectId/projectPhaseId', () => {
  it('activityToTodo reads projectId from the activity and projectPhaseId from payload', () => {
    const activity = baseActivity({
      projectId: 'p1',
      payload: JSON.stringify({ bucket: 'today', projectPhaseId: 'ph1' }),
    })
    const todo = activityToTodo(activity)
    expect(todo.projectId).toBe('p1')
    expect(todo.projectPhaseId).toBe('ph1')
  })

  it('activityToTodo leaves project fields undefined when absent', () => {
    const todo = activityToTodo(baseActivity())
    expect(todo.projectId).toBeUndefined()
    expect(todo.projectPhaseId).toBeUndefined()
  })

  it('todoToCreatePayload forwards projectId onto the activity payload and projectPhaseId into the JSON blob', () => {
    const payload = todoToCreatePayload(
      { title: 'Test-Aufgabe', projectId: 'p1', projectPhaseId: 'ph1' },
      { workspaceId: 'ws1', createdBy: 'u1' },
    )
    expect(payload.projectId).toBe('p1')
    const packed = JSON.parse(payload.payload!)
    expect(packed.projectPhaseId).toBe('ph1')
  })
})
