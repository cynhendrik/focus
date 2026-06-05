import { useState } from 'react'
import { CustomerNotesPanel } from '@/components/notes/CustomerNotesPanel'
import { CustomerNotesPane }  from '@/components/notes/CustomerNotesPane'

export function NotesRoute() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <CustomerNotesPanel
        selectedId={selectedAccountId}
        onSelect={setSelectedAccountId}
      />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {selectedAccountId ? (
          <CustomerNotesPane accountId={selectedAccountId} />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--fg-dim)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.2 }}>✎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Kunden auswählen
            </div>
            <div style={{ fontSize: 12 }}>Links einen Kunden wählen um Notizen zu sehen</div>
          </div>
        )}
      </div>
    </div>
  )
}
