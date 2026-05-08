// Computes the health score dynamically from store data.
// Base: 50. Activity gives +points, inactivity/overdue gives -points.

export function computeHealthScore(customerId, { customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache }) {
  const customer = customers.find(c => c.id === customerId)
  if (!customer) return { score: 0, factors: [] }

  const now      = new Date()
  const days30   = new Date(now - 30 * 86400000)
  const days14   = new Date(now - 14 * 86400000)
  const days7    = new Date(now - 7  * 86400000)

  const myTodos     = todos.filter(t => t.customerId === customerId)
  const myKpis      = kpis.filter(k => k.customerId === customerId)
  const myNotes     = notes.filter(n => n.customerId === customerId)
  const myDeadlines = deadlines.filter(d => d.customerId === customerId)
  const igConn      = instagramConnections.find(c => c.customerId === customerId)
  const igCache     = instagramCache.find(c => c.customerId === customerId)

  const factors = []
  let delta = 0

  // ── Completed todos ────────────────────────────────────────────────
  const completedTodos = myTodos.filter(t => t.completed)
  if (completedTodos.length > 0) {
    const pts = Math.min(completedTodos.length * 3, 20)
    delta += pts
    factors.push({ label: `${completedTodos.length} Aufgabe${completedTodos.length > 1 ? 'n' : ''} abgeschlossen`, pts: `+${pts}`, positive: true })
  }

  // ── Instagram connected ────────────────────────────────────────────
  if (igConn) {
    delta += 5
    factors.push({ label: 'Instagram verbunden', pts: '+5', positive: true })
  }

  // ── Instagram cache / recent reels ────────────────────────────────
  if (igCache?.reels?.length > 0) {
    delta += 5
    factors.push({ label: 'Social Media Daten geladen', pts: '+5', positive: true })
    const recentReels = igCache.reels.filter(r => new Date(r.posted_at) >= days30)
    if (recentReels.length > 0) {
      const pts = Math.min(recentReels.length * 2, 15)
      delta += pts
      factors.push({ label: `${recentReels.length} Reel${recentReels.length > 1 ? 's' : ''} in 30 Tagen`, pts: `+${pts}`, positive: true })
    }
  }

  // ── KPIs present ──────────────────────────────────────────────────
  if (myKpis.length > 0) {
    delta += 5
    factors.push({ label: 'KPIs angelegt', pts: '+5', positive: true })

    const kpiNames = [...new Set(myKpis.map(k => k.name))]
    const trending = kpiNames.some(name => {
      const sorted = myKpis.filter(k => k.name === name).sort((a, b) => new Date(a.date) - new Date(b.date))
      if (sorted.length < 2) return false
      const lv = parseFloat(sorted[sorted.length - 1].value)
      const pv = parseFloat(sorted[sorted.length - 2].value)
      return !isNaN(lv) && !isNaN(pv) && lv > pv
    })
    if (trending) {
      delta += 5
      factors.push({ label: 'KPI-Wachstum erkannt', pts: '+5', positive: true })
    }
  }

  // ── Future deadlines organized ────────────────────────────────────
  const futureDeadlines = myDeadlines.filter(d => new Date(d.date) >= now)
  if (futureDeadlines.length > 0) {
    delta += 3
    factors.push({ label: 'Deadlines gepflegt', pts: '+3', positive: true })
  }

  // ── Notes recently updated ────────────────────────────────────────
  const recentNotes = myNotes.filter(n => new Date(n.updatedAt) >= days14)
  if (recentNotes.length > 0) {
    delta += 3
    factors.push({ label: 'Notizen aktuell', pts: '+3', positive: true })
  }

  // ── Overdue deadlines ─────────────────────────────────────────────
  const overdue = myDeadlines.filter(d => new Date(d.date) < now)
  if (overdue.length > 0) {
    const pts = Math.min(overdue.length * 5, 20)
    delta -= pts
    factors.push({ label: `${overdue.length} Deadline${overdue.length > 1 ? 's' : ''} überfällig`, pts: `-${pts}`, positive: false })
  }

  // ── Stale high-priority open todos (>7 days) ──────────────────────
  const staleHigh = myTodos.filter(t => !t.completed && (t.prio === 'high' || t.priority === 'high') && new Date(t.createdAt) < days7)
  if (staleHigh.length > 0) {
    const pts = Math.min(staleHigh.length * 5, 15)
    delta -= pts
    factors.push({ label: `${staleHigh.length} dringende${staleHigh.length > 1 ? '' : ''} Task${staleHigh.length > 1 ? 's' : ''} unbearbeitet`, pts: `-${pts}`, positive: false })
  }

  // ── Inactivity (customer.updatedAt) ───────────────────────────────
  const daysSince = Math.floor((now - new Date(customer.updatedAt)) / 86400000)
  if (daysSince > 30) {
    delta -= 15
    factors.push({ label: `${daysSince} Tage keine Aktivität`, pts: '-15', positive: false })
  } else if (daysSince > 14) {
    delta -= 7
    factors.push({ label: `${daysSince} Tage wenig Aktivität`, pts: '-7', positive: false })
  }

  const score = Math.min(100, Math.max(0, Math.round(50 + delta)))
  return { score, factors }
}
