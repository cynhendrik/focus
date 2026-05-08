import { useState, useEffect, useCallback, Component } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store'
import { PRIVAT_ID } from './store'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/layout/Sidebar'
import { IntroScreen } from './components/intro/IntroScreen'
import { ClientOverview } from './components/overview/ClientOverview'
import { CustomerView } from './components/customer/CustomerView'
import { Modal } from './components/ui/Modal'
import { ToastProvider } from './components/ui/Toast'
import { MeinUnternehmen } from './components/company/MeinUnternehmen'
import { GlobalCRM } from './components/crm/GlobalCRM'
import { TimeEntryModal } from './components/time/TimeEntryModal'
import { FocusMode } from './components/focus/FocusMode'
import { GlobalMailClient } from './components/mail/GlobalMailClient'
import { NotesPane } from './components/notes/NotesPane'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 }}>
          <div style={{ fontSize: 28 }}>⚠</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Etwas ist schiefgelaufen</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 360, textAlign: 'center' }}>{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 4, padding: '8px 22px', borderRadius: 8, background: 'var(--p)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
          >Neu laden</button>
        </div>
      )
    }
    return this.props.children
  }
}

function PrivatNotesPanel({ open, onClose }) {
  const setSelectedNoteId = useStore(s => s.setSelectedNoteId)
  const handleClose = () => { setSelectedNoteId(null); onClose() }
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 295,
      width: 520, background: 'var(--bg1)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 48px rgba(0,0,0,0.22)',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" fill="none" stroke="var(--text3)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Privat · Notizen</span>
        </div>
        <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}>×</button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <NotesPane customerId={PRIVAT_ID} />
      </div>
    </div>
  )
}

function FloatingThemeToggle() {
  const theme       = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Light Mode' : 'Dark Mode'}
      style={{
        position: 'fixed', bottom: 18, right: 18, zIndex: 200,
        width: 38, height: 38, borderRadius: '50%',
        background: isDark ? 'rgba(255,255,255,0.12)' : 'var(--bg2)',
        border: isDark ? '1.5px solid rgba(255,255,255,0.3)' : '1px solid var(--border2)',
        color: isDark ? '#f0e8c8' : 'var(--text3)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
        boxShadow: isDark ? '0 2px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)' : '0 2px 12px rgba(0,0,0,0.12)',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.22)' : 'var(--bg3)'
        e.currentTarget.style.color = isDark ? '#fff' : 'var(--p)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'var(--bg2)'
        e.currentTarget.style.color = isDark ? '#f0e8c8' : 'var(--text3)'
      }}
    >
      {isDark ? '☀' : '☾'}
    </button>
  )
}

function FieldRow({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text3)', marginBottom: 6,
      }}>
        {label}
      </label>
      <input
        {...props}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)',
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
          outline: 'none', transition: 'border-color 0.15s',
          ...props.style,
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border2)'}
      />
    </div>
  )
}

export default function App() {
  const selectedId            = useStore(s => s.selectedId)
  const customers             = useStore(s => s.customers)
  const theme                 = useStore(s => s.theme)
  const addCustomer           = useStore(s => s.addCustomer)
  const companyView           = useStore(s => s.companyView)
  const crmStatuses           = useStore(s => s.crmSettings.statuses)
  const ensurePrivatCustomer  = useStore(s => s.ensurePrivatCustomer)
  const focusMode             = useStore(s => s.focusMode)

  const [showIntro,        setShowIntro]        = useState(true)
  const [addOpen,          setAddOpen]          = useState(false)
  const [timeEntryOpen,    setTimeEntryOpen]    = useState(false)
  const [privatNotesOpen,  setPrivatNotesOpen]  = useState(false)
  const [timeEntryDefaultCustomer, setTimeEntryDefaultCustomer] = useState(null)
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', category: '', status: 'Aktiv' })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    ensurePrivatCustomer()
  }, [])

  const hasCustomer   = !!customers.find(c => c.id === selectedId)
  const isCrmView     = companyView === 'crm-kunden' || companyView === 'crm-followups'
  const isMailView    = companyView === 'mail'
  const isCompanyView = !isCrmView && !isMailView && companyView !== null

  const handleAdd = useCallback(() => {
    if (!form.name.trim()) return
    addCustomer(form)
    setForm({ name: '', company: '', email: '', phone: '', category: '', status: 'aktiv' })
    setAddOpen(false)
  }, [form, addCustomer])

  const openNewClient  = useCallback(() => setAddOpen(true), [])
  const openTimeEntry  = useCallback((customerId = null) => {
    setTimeEntryDefaultCustomer(customerId ?? selectedId ?? null)
    setTimeEntryOpen(true)
  }, [selectedId])

  if (showIntro) {
    return (
      <ToastProvider>
        <IntroScreen onEnter={() => setShowIntro(false)} />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
        <TopBar onNewClient={openNewClient} onTimeEntry={() => openTimeEntry()} onPrivatNotes={() => setPrivatNotesOpen(p => !p)} privatNotesOpen={privatNotesOpen} />
        <PrivatNotesPanel open={privatNotesOpen} onClose={() => setPrivatNotesOpen(false)} />

        {focusMode ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <FocusMode />
          </div>
        ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar onNewClient={openNewClient} />

          {/* Floating theme toggle — bottom right */}
          <FloatingThemeToggle />
          <ErrorBoundary>
          <AnimatePresence mode="wait">
            {isCrmView ? (
              <motion.div
                key="crm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
              >
                <GlobalCRM />
              </motion.div>
            ) : isMailView ? (
              <motion.div
                key="mail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
              >
                <GlobalMailClient />
              </motion.div>
            ) : isCompanyView ? (
              <motion.div
                key="company"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
              >
                <MeinUnternehmen />
              </motion.div>
            ) : !hasCustomer ? (
              <motion.div
                key="overview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
              >
                <ClientOverview onNewClient={openNewClient} onTimeEntry={openTimeEntry} />
              </motion.div>
            ) : (
              <motion.div
                key={selectedId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ flex: 1, overflow: 'hidden', display: 'flex' }}
              >
                <CustomerView customerId={selectedId} onTimeEntry={openTimeEntry} />
              </motion.div>
            )}
          </AnimatePresence>
          </ErrorBoundary>
        </div>
        )}

        <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Neuer Kunde">
          <FieldRow
            label="Name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Max Mustermann"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <FieldRow
            label="Firma"
            value={form.company}
            onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
            placeholder="Muster GmbH"
          />
          <FieldRow
            label="Kategorie"
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            placeholder="z.B. Buchhaltung"
          />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
              Status
            </label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            >
              {crmStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <FieldRow
            label="E-Mail"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="max@firma.de"
            type="email"
          />
          <FieldRow
            label="Telefon"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+49 123 456789"
            style={{ marginBottom: 4 }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={handleAdd}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 'var(--r-md)',
                background: 'var(--p)', border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
            >
              Anlegen
            </button>
            <button
              onClick={() => setAddOpen(false)}
              style={{
                padding: '10px 16px', borderRadius: 'var(--r-md)',
                background: 'transparent', border: '1px solid var(--border2)',
                color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Abbrechen
            </button>
          </div>
        </Modal>

        <TimeEntryModal
          open={timeEntryOpen}
          onClose={() => setTimeEntryOpen(false)}
          defaultCustomerId={timeEntryDefaultCustomer}
        />
      </div>
    </ToastProvider>
  )
}
