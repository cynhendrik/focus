import { useEffect, useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { detectLegacyData, buildImportPayloads, clearLegacyData } from '@/lib/migration'

type Step = 'idle' | 'prompt' | 'importing' | 'done'

export function MigrationWizard() {
  const migrationDone = useUiStore(s => s.migrationDone)
  const markMigrationDone = useUiStore(s => s.markMigrationDone)
  const upsert = useCustomersStore(s => s.upsert)
  const [step, setStep] = useState<Step>('idle')
  const [count, setCount] = useState(0)
  const [imported, setImported] = useState(0)

  useEffect(() => {
    if (migrationDone) return
    const legacy = detectLegacyData()
    if (!legacy) { markMigrationDone(); return }
    setCount(legacy.customers?.length ?? 0)
    setStep('prompt')
  }, [])

  if (step === 'idle' || step === 'done') return null

  const handleImport = async () => {
    const legacy = detectLegacyData()
    if (!legacy) { setStep('done'); markMigrationDone(); return }
    setStep('importing')
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const payloads = buildImportPayloads(legacy, workspaceId, createdBy)
    let n = 0
    for (const payload of payloads) {
      try { await upsert(payload); n++ } catch { /* skip duplicates */ }
    }
    clearLegacyData()
    setImported(n)
    markMigrationDone()
    setStep('done')
  }

  const handleSkip = () => {
    clearLegacyData()
    markMigrationDone()
    setStep('done')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--bg)] rounded-2xl p-8 w-[420px] shadow-2xl flex flex-col gap-5">
        {step === 'prompt' && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Alte Daten gefunden</h2>
              <p className="text-sm text-[var(--text2)] mt-1">
                Es wurden {count} Kunden aus der alten Version erkannt. Sollen diese in Focus 2.0 importiert werden?
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg1)] text-xs text-[var(--text2)]">
              Importiert werden: Kundennamen, Unternehmen, E-Mail, Telefon, Status, Priorität, Tags.
            </div>
            <div className="flex gap-3">
              <button onClick={handleImport} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">
                {count} Kunden importieren
              </button>
              <button onClick={handleSkip} className="px-4 py-2 rounded-lg text-sm text-[var(--text2)] hover:text-[var(--text)]">
                Überspringen
              </button>
            </div>
          </>
        )}
        {step === 'importing' && (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">⏳</div>
            <p className="text-sm text-[var(--text2)]">Importiere Daten…</p>
          </div>
        )}
      </div>
    </div>
  )
}
