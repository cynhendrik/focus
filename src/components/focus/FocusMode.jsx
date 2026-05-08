import { useState, useMemo, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { PRIVAT_ID } from '../../store'
import { Avatar } from '../ui/Avatar'

// ── helpers ──────────────────────────────────────────────────────────────────

function daysBetween(dateStr, refStr) {
  const a = new Date(dateStr)
  const b = new Date(refStr)
  return Math.floor((b - a) / 86400000)
}

function prioColor(prio) {
  if (prio === 'high') return '#ef4444'
  if (prio === 'mid')  return '#f59e0b'
  return '#6b7280'
}

function typeConfig(type) {
  switch (type) {
    case 'overdue':  return { label: 'Überfällig',       color: '#ef4444', bg: 'rgba(239,68,68,0.10)' }
    case 'today':    return { label: 'Heute',             color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' }
    case 'highprio': return { label: 'Hohe Priorität',   color: '#f97316', bg: 'rgba(249,115,22,0.10)' }
    case 'email':    return { label: 'Ungelesene E-Mail', color: '#3b82f6', bg: 'rgba(59,130,246,0.10)' }
    case 'followup': return { label: 'Follow-Up',        color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' }
    case 'health':   return { label: 'Risiko',            color: '#f87171', bg: 'rgba(248,113,113,0.10)' }
    case 'inactive': return { label: 'Inaktiv',           color: '#6b7280', bg: 'rgba(107,114,128,0.10)' }
    default:         return { label: type,                color: '#6b7280', bg: 'rgba(107,114,128,0.10)' }
  }
}

// ── ActionItem card ───────────────────────────────────────────────────────────

function ActionItem({ item, selected, onClick }) {
  const cfg = typeConfig(item.type)
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px', borderRadius: 10,
        background: selected ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'}`,
        cursor: 'pointer', transition: 'all 0.15s', marginBottom: 6,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.055)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: cfg.color, background: cfg.bg, padding: '2px 7px', borderRadius: 99 }}>
          {cfg.label}
        </span>
        {item.prio && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: prioColor(item.prio), display: 'inline-block', flexShrink: 0 }} />
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.35, marginBottom: 4 }}>{item.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{item.customerName}</span>
        {item.meta && <span style={{ fontSize: 11, color: cfg.color }}>· {item.meta}</span>}
      </div>
    </div>
  )
}

// ── Inline note editor ────────────────────────────────────────────────────────

function InlineNoteEditor({ note, onClose, updateNote }) {
  const taRef    = useRef(null)
  const timerRef = useRef(null)
  const [saved, setSaved] = useState(true)

  const handleContent = useCallback((val) => {
    setSaved(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      updateNote(note.id, { content: val })
      setSaved(true)
    }, 500)
  }, [note.id, updateNote])

  return (
    <div style={{
      marginTop: 8, borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={note.title || ''}
          onChange={e => updateNote(note.id, { title: e.target.value })}
          placeholder="Titel…"
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: saved ? '#22c55e' : '#f59e0b', transition: 'background 0.3s' }} />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}
          >×</button>
        </div>
      </div>
      <textarea
        ref={taRef}
        key={note.id}
        defaultValue={note.content || ''}
        onChange={e => handleContent(e.target.value)}
        placeholder="Schreibe hier…"
        rows={5}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          resize: 'vertical', color: '#cbd5e1', fontSize: 13, lineHeight: 1.7,
          fontFamily: 'inherit', padding: '10px 12px', boxSizing: 'border-box',
          minHeight: 100,
        }}
      />
    </div>
  )
}

// ── Right panel ───────────────────────────────────────────────────────────────

function FocusDetail({ item, onNavigate }) {
  const customers         = useStore(s => s.customers)
  const todos             = useStore(s => s.todos)
  const toggleTodo        = useStore(s => s.toggleTodo)
  const crmFollowUps      = useStore(s => s.crmFollowUps)
  const updateCrmFollowUp = useStore(s => s.updateCrmFollowUp)
  const notes             = useStore(s => s.notes)
  const addNote           = useStore(s => s.addNote)
  const updateNote        = useStore(s => s.updateNote)
  const deleteNote        = useStore(s => s.deleteNote)

  const [expandedNoteId, setExpandedNoteId] = useState(null)

  if (!item) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute',
            width: 140, height: 140, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 70%)',
            filter: 'blur(20px)',
          }} />
          <svg
            width="72" height="72"
            fill="#f59e0b"
            viewBox="0 0 24 24"
            style={{
              position: 'relative', zIndex: 1,
              filter: 'drop-shadow(0 0 18px rgba(245,158,11,0.65)) drop-shadow(0 0 6px rgba(245,158,11,0.4))',
            }}
          >
            <path d="M13 2L4.09 12.96A1 1 0 005 14.5h6.5L10 22l9.91-10.96A1 1 0 0019 9.5h-6.5L13 2z"/>
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.75)', letterSpacing: '-0.03em' }}>
          Fokus Modus
        </div>
      </div>
    )
  }

  const customer  = customers.find(c => c.id === item.customerId)
  const openTodos = todos
    .filter(t => t.customerId === item.customerId && !t.completed && !t.archived)
    .sort((a, b) => {
      const prioOrder = { high: 0, mid: 1, low: 2 }
      return (prioOrder[a.prio] ?? 1) - (prioOrder[b.prio] ?? 1)
    })
  const followUps     = crmFollowUps.filter(f => f.customerId === item.customerId && f.status === 'offen')
  const customerNotes = notes
    .filter(n => n.customerId === item.customerId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  const handleAddNote = () => {
    const n = addNote(item.customerId)
    setExpandedNoteId(n.id)
  }

  const handleDeleteNote = (id) => {
    deleteNote(id)
    if (expandedNoteId === id) setExpandedNoteId(null)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 40px', overflowY: 'auto' }}>
      {/* Customer header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        {customer && <Avatar name={customer.name} id={customer.id} size={52} radius={14} />}
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.03em' }}>
            {customer?.name ?? item.customerName}
          </div>
          {customer?.category && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{customer.category}</div>
          )}
        </div>
        <button
          onClick={() => onNavigate(item.customerId)}
          style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#f1f5f9' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8' }}
        >
          Zum Kunden →
        </button>
      </div>

      {/* Highlighted action */}
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px', marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: typeConfig(item.type).color, marginBottom: 8 }}>
          {typeConfig(item.type).label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{item.title}</div>
        {item.meta && <div style={{ fontSize: 12, color: '#f87171' }}>{item.meta}</div>}
        {item.notes && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{item.notes}</div>}
      </div>

      {/* Open todos */}
      {openTodos.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569', marginBottom: 12 }}>
            Offene Aufgaben ({openTodos.length})
          </div>
          {openTodos.map(t => {
            const isThisItem = t.id === item.id
            return (
              <div
                key={t.id}
                onClick={() => toggleTodo(t.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isThisItem ? 'rgba(245,158,11,0.08)' : 'transparent',
                  border: isThisItem ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                  marginBottom: 4, transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isThisItem) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isThisItem) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${prioColor(t.prio)}`, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#cbd5e1' }}>{t.text}</div>
                  {t.due && (
                    <div style={{ fontSize: 11, color: new Date(t.due) < new Date() ? '#ef4444' : '#64748b', marginTop: 2 }}>
                      Fällig: {new Date(t.due).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: prioColor(t.prio), textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.prio}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Open follow-ups */}
      {followUps.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569', marginBottom: 12 }}>
            Offene Follow-Ups ({followUps.length})
          </div>
          {followUps.map(f => (
            <div
              key={f.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}
            >
              <div>
                <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 3 }}>{f.notes || 'Keine Beschreibung'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(f.date).toLocaleDateString('de-DE')}</div>
              </div>
              <button
                onClick={() => updateCrmFollowUp(f.id, { status: 'erledigt' })}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.10)', color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Erledigt
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
            Notizen {customerNotes.length > 0 && `(${customerNotes.length})`}
          </div>
          <button
            onClick={handleAddNote}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#94a3b8', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m-8-8h16"/>
            </svg>
            Neue Notiz
          </button>
        </div>

        {customerNotes.length === 0 && expandedNoteId === null && (
          <div style={{ fontSize: 12, color: '#334155', padding: '12px 0' }}>
            Noch keine Notizen für diesen Kunden.
          </div>
        )}

        {customerNotes.map(n => (
          <div key={n.id}>
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                background: expandedNoteId === n.id ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${expandedNoteId === n.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                marginBottom: expandedNoteId === n.id ? 0 : 4,
                transition: 'all 0.15s',
              }}
              onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)}
              onMouseEnter={e => { if (expandedNoteId !== n.id) e.currentTarget.style.background = 'rgba(255,255,255,0.055)' }}
              onMouseLeave={e => { if (expandedNoteId !== n.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
            >
              <svg width="13" height="13" fill="none" stroke="#475569" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.title || 'Ohne Titel'}
                </div>
                {n.content && expandedNoteId !== n.id && (
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.content.replace(/[#*`>-]/g, '').trim().slice(0, 60)}
                  </div>
                )}
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteNote(n.id) }}
                style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0, fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#334155'}
              >×</button>
            </div>
            {expandedNoteId === n.id && (
              <InlineNoteEditor
                note={n}
                onClose={() => setExpandedNoteId(null)}
                updateNote={updateNote}
              />
            )}
            {expandedNoteId === n.id && <div style={{ marginBottom: 4 }} />}
          </div>
        ))}
      </div>

      {openTodos.length === 0 && followUps.length === 0 && customerNotes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: 13 }}>
          Keine weiteren offenen Punkte für diesen Kunden.
        </div>
      )}
    </div>
  )
}

// ── Main FocusMode ────────────────────────────────────────────────────────────

export function FocusMode() {
  const customers       = useStore(s => s.customers)
  const todos           = useStore(s => s.todos)
  const emails          = useStore(s => s.emails)
  const crmFollowUps    = useStore(s => s.crmFollowUps)
  const healthScores    = useStore(s => s.healthScores)
  const toggleFocusMode = useStore(s => s.toggleFocusMode)
  const selectCustomer  = useStore(s => s.selectCustomer)

  const [selectedItem, setSelectedItem] = useState(null)
  const [activeSection, setActiveSection] = useState('all')

  const today = new Date().toISOString().slice(0, 10)

  const actionItems = useMemo(() => {
    const items = []

    // Overdue todos
    todos
      .filter(t => !t.completed && !t.archived && t.due && t.due < today && t.customerId !== PRIVAT_ID)
      .forEach(t => {
        const c = customers.find(c => c.id === t.customerId)
        if (!c) return
        items.push({
          type: 'overdue', id: t.id,
          customerId: t.customerId, customerName: c.name,
          title: t.text, prio: t.prio,
          meta: `${daysBetween(t.due, today)}d überfällig`,
          sortKey: 0,
        })
      })

    // Today's todos
    todos
      .filter(t => !t.completed && !t.archived && t.due === today && t.customerId !== PRIVAT_ID)
      .forEach(t => {
        const c = customers.find(c => c.id === t.customerId)
        if (!c) return
        items.push({
          type: 'today', id: t.id,
          customerId: t.customerId, customerName: c.name,
          title: t.text, prio: t.prio,
          meta: 'Heute fällig',
          sortKey: 1,
        })
      })

    // High-priority todos without a due date
    todos
      .filter(t => !t.completed && !t.archived && t.prio === 'high' && !t.due && t.customerId !== PRIVAT_ID)
      .forEach(t => {
        const c = customers.find(c => c.id === t.customerId)
        if (!c) return
        items.push({
          type: 'highprio', id: t.id,
          customerId: t.customerId, customerName: c.name,
          title: t.text, prio: t.prio,
          meta: 'Hohe Priorität',
          sortKey: 2,
        })
      })

    // Unread emails linked to a customer
    emails
      .filter(e => !e.read && e.customerId && e.customerId !== PRIVAT_ID)
      .forEach(e => {
        const c = customers.find(c => c.id === e.customerId)
        if (!c) return
        items.push({
          type: 'email', id: `email-${e.id}`,
          customerId: e.customerId, customerName: c.name,
          title: e.subject || '(Kein Betreff)',
          meta: e.from || '',
          sortKey: 3,
        })
      })

    // Overdue follow-ups
    crmFollowUps
      .filter(f => f.status === 'offen' && f.date <= today)
      .forEach(f => {
        const c = customers.find(c => c.id === f.customerId)
        if (!c) return
        const days = daysBetween(f.date, today)
        items.push({
          type: 'followup', id: f.id,
          customerId: f.customerId, customerName: c.name,
          title: f.notes || 'Follow-Up ausstehend',
          notes: f.notes,
          meta: days > 0 ? `${days}d offen` : 'Heute fällig',
          sortKey: 4,
        })
      })

    // Health drops (score < 60)
    healthScores
      .filter(h => h.score != null && h.score < 60)
      .forEach(h => {
        const c = customers.find(c => c.id === h.customerId)
        if (!c || c.id === PRIVAT_ID) return
        items.push({
          type: 'health', id: `health-${h.customerId}`,
          customerId: h.customerId, customerName: c.name,
          title: `Health Score gefallen: ${h.score}%`,
          meta: h.score < 40 ? 'Kritisch' : 'Warnung',
          sortKey: 5,
        })
      })

    // Inactive customers: CRM status Inaktiv/Lost OR 7+ days no activity
    customers
      .filter(c => c.id !== PRIVAT_ID)
      .forEach(c => {
        const crmInactive = c.status === 'Inaktiv' || c.status === 'Lost'
        const days = daysBetween(c.updatedAt?.slice(0, 10) ?? today, today)
        const touchInactive = days >= 7
        if (crmInactive || touchInactive) {
          const alreadyHasItem = items.some(i => i.customerId === c.id && i.type !== 'inactive')
          if (!alreadyHasItem || crmInactive) {
            items.push({
              type: 'inactive', id: `inactive-${c.id}`,
              customerId: c.id, customerName: c.name,
              title: crmInactive
                ? `CRM-Status: ${c.status}`
                : `Keine Aktivität seit ${days} Tagen`,
              meta: crmInactive ? c.status : `Seit ${days}d inaktiv`,
              sortKey: 6,
            })
          }
        }
      })

    return items.sort((a, b) => a.sortKey - b.sortKey || a.customerName.localeCompare(b.customerName))
  }, [todos, emails, crmFollowUps, healthScores, customers, today])

  const sections = [
    { id: 'all',      label: 'Alle',          count: actionItems.length },
    { id: 'overdue',  label: 'Überfällig',    count: actionItems.filter(i => i.type === 'overdue').length },
    { id: 'today',    label: 'Heute',         count: actionItems.filter(i => i.type === 'today').length },
    { id: 'highprio', label: 'Hoch',          count: actionItems.filter(i => i.type === 'highprio').length },
    { id: 'email',    label: 'E-Mails',       count: actionItems.filter(i => i.type === 'email').length },
    { id: 'followup', label: 'Follow-Up',     count: actionItems.filter(i => i.type === 'followup').length },
    { id: 'health',   label: 'Risiken',       count: actionItems.filter(i => i.type === 'health' || i.type === 'inactive').length },
  ]

  const visibleItems = activeSection === 'all'
    ? actionItems
    : activeSection === 'health'
      ? actionItems.filter(i => i.type === 'health' || i.type === 'inactive')
      : actionItems.filter(i => i.type === activeSection)

  const handleNavigate = (customerId) => {
    toggleFocusMode()
    selectCustomer(customerId)
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, background: '#080811', overflow: 'hidden' }}>

      {/* ── Left action sidebar ── */}
      <div style={{
        width: 340, flexShrink: 0, height: '100%',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.04)',
        background: '#080811',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '24px 20px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="#f59e0b" viewBox="0 0 24 24">
                <path d="M13 2L4.09 12.96A1 1 0 005 14.5h6.5L10 22l9.91-10.96A1 1 0 0019 9.5h-6.5L13 2z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>Handlungsbedarf</div>
              <div style={{ fontSize: 10, color: '#475569' }}>{actionItems.length} Punkte</div>
            </div>
          </div>

          {/* Section filter pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {sections.filter(s => s.count > 0 || s.id === 'all').map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11, fontWeight: 600, transition: 'all 0.12s',
                  background: activeSection === s.id ? 'rgba(245,158,11,0.18)' : 'transparent',
                  border: `1px solid ${activeSection === s.id ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: activeSection === s.id ? '#f59e0b' : '#475569',
                }}
              >
                {s.label} {s.count > 0 && <span style={{ opacity: 0.7 }}>{s.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Items list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {visibleItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#1e293b' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Alles erledigt</div>
            </div>
          ) : (
            visibleItems.map(item => (
              <ActionItem
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onClick={() => setSelectedItem(item)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <FocusDetail item={selectedItem} onNavigate={handleNavigate} />
    </div>
  )
}
