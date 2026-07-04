import { describe, it, expect } from 'vitest'
import { pipelinePotential } from './pipeline-potential'
import type { Deal, PipelineStage } from '@/types/pipeline.types'

const deal = (stage: string, value?: number): Deal =>
  ({ id: 'd', workspaceId: 'ws', createdBy: 'u', accountId: 'a', title: 'T', stage, value, currency: 'EUR', createdAt: '', updatedAt: '' } as Deal)
const stg = (name: string, isWon = false, isLost = false): PipelineStage =>
  ({ id: name, workspaceId: 'ws', name, label: name, orderIndex: 0, color: '', isWon, isLost, createdAt: '', updatedAt: '' })

describe('pipelinePotential', () => {
  it('summiert offene Deals; won/lost via Flags ausgeschlossen — auch umbenannt', () => {
    const stages = [stg('lead'), stg('abschluss', true), stg('verloren', false, true)]
    const sum = pipelinePotential([
      deal('lead', 1500), deal('lead', 500),
      deal('abschluss', 9999), deal('verloren', 9999),
    ], stages)
    expect(sum).toBe(2000)
  })
  it('Deals ohne Wert zählen 0; unbekannte Stage: Namens-Fallback won/lost', () => {
    expect(pipelinePotential([deal('lead'), deal('won', 500), deal('lost', 500)], [])).toBe(0)
  })
})
