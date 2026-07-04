/**
 * Orchestriert die Vorbereitung: Quellen einsammeln → Karten generieren (pure) →
 * idempotent persistieren → aufgelöste Quellen schließen → Store aktualisieren.
 * Läuft beim Start und stündlich (usePreparationTick). 100 % deterministisch.
 */
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'
import { generateCardDrafts, reconcileResolvedIds, type GenerateInput } from '@/lib/stapel/generate'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useStapelSettingsStore } from '@/store/stapel-settings.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useLeadsStore } from '@/store/leads.store'
import { useCompanyStore } from '@/store/company.store'
import { DEFAULT_DUNNING_FEES } from '@/services/dunning.service'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import { log } from '@/lib/logger'

let running = false

export async function runPreparation(workspaceId: string): Promise<void> {
  if (running) return
  running = true
  try {
    if (useWorkspaceStore.getState().activeWorkspaceId !== workspaceId) return
    // Fällige Sequenz-Schritte (lokale Queue) — Ausfall darf die übrige
    // Vorbereitung nicht blockieren.
    const queueItems = await FollowUpQueueService.getDue(workspaceId).catch(err => {
      log.warn('getDue follow-up queue failed', { err })
      return []
    })
    const input: GenerateInput = {
      workspaceId,
      invoices: useFinanceStore.getState().invoices.filter(i => i.workspaceId === workspaceId),
      todos: useTodosStore.getState().allTodos,
      followUps: useCrmStore.getState().allFollowUps,
      accounts: useAccountsStore.getState().accounts.map(a => ({ id: a.id, name: a.name })),
      leads: useLeadsStore.getState().leads.map(l => ({ id: l.id, name: l.name })),
      payments: useFinanceStore.getState().payments,
      fees: useCompanyStore.getState().profile.dunningFees ?? DEFAULT_DUNNING_FEES,
      suppressedRuleIds: useStapelSettingsStore.getState().suppressedRuleIds,
      queueItems,
      todayIso: new Date().toLocaleDateString('sv'),
    }

    if (useWorkspaceStore.getState().activeWorkspaceId !== workspaceId) return
    for (const card of generateCardDrafts(input)) {
      await PreparedItemsGateway.insertIgnore(card)
    }

    if (useWorkspaceStore.getState().activeWorkspaceId !== workspaceId) return
    const active = await PreparedItemsGateway.listActive(workspaceId)
    for (const id of reconcileResolvedIds(active, input)) {
      // Quelle hat sich außerhalb des Stapels erledigt — zählt nicht als Freigabe (Wochensumme bleibt ehrlich).
      await PreparedItemsGateway.updateStatus(id, 'resolved', { approvedAt: null })
    }

    await usePreparedItemsStore.getState().load(workspaceId)
  } catch (err) {
    log.warn('runPreparation failed', { err })
  } finally {
    running = false
  }
}
