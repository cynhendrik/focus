import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { timeAgo, fmtDate, avGrad, getInitials } from '../../utils/helpers'

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'notizen',    label: 'Notizen' },
  { id: 'aufgaben',   label: 'Aufgaben' },
  { id: 'followups',  label: 'Follow-Ups' },
]

const PRIO_COLOR = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }
const STATUS_BG  = { Lead: 'rgba(139,92,246,0.12)', Aktiv: 'rgba(16,185,129,0.12)', Inaktiv: 'rgba(148,163,184,0.12)', Lost: 'rgba(239,68,68,0.12)' }
const STATUS_FG  = { Lead: '#8b5cf6', Aktiv: '#10b981', Inaktiv: '#94a3b8', Lost: '#ef4444' }

export function CrmCustomerDetail({ customer }) {
  const [tab, setTab] = useState('uebersicht')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: avGrad(customer.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {getInitials(customer.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer.name}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {customer.company || '—'}
              {customer.email && <span style={{ marginLeft: 10 }}>· {customer.email}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {customer.priority && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: (PRIO_COLOR[customer.priority] ?? '#94a3b8') + '22', color: PRIO_COLOR[customer.priority] ?? 'var(--text3)' }}>
                {customer.priority}
              </span>
            )}
            {customer.status && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: STATUS_BG[customer.status] ?? 'var(--bg3)', color: STATUS_FG[customer.status] ?? 'var(--text3)' }}>
                {customer.status}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? 'var(--p)' : 'var(--text3)',
                border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--p)' : 'transparent'}`,
                background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s', marginBottom: -1,
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: 'var(--bg)' }}>
        {tab === 'uebersicht' && <TabUebersicht customer={customer} />}
        {tab === 'notizen'    && <TabNotizen    customerId={customer.id} />}
        {tab === 'aufgaben'   && <TabAufgaben   customerId={customer.id} />}
        {tab === 'followups'  && <TabFollowUps  customerId={customer.id} />}
      </div>
    </div>
  )
}

// ── Tab A: Übersicht ──────────────────────────────────────────────────────────

function TabUebersicht({ customer }) {
  const updateCustomer = useStore(s => s.updateCustomer)
  const deleteCustomer = useStore(s => s.deleteCustomer)
  const crmStatuses    = useStore(s => s.crmSettings.statuses)
  const crmPriorities  = useStore(s => s.crmSettings.priorities)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = (field, val) => updateCustomer(customer.id, { [field]: val })

  return (
    <div style={{ maxWidth: 680 }}>
      <SectionLabel>Kontaktdaten</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        <EditableField label="Name"    value={customer.name}    onSave={v => save('name', v)} />
        <EditableField label="Firma"   value={customer.company} onSave={v => save('company', v)} placeholder="—" />
        <EditableField label="E-Mail"  value={customer.email}   onSave={v => save('email', v)}   placeholder="—" type="email" />
        <EditableField label="Telefon" value={customer.phone}   onSave={v => save('phone', v)}   placeholder="—" />
      </div>

      <SectionLabel>CRM-Daten</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        <EditableSelect label="Status"   value={customer.status}   options={crmStatuses}   onSave={v => save('status', v)} />
        <EditableSelect label="Priorität" value={customer.priority} options={crmPriorities} onSave={v => save('priority', v)} emptyLabel="—" />
      </div>

      <SectionLabel>Notiz</SectionLabel>
      <EditableTextarea value={customer.quickNote} placeholder="Freitext-Notiz zu diesem Kunden…" onSave={v => save('quickNote', v)} />

      <SectionLabel style={{ marginTop: 24 }}>Metadaten</SectionLabel>
      <div style={{ display: 'flex', gap: 28, marginBottom: 32 }}>
        <MetaItem label="Angelegt"         value={fmtDate(customer.createdAt)} />
        <MetaItem label="Letzte Aktivität" value={timeAgo(customer.updatedAt)} />
        {customer.category && <MetaItem label="Kategorie" value={customer.category} />}
      </div>

      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          style={{ padding: '7px 16px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text4)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >Kunde löschen</button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, flex: 1 }}>Wirklich löschen? Alle Daten werden entfernt.</span>
          <button onClick={() => deleteCustomer(customer.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r-md)', background: 'var(--red)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Löschen</button>
          <button onClick={() => setConfirmDelete(false)} style={{ padding: '5px 10px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
        </div>
      )}
    </div>
  )
}

// ── Tab B: Notizen ────────────────────────────────────────────────────────────

function TabNotizen({ customerId }) {
  const rawNotes   = useStore(s => s.notes.filter(n => n.customerId === customerId))
  const addNote    = useStore(s => s.addNote)
  const updateNote = useStore(s => s.updateNote)
  const deleteNote = useStore(s => s.deleteNote)

  const notes = [...rawNotes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  const [expandedId, setExpandedId] = useState(null)
  const [editContent, setEditContent] = useState({})
  const timerRef = useRef({})

  const handleAdd = () => {
    const n = addNote(customerId)
    setExpandedId(n.id)
    setEditContent(p => ({ ...p, [n.id]: '' }))
  }

  const handleContentChange = (id, val) => {
    setEditContent(p => ({ ...p, [id]: val }))
    clearTimeout(timerRef.current[id])
    timerRef.current[id] = setTimeout(() => updateNote(id, { content: val }), 600)
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{notes.length} Notiz{notes.length !== 1 ? 'en' : ''}</span>
        <button onClick={handleAdd} style={addBtnStyle}>+ Neue Notiz</button>
      </div>

      {notes.length === 0 ? (
        <EmptyTabMsg icon="📝" text="Noch keine Notizen für diesen Kunden." />
      ) : notes.map(n => {
        const expanded = expandedId === n.id
        const content  = editContent[n.id] ?? n.content ?? ''
        return (
          <div key={n.id} style={{ marginBottom: 8, borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg1)', overflow: 'hidden' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', gap: 10 }}
              onClick={() => setExpandedId(expanded ? null : n.id)}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text4)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title || 'Ohne Titel'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text4)', flexShrink: 0 }}>{timeAgo(n.updatedAt)}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteNote(n.id); if (expanded) setExpandedId(null) }}
                style={{ padding: '2px 6px', borderRadius: 'var(--r-sm)', background: 'transparent', border: 'none', color: 'var(--text4)', fontSize: 11, cursor: 'pointer' }}
              >✕</button>
            </div>
            {expanded && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '0 14px 14px' }}>
                <input
                  value={n.title || ''}
                  onChange={e => updateNote(n.id, { title: e.target.value })}
                  placeholder="Titel…"
                  style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'inherit', padding: '10px 0 8px' }}
                />
                <textarea
                  value={content}
                  onChange={e => handleContentChange(n.id, e.target.value)}
                  placeholder="Notizinhalt…"
                  rows={6}
                  style={{ width: '100%', resize: 'vertical', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', lineHeight: 1.7 }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab C: Aufgaben ───────────────────────────────────────────────────────────

function TabAufgaben({ customerId }) {
  const todos      = useStore(s => s.todos.filter(t => t.customerId === customerId && !t.archived))
  const addTodo    = useStore(s => s.addTodo)
  const toggleTodo = useStore(s => s.toggleTodo)
  const deleteTodo = useStore(s => s.deleteTodo)

  const [adding, setAdding] = useState(false)
  const [form,   setForm]   = useState({ text: '', due: '', prio: 'mid' })

  const handleAdd = () => {
    if (!form.text.trim()) return
    addTodo(customerId, form.text, form.prio, form.due || null)
    setForm({ text: '', due: '', prio: 'mid' })
    setAdding(false)
  }

  const open = todos.filter(t => !t.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const done = todos.filter(t =>  t.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{open.length} offen · {done.length} erledigt</span>
        <button onClick={() => setAdding(p => !p)} style={addBtnStyle}>+ Neue Aufgabe</button>
      </div>

      {adding && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg1)' }}>
          <input
            value={form.text}
            onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
            placeholder="Aufgabentitel…"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', paddingBottom: 8, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              value={form.due}
              onChange={e => setForm(f => ({ ...f, due: e.target.value }))}
              style={{ padding: '5px 8px', borderRadius: 'var(--r-sm)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <select
              value={form.prio}
              onChange={e => setForm(f => ({ ...f, prio: e.target.value }))}
              style={{ padding: '5px 8px', borderRadius: 'var(--r-sm)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="low">Low</option>
              <option value="mid">Medium</option>
              <option value="high">High</option>
            </select>
            <button onClick={handleAdd} style={{ marginLeft: 'auto', padding: '5px 14px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Anlegen</button>
            <button onClick={() => setAdding(false)} style={{ padding: '5px 10px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
          </div>
        </div>
      )}

      {open.length === 0 && done.length === 0 && !adding ? (
        <EmptyTabMsg icon="✅" text="Keine Aufgaben für diesen Kunden." />
      ) : (
        <>
          {open.map(t => <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onDelete={deleteTodo} />)}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)', margin: '16px 0 8px' }}>Erledigt</div>
              {done.map(t => <TodoRow key={t.id} todo={t} onToggle={toggleTodo} onDelete={deleteTodo} />)}
            </>
          )}
        </>
      )}
    </div>
  )
}

function TodoRow({ todo, onToggle, onDelete }) {
  const PRIO = { high: '#ef4444', mid: '#f59e0b', low: '#22c55e' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg1)', marginBottom: 6 }}>
      <button
        onClick={() => onToggle(todo.id)}
        style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: todo.completed ? 'var(--p)' : 'transparent',
          border: `2px solid ${todo.completed ? 'var(--p)' : 'var(--border2)'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
      >
        {todo.completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <span style={{ flex: 1, fontSize: 13, color: todo.completed ? 'var(--text4)' : 'var(--text)', textDecoration: todo.completed ? 'line-through' : 'none', fontWeight: todo.completed ? 400 : 500 }}>
        {todo.text}
      </span>
      {todo.due && <span style={{ fontSize: 11, color: 'var(--text4)', flexShrink: 0 }}>{fmtDate(todo.due)}</span>}
      {todo.prio && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0, background: (PRIO[todo.prio] ?? '#94a3b8') + '22', color: PRIO[todo.prio] ?? 'var(--text4)' }}>
          {todo.prio.toUpperCase()}
        </span>
      )}
      <button onClick={() => onDelete(todo.id)} style={{ padding: '2px 5px', borderRadius: 'var(--r-sm)', background: 'transparent', border: 'none', color: 'var(--text4)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
    </div>
  )
}

// ── Tab D: Follow-Ups (per customer) ─────────────────────────────────────────

function TabFollowUps({ customerId }) {
  const followUps      = useStore(s => s.crmFollowUps.filter(f => f.customerId === customerId).sort((a, b) => new Date(a.date) - new Date(b.date)))
  const addFollowUp    = useStore(s => s.addCrmFollowUp)
  const updateFollowUp = useStore(s => s.updateCrmFollowUp)
  const deleteFollowUp = useStore(s => s.deleteCrmFollowUp)

  const [adding, setAdding] = useState(false)
  const [form, setForm]     = useState({ date: '', notes: '', status: 'offen' })

  const handleAdd = () => {
    if (!form.date) return
    addFollowUp(customerId, { date: form.date, notes: form.notes, status: form.status })
    setForm({ date: '', notes: '', status: 'offen' })
    setAdding(false)
  }

  const open = followUps.filter(f => f.status === 'offen')
  const done = followUps.filter(f => f.status === 'erledigt')

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{open.length} offen · {done.length} erledigt</span>
        <button onClick={() => setAdding(p => !p)} style={addBtnStyle}>+ Neuer Follow-Up</button>
      </div>

      {adding && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg1)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Datum *</FieldLabel>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                autoFocus
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Status</FieldLabel>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              >
                <option value="offen">Offen</option>
                <option value="erledigt">Erledigt</option>
              </select>
            </div>
          </div>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notiz zum Follow-Up…"
            rows={2}
            style={{ width: '100%', resize: 'none', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', lineHeight: 1.6, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={handleAdd} style={{ padding: '6px 16px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Anlegen</button>
            <button onClick={() => setAdding(false)} style={{ padding: '6px 12px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
          </div>
        </div>
      )}

      {followUps.length === 0 && !adding ? (
        <EmptyTabMsg icon="📅" text="Keine Follow-Ups für diesen Kunden." />
      ) : (
        <>
          {open.map(f => <FollowUpRow key={f.id} followUp={f} onUpdate={updateFollowUp} onDelete={deleteFollowUp} />)}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)', margin: '16px 0 8px' }}>Erledigt</div>
              {done.map(f => <FollowUpRow key={f.id} followUp={f} onUpdate={updateFollowUp} onDelete={deleteFollowUp} />)}
            </>
          )}
        </>
      )}
    </div>
  )
}

function FollowUpRow({ followUp, onUpdate, onDelete }) {
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes]         = useState(followUp.notes ?? '')
  const done = followUp.status === 'erledigt'
  const today = new Date().toISOString().slice(0, 10)
  const overdue = !done && followUp.date < today

  return (
    <div style={{ marginBottom: 8, borderRadius: 'var(--r-md)', border: `1px solid ${overdue ? 'rgba(239,68,68,0.25)' : done ? 'var(--border)' : 'rgba(124,58,237,0.15)'}`, background: 'var(--bg1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <button
          onClick={() => onUpdate(followUp.id, { status: done ? 'offen' : 'erledigt' })}
          style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            background: done ? 'var(--p)' : 'transparent',
            border: `2px solid ${done ? 'var(--p)' : overdue ? 'var(--red)' : 'rgba(124,58,237,0.5)'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          }}
        >
          {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--text4)' : overdue ? 'var(--red)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', flexShrink: 0 }}>
            {fmtDate(followUp.date)}
          </span>
          {overdue && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>Überfällig</span>}
          {!editNotes && followUp.notes && (
            <span style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              — {followUp.notes}
            </span>
          )}
        </div>

        <button onClick={() => setEditNotes(p => !p)} style={{ padding: '2px 8px', borderRadius: 'var(--r-sm)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text4)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          {editNotes ? 'Schließen' : 'Notiz'}
        </button>
        <button onClick={() => onDelete(followUp.id)} style={{ padding: '2px 5px', borderRadius: 'var(--r-sm)', background: 'transparent', border: 'none', color: 'var(--text4)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </div>

      {editNotes && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notiz zum Follow-Up…"
            rows={2}
            autoFocus
            style={{ width: '100%', resize: 'none', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { onUpdate(followUp.id, { notes }); setEditNotes(false) }} style={{ padding: '4px 12px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Speichern</button>
            <button onClick={() => setEditNotes(false)} style={{ padding: '4px 10px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children, style }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, ...style }}>{children}</div>
}

function MetaItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>{value || '—'}</div>
    </div>
  )
}

function FieldLabel({ children }) {
  return <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 5 }}>{children}</label>
}

function EditableField({ label, value, onSave, type = 'text', placeholder = '' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value ?? '')

  useEffect(() => { setVal(value ?? '') }, [value])

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {editing ? (
        <input
          type={type}
          value={val}
          onChange={e => setVal(e.target.value)}
          autoFocus
          onBlur={() => { onSave(val); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { onSave(val); setEditing(false) } }}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid rgba(124,58,237,0.5)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{ padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', color: val ? 'var(--text)' : 'var(--text4)', fontSize: 13, cursor: 'text', minHeight: 36 }}
        >
          {val || placeholder || '—'}
        </div>
      )}
    </div>
  )
}

function EditableSelect({ label, value, options, onSave, emptyLabel }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value ?? ''}
        onChange={e => onSave(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
      >
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function EditableTextarea({ value, onSave, placeholder }) {
  const [val, setVal] = useState(value ?? '')
  const timerRef      = useRef(null)

  useEffect(() => { setVal(value ?? '') }, [value])

  const handleChange = (v) => {
    setVal(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSave(v), 600)
  }

  return (
    <textarea
      value={val}
      onChange={e => handleChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      style={{ width: '100%', resize: 'vertical', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none', lineHeight: 1.7 }}
    />
  )
}

function EmptyTabMsg({ icon, text }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text4)' }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  )
}

const addBtnStyle = {
  padding: '6px 14px', borderRadius: 'var(--r-pill)', fontSize: 11, fontWeight: 700,
  background: 'var(--p5)', border: '1px solid var(--border3)', color: 'var(--p)',
  cursor: 'pointer', fontFamily: 'inherit',
}
