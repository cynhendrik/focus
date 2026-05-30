import type { TodoPriority } from '@/types/todo.types'

export interface TaskDraft {
  title: string
  priority?: TodoPriority
  plannedMinutes?: number
  scheduledAt?: string
  tags: string[]
  customerHint?: string
}

const RE_PRIORITY = /^(!{1,2})$/
const RE_DURATION = /^~(\d+(?:\.\d+)?)(m|h)$/i
const RE_TIME     = /^@(\d{1,2}):(\d{2})$/
const RE_DATE_ISO = /^@(\d{4}-\d{2}-\d{2})$/
const RE_TAG      = /^#([\p{L}\p{N}_-]+)$/u
const RE_CUSTOMER = /^\+([\p{L}\p{N}_-]+)$/u

const WEEKDAY_MAP: Record<string, number> = {
  mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0,
}

function todayAt(hour: number, minute: number): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function tomorrowAt(hour = 9, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function nextWeekday(target: number): string {
  const d = new Date()
  const diff = (target - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function parseAtKeyword(value: string): string | undefined {
  const lower = value.toLowerCase()
  if (lower === 'heute')  return todayAt(new Date().getHours() + 1, 0)
  if (lower === 'morgen') return tomorrowAt()
  if (lower in WEEKDAY_MAP) return nextWeekday(WEEKDAY_MAP[lower])
  return undefined
}

export function parseTaskText(input: string): TaskDraft {
  const draft: TaskDraft = { title: '', tags: [] }
  const titleParts: string[] = []

  for (const token of input.trim().split(/\s+/)) {
    if (!token) continue

    if (RE_PRIORITY.test(token)) {
      draft.priority = token === '!!' ? 'p1' : 'p2'
      continue
    }
    const dur = token.match(RE_DURATION)
    if (dur) {
      const value = parseFloat(dur[1])
      draft.plannedMinutes = dur[2].toLowerCase() === 'h'
        ? Math.round(value * 60)
        : Math.round(value)
      continue
    }
    const tm = token.match(RE_TIME)
    if (tm) {
      draft.scheduledAt = todayAt(parseInt(tm[1], 10), parseInt(tm[2], 10))
      continue
    }
    const iso = token.match(RE_DATE_ISO)
    if (iso) {
      const d = new Date(iso[1] + 'T09:00:00')
      draft.scheduledAt = d.toISOString()
      continue
    }
    if (token.startsWith('@')) {
      const kw = parseAtKeyword(token.slice(1))
      if (kw) { draft.scheduledAt = kw; continue }
    }
    const tag = token.match(RE_TAG)
    if (tag) {
      draft.tags.push(tag[1])
      continue
    }
    const cust = token.match(RE_CUSTOMER)
    if (cust) {
      draft.customerHint = cust[1]
      continue
    }
    titleParts.push(token)
  }

  draft.title = titleParts.join(' ')
  return draft
}
