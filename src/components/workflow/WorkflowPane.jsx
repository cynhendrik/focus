import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import { TodoPane } from '../todos/TodoPane'
import { NotesPane } from '../notes/NotesPane'
import { KpisPane } from '../kpis/KpisPane'

const TodoIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
)
const NoteIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h4"/>
  </svg>
)
const KpiIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
  </svg>
)

export function WorkflowPane({ customerId }) {
  const [activeTab, setActiveTab] = useState('todos')

  const todos  = useStore(s => s.todos)
  const notes  = useStore(s => s.notes)
  const kpis   = useStore(s => s.kpis)

  const openTodosCount = useMemo(() => todos.filter(t => t.customerId === customerId && !t.completed && !t.archived).length, [todos, customerId])
  const notesCount     = useMemo(() => notes.filter(n => n.customerId === customerId).length, [notes, customerId])
  const kpisCount      = useMemo(() => kpis.filter(k => k.customerId === customerId).length, [kpis, customerId])

  const tabs = [
    { id: 'todos',  label: 'To-Dos',  icon: <TodoIcon />, count: openTodosCount },
    { id: 'notes',  label: 'Notizen', icon: <NoteIcon />, count: notesCount },
    { id: 'kpis',   label: 'KPIs',    icon: <KpiIcon />,  count: kpisCount },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tab bar */}
      <div style={{ padding: '16px 28px 0', flexShrink: 0 }}>
        <div style={{
          display: 'inline-flex', gap: 2,
          background: 'var(--bg1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 4,
          boxShadow: 'var(--shadow-sm)',
        }}>
          {tabs.map(tab => {
            const active = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 'var(--r-lg)',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? 'var(--bg)' : 'transparent',
                  color: active ? 'var(--p)' : 'var(--text3)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)' }}
              >
                {tab.icon}
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    minWidth: 18, height: 18, borderRadius: 99,
                    background: active ? 'var(--p)' : 'var(--bg3)',
                    color: active ? '#fff' : 'var(--text3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 5px', transition: 'all 0.15s',
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', marginTop: 4 }}>
        {activeTab === 'todos' && <TodoPane customerId={customerId} />}
        {activeTab === 'notes' && <NotesPane customerId={customerId} />}
        {activeTab === 'kpis'  && <KpisPane customerId={customerId} />}
      </div>
    </div>
  )
}
