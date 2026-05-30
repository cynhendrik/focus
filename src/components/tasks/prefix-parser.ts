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

const WEEKDAY_FULL: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4,
  freitag: 5, samstag: 6, sonntag: 0,
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

function dayAfterTomorrowAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  d.setHours(9, 0, 0, 0)
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

// Soft date detection — words in free-text without `@` prefix.
// Returns ISO date if the token (case-insensitive, trailing punctuation
// stripped) is recognized as a date keyword or German date format.
function parseSoftDateToken(rawToken: string): string | undefined {
  // Tolerant: strip trailing punctuation like "heute," or "heute."
  // but keep trailing dot for date formats (handled by their own regex).
  const cleanWord = rawToken.replace(/[,;:!?]+$/, '')
  const lower = cleanWord.toLowerCase()

  if (lower === 'heute')      return todayAt(new Date().getHours() + 1, 0)
  if (lower === 'morgen')     return tomorrowAt()
  if (lower === 'übermorgen') return dayAfterTomorrowAt()
  if (lower in WEEKDAY_FULL)  return nextWeekday(WEEKDAY_FULL[lower])

  // DD.MM.YYYY
  const ymd = rawToken.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ymd) {
    const d = new Date(parseInt(ymd[3], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[1], 10), 9, 0, 0)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  // DD.MM. or DD.MM (current year, roll forward if already past)
  const dm = rawToken.match(/^(\d{1,2})\.(\d{1,2})\.?$/)
  if (dm) {
    const now = new Date()
    const d = new Date(now.getFullYear(), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10), 9, 0, 0)
    if (d.getTime() < now.setHours(0, 0, 0, 0)) d.setFullYear(d.getFullYear() + 1)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

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

  // Soft date detection on the leftover title parts — only if no
  // explicit @-token already set a date. Match the FIRST hit only,
  // remove that token from the title.
  if (!draft.scheduledAt) {
    for (let i = 0; i < titleParts.length; i++) {
      const soft = parseSoftDateToken(titleParts[i])
      if (soft) {
        draft.scheduledAt = soft
        titleParts.splice(i, 1)
        break
      }
    }
  }

  draft.title = titleParts.join(' ')
  return draft
}
