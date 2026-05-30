import type { TodoPriority } from '@/types/todo.types'

export interface TaskDraft {
  title: string
  priority?: TodoPriority
  plannedMinutes?: number
  scheduledAt?: string
  /** True if the user gave an explicit clock time (e.g. "12:30") — drives auto-calendar. */
  hasExplicitTime?: boolean
  tags: string[]
  /** Customer reference — populated either by the @-mention popover or legacy +Kunde. */
  customerId?: string
}

const RE_PRIORITY = /^(!{1,2})$/
const RE_DURATION = /^~(\d+(?:\.\d+)?)(m|h)$/i
const RE_TAG      = /^#([\p{L}\p{N}_-]+)$/u
/** Legacy "+Kunde" — kept for back-compat. New mentions come pre-resolved via mentionsResolver. */
const RE_LEGACY_CUSTOMER = /^\+([\p{L}\p{N}_-]+)$/u
/** "12:30" / "9:00" — bare clock time. */
const RE_SOFT_TIME = /^(\d{1,2}):(\d{2})$/

const WEEKDAY_FULL: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4,
  freitag: 5, samstag: 6, sonntag: 0,
  // Common short forms also accepted as soft tokens
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

/** Apply explicit hour/minute to an existing ISO date (keeps date, replaces time). */
function withTime(iso: string, hour: number, minute: number): string {
  const d = new Date(iso)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function parseSoftDateToken(rawToken: string): string | undefined {
  const cleanWord = rawToken.replace(/[,;:!?]+$/, '')
  const lower = cleanWord.toLowerCase()

  if (lower === 'heute')      return todayAt(new Date().getHours() + 1, 0)
  if (lower === 'morgen')     return tomorrowAt()
  if (lower === 'übermorgen') return dayAfterTomorrowAt()
  if (lower in WEEKDAY_FULL)  return nextWeekday(WEEKDAY_FULL[lower])

  const ymd = rawToken.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ymd) {
    const d = new Date(parseInt(ymd[3], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[1], 10), 9, 0, 0)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  const dm = rawToken.match(/^(\d{1,2})\.(\d{1,2})\.?$/)
  if (dm) {
    const now = new Date()
    const d = new Date(now.getFullYear(), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10), 9, 0, 0)
    if (d.getTime() < now.setHours(0, 0, 0, 0)) d.setFullYear(d.getFullYear() + 1)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  return undefined
}

export interface ParseContext {
  /** Resolved mentions — `[{ marker: '@<token>', customerId }]`. Composer fills this from the mention popover. */
  mentions?: Array<{ marker: string; customerId: string }>
}

export function parseTaskText(input: string, ctx: ParseContext = {}): TaskDraft {
  const draft: TaskDraft = { title: '', tags: [] }
  const titleParts: string[] = []

  // Resolve pre-known mentions first — strip marker tokens out of the title pass.
  const mentionMap = new Map<string, string>()
  for (const m of ctx.mentions ?? []) mentionMap.set(m.marker.toLowerCase(), m.customerId)

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
    // Resolved mention from popover (highest precedence on @-tokens)
    if (token.startsWith('@')) {
      const resolved = mentionMap.get(token.toLowerCase())
      if (resolved) {
        // First mention wins — keeps later mentions usable as participants display
        if (!draft.customerId) draft.customerId = resolved
        continue
      }
      // Unresolved @-token: drop the @ and treat as a normal word in the title.
      // This makes "@Klara" still readable even when the mention hasn't been picked.
      titleParts.push(token.slice(1))
      continue
    }
    const tag = token.match(RE_TAG)
    if (tag) {
      draft.tags.push(tag[1])
      continue
    }
    // Legacy "+Kunde" — fuzzy match resolution happens in the composer
    const legacyCust = token.match(RE_LEGACY_CUSTOMER)
    if (legacyCust) {
      // Pass through as customerHint marker — composer can still resolve it.
      // (We don't set customerId here because we don't have the customer list in pure parser.)
      titleParts.push(token)   // preserve in title until composer resolves
      continue
    }
    titleParts.push(token)
  }

  // Soft date detection on the leftover title parts.
  // Match the FIRST hit only, remove that token from the title.
  for (let i = 0; i < titleParts.length; i++) {
    const soft = parseSoftDateToken(titleParts[i])
    if (soft) {
      draft.scheduledAt = soft
      titleParts.splice(i, 1)
      break
    }
  }

  // Soft time detection: bare "HH:MM" in the free text.
  for (let i = 0; i < titleParts.length; i++) {
    const m = titleParts[i].match(RE_SOFT_TIME)
    if (!m) continue
    const hour = parseInt(m[1], 10)
    const minute = parseInt(m[2], 10)
    if (hour > 23 || minute > 59) continue
    draft.scheduledAt = draft.scheduledAt
      ? withTime(draft.scheduledAt, hour, minute)
      : todayAt(hour, minute)
    draft.hasExplicitTime = true
    titleParts.splice(i, 1)
    break
  }

  // Filler words that became meaningless once tokens were stripped ("um", "am", "mit")
  const FILLER = new Set(['um', 'am', 'mit'])
  const cleaned = titleParts.filter(t => !FILLER.has(t.toLowerCase()))

  draft.title = cleaned.join(' ')
  return draft
}
