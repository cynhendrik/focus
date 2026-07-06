import type { Lead, LeadStage } from '@/types/lead.types'

/**
 * Nav-Badge "Leads": zählt Leads in der ersten offenen Stage (nicht
 * qualifiziert/disqualifiziert). `stages` muss bereits nach orderIndex
 * aufsteigend sortiert sein (so liefert es useLeadStagesStore).
 */
export function countLeadsInFirstOpenStage(leads: Lead[], stages: LeadStage[]): number {
  const firstOpen = stages.find(s => !s.isQualified && !s.isDisqualified)
  if (!firstOpen) return 0
  return leads.filter(l => l.leadStatus === firstOpen.name).length
}
