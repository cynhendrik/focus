import type { Todo } from '@/types/todo.types'

/**
 * "Mein Tag"-Ownership: eine Aufgabe gehört auf meine persönliche Fläche, wenn
 * sie mir zugewiesen ist ODER unassignt ist (noch ohne Besitzer — implizit
 * "für jeden / mir zum Greifen"). Der unassignte Zweig ist für Solo-Workspaces
 * essenziell: dort tragen Composer-Aufgaben keinen assignee und würden sonst
 * aus der Ansicht verschwinden.
 */
export function isMine(todo: Pick<Todo, 'assignee'>, userId: string | undefined): boolean {
  const a = todo.assignee
  if (!a) return true        // unassignt → in jedermanns „Mein Tag" sichtbar (Solo-Sicherheitsnetz)
  if (!userId) return true    // kein eingeloggter Nutzer (lokal/solo) → nichts verstecken
  return a === userId
}

export function filterMine<T extends Pick<Todo, 'assignee'>>(
  todos: T[],
  userId: string | undefined,
): T[] {
  return todos.filter(t => isMine(t, userId))
}
