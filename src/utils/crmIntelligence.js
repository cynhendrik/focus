// CRM Intelligence Layer
// Pure functions — no side effects, no store access
// Call with slices of store state

const today = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000)

// ── Customer temperature ──────────────────────────────────────────────────────
// hot    = active + healthy + recent contact
// warm   = mild inactivity or slight health dip
// cold   = no contact 7–14 days or health < 60
// danger = no contact 14d+ or health < 40 or many overdues

export function customerTemperature(customerId, { customers, chatMessages, emails, todos, healthScores }) {
  const t = today()
  const customer = customers.find(c => c.id === customerId)
  if (!customer) return 'unknown'

  const lastChat  = chatMessages.filter(m => m.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const lastEmail = emails.filter(e => e.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  const timestamps = [
    customer.updatedAt,
    lastChat?.createdAt,
    lastEmail?.createdAt,
  ].filter(Boolean).sort().reverse()

  const daysSince = timestamps[0] ? daysBetween(timestamps[0].slice(0, 10), t) : 999
  const hs = healthScores.find(h => h.customerId === customerId)?.score ?? null
  const overdues = todos.filter(td => td.customerId === customerId && !td.completed && td.due && td.due < t).length

  if (overdues >= 3 || daysSince >= 21 || (hs != null && hs < 40)) return 'danger'
  if (overdues >= 1 || daysSince >= 10 || (hs != null && hs < 60)) return 'cold'
  if (daysSince >= 5  || (hs != null && hs < 75))                  return 'warm'
  return 'hot'
}

export const tempConfig = {
  hot:     { label: 'Heiß',   color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  warm:    { label: 'Warm',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  cold:    { label: 'Kalt',   color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  danger:  { label: 'Gefahr', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  unknown: { label: '—',      color: 'var(--text4)', bg: 'var(--bg3)' },
}

// ── Risks ─────────────────────────────────────────────────────────────────────

export function customerRisks(customerId, { customers, chatMessages, emails, todos, healthScores, crmFollowUps }) {
  const t = today()
  const risks = []
  const customer = customers.find(c => c.id === customerId)
  if (!customer) return risks

  const daysSinceUpdate = daysBetween(customer.updatedAt.slice(0, 10), t)
  if (daysSinceUpdate >= 14) risks.push({ type: 'inactivity', label: `Keine Aktivität seit ${daysSinceUpdate} Tagen`, severity: daysSinceUpdate >= 21 ? 'high' : 'mid' })

  const overdues = todos.filter(td => td.customerId === customerId && !td.completed && td.due && td.due < t)
  if (overdues.length > 0) risks.push({ type: 'overdue_todos', label: `${overdues.length} überfällige Aufgaben`, severity: overdues.length >= 3 ? 'high' : 'mid' })

  const hs = healthScores.find(h => h.customerId === customerId)?.score ?? null
  if (hs != null && hs < 60) risks.push({ type: 'health_drop', label: `Health Score: ${hs}%`, severity: hs < 40 ? 'high' : 'mid' })

  const openFollowUps = crmFollowUps.filter(f => f.customerId === customerId && f.status === 'offen' && f.date < t)
  if (openFollowUps.length > 0) risks.push({ type: 'followup', label: `${openFollowUps.length} offene Follow-Ups`, severity: 'mid' })

  const unreadMsgs = chatMessages.filter(m => m.customerId === customerId && m.sender === 'customer' && !m.read).length
  if (unreadMsgs > 0) risks.push({ type: 'unread_chat', label: `${unreadMsgs} ungelesene Nachrichten`, severity: 'mid' })

  const unreadEmails = emails.filter(e => e.customerId === customerId && e.direction === 'in' && !e.read).length
  if (unreadEmails > 0) risks.push({ type: 'unread_email', label: `${unreadEmails} ungelesene E-Mails`, severity: 'mid' })

  return risks
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export function customerOpportunities(customerId, { chatMessages, emails, todos }) {
  const opps = []

  const OPPORTUNITY_KEYWORDS = ['angebot', 'projekt', 'anfrage', 'kooperation', 'idee', 'plan', 'nächste', 'ausbauen', 'erweitern', 'budget', 'investition']
  const allText = [
    ...chatMessages.filter(m => m.customerId === customerId).map(m => m.text.toLowerCase()),
    ...emails.filter(e => e.customerId === customerId).map(e => `${e.subject} ${e.body}`.toLowerCase()),
  ]
  const matchedKeywords = OPPORTUNITY_KEYWORDS.filter(kw => allText.some(t => t.includes(kw)))
  if (matchedKeywords.length > 0) opps.push({ type: 'keyword_match', label: `Mögliches Projekt / Anfrage erkannt`, keywords: matchedKeywords })

  return opps
}

// ── Next step ─────────────────────────────────────────────────────────────────

export function nextStep(customerId, { todos, crmFollowUps, chatMessages, emails, customers }) {
  const t = today()
  const customer = customers.find(c => c.id === customerId)
  if (!customer) return null

  // Unread message → reply first
  const unread = chatMessages.filter(m => m.customerId === customerId && m.sender === 'customer' && !m.read)
  if (unread.length > 0) return { action: 'reply_chat', label: `Auf Nachricht antworten (${unread.length} ungelesen)` }

  const unreadEmail = emails.filter(e => e.customerId === customerId && e.direction === 'in' && !e.read)
  if (unreadEmail.length > 0) return { action: 'reply_email', label: `E-Mail beantworten (${unreadEmail.length} ungelesen)` }

  // Overdue todo
  const overdue = todos.filter(td => td.customerId === customerId && !td.completed && td.due && td.due < t)
    .sort((a, b) => a.due.localeCompare(b.due))[0]
  if (overdue) return { action: 'todo', label: overdue.text, todoId: overdue.id }

  // Due today
  const dueToday = todos.filter(td => td.customerId === customerId && !td.completed && td.due === t)[0]
  if (dueToday) return { action: 'todo', label: dueToday.text, todoId: dueToday.id }

  // Open follow-up
  const followUp = crmFollowUps.filter(f => f.customerId === customerId && f.status === 'offen' && f.date <= t)[0]
  if (followUp) return { action: 'followup', label: followUp.notes || 'Follow-Up abarbeiten', followUpId: followUp.id }

  // No urgent task
  const daysSince = daysBetween(customer.updatedAt.slice(0, 10), t)
  if (daysSince >= 5) return { action: 'touch', label: `Kunden kontaktieren (${daysSince}d keine Aktivität)` }

  return null
}

// ── Unread counts ─────────────────────────────────────────────────────────────

export function unreadCounts(customerId, { chatMessages, emails }) {
  const chat  = chatMessages.filter(m => m.customerId === customerId && m.sender === 'customer' && !m.read).length
  const email = emails.filter(e => e.customerId === customerId && e.direction === 'in' && !e.read).length
  return { chat, email, total: chat + email }
}

export function globalUnreadCounts({ chatMessages, emails }) {
  const chat  = chatMessages.filter(m => m.sender === 'customer' && !m.read).length
  const email = emails.filter(e => e.direction === 'in' && !e.read).length
  return { chat, email, total: chat + email }
}
