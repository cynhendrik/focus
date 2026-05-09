import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerCard } from '@/components/customer/CustomerCard'
import { CustomerModal } from '@/components/customer/CustomerModal'

export function Sidebar() {
  const customers = useCustomersStore(s => s.customers)
  const isLoading = useCustomersStore(s => s.isLoading)
  const selectedId = useUiStore(s => s.selectedCustomerId)
  const appView = useUiStore(s => s.appView)
  const focusMode = useUiStore(s => s.focusMode)
  const theme = useUiStore(s => s.theme)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const setAppView = useUiStore(s => s.setAppView)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const setCmdOpen = useUiStore(s => s.setCmdPaletteOpen)

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = customers
    .filter(c => focusMode ? c.priority === 'high' : true)
    .filter(c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? '').toLowerCase().includes(search.toLowerCase())
    )

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)] flex-1">
          {focusMode ? '🎯 Fokus' : 'Focus'}
        </span>
        <button
          onClick={() => setCmdOpen(true)}
          title="Suche (Ctrl+K)"
          className="p-1.5 rounded-lg text-[var(--text2)] hover:bg-[var(--bg1)] text-xs"
        >
          ⌘K
        </button>
        <button
          onClick={toggleTheme}
          title="Theme wechseln"
          className="p-1.5 rounded-lg text-[var(--text2)] hover:bg-[var(--bg1)] text-sm"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Kunden suchen…"
          className="w-full text-xs px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Customer list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-[var(--text2)]">Lädt…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--text2)]">
            {customers.length === 0 ? 'Noch keine Kunden' : 'Keine Treffer'}
          </div>
        ) : (
          filtered.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelected={selectedId === customer.id}
              onClick={setSelected}
            />
          ))
        )}
      </div>

      {/* Add customer button */}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          + Neuer Kunde
        </button>
      </div>

      {/* Bottom nav */}
      <div className="px-3 pb-3 flex flex-col gap-1">
        <button
          onClick={toggleFocusMode}
          className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors
            ${focusMode ? 'bg-primary/10 text-primary font-medium' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          {focusMode ? '✓ Fokus-Modus aktiv' : '🎯 Fokus-Modus'}
        </button>
        <button
          onClick={() => setAppView('mail')}
          className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors
            ${appView === 'mail' ? 'bg-primary/10 text-primary font-medium' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          ✉ E-Mails
        </button>
        <button
          onClick={() => setAppView('company')}
          className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors
            ${appView === 'company' ? 'bg-primary/10 text-primary font-medium' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          🏢 Mein Unternehmen
        </button>
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </aside>
  )
}
