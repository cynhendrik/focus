/**
 * Orchestriert die Vorbereitung: Quellen einsammeln → Karten generieren (pure) →
 * idempotent persistieren → aufgelöste Quellen schließen → Store aktualisieren.
 * Läuft beim Start und stündlich (usePreparationTick). 100 % deterministisch.
 */
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'
import { generateCardDrafts, reconcileResolvedIds, type GenerateInput } from '@/lib/stapel/generate'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'
import { DEFAULT_DUNNING_FEES } from '@/services/dunning.service'
import { log } from '@/lib/logger'

let running = false

export async function runPreparation(workspaceId: string, suppressedRuleIds: string[] = []): Promise<void> {
  if (running) return
  running = true
  try {
    const input: GenerateInput = {
      workspaceId,
      invoices: useFinanceStore.getState().invoices,
      todos: useTodosStore.getState().allTodos,
      followUps: useCrmStore.getState().allFollowUps,
      accounts: useAccountsStore.getState().accounts.map(a => ({ id: a.id, name: a.name })),
      leads: useLeadsStore.getState().leads.map(l => ({ id: l.id, name: l.name })),
      payments: useFinanceStore.getState().payments,
      fees: useCompanyStore.getState().profile.dunningFees ?? DEFAULT_DUNNING_FEES,
      suppressedRuleIds,
      todayIso: new Date().toLocaleDateString('sv'),
    }

    for (const card of generateCardDrafts(input)) {
      await PreparedItemsGateway.insertIgnore(card)
    }

    const active = await PreparedItemsGateway.listActive(workspaceId)
    for (const id of reconcileResolvedIds(active, input)) {
      // Erledigung außerhalb des Stapels ist kein Verwerfen → approved ohne Versand.
      await PreparedItemsGateway.updateStatus(id, 'approved', { approvedAt: new Date().toISOString() })
    }

    await usePreparedItemsStore.getState().load(workspaceId)
  } catch (err) {
    log.warn('runPreparation failed', { err })
  } finally {
    running = false
  }
}
