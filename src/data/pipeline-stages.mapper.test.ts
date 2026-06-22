import { describe, it, expect } from 'vitest'
import { pipelineStageRowToStage, pipelineStageToRow } from './pipeline-stages.mapper'

const row = {
  id: 'ps-1',
  workspace_id: 'ws-1',
  name: 'won',
  label: 'Gewonnen',
  order_index: 3,
  color: '#22C55E',
  is_won: 1,
  is_lost: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

describe('pipeline-stages.mapper', () => {
  describe('pipelineStageRowToStage', () => {
    it('maps snake_case → camelCase', () => {
      const s = pipelineStageRowToStage(row)
      expect(s.id).toBe('ps-1')
      expect(s.workspaceId).toBe('ws-1')
      expect(s.name).toBe('won')
      expect(s.label).toBe('Gewonnen')
      expect(s.orderIndex).toBe(3)
      expect(s.color).toBe('#22C55E')
      expect(s.createdAt).toBe('2026-01-01T00:00:00Z')
      expect(s.updatedAt).toBe('2026-06-01T00:00:00Z')
    })

    it('maps smallint is_won 1 → true', () => {
      const s = pipelineStageRowToStage({ ...row, is_won: 1 })
      expect(s.isWon).toBe(true)
    })

    it('maps smallint is_won 0 → false', () => {
      const s = pipelineStageRowToStage({ ...row, is_won: 0 })
      expect(s.isWon).toBe(false)
    })

    it('maps smallint is_lost 1 → true', () => {
      const s = pipelineStageRowToStage({ ...row, is_lost: 1 })
      expect(s.isLost).toBe(true)
    })

    it('maps smallint is_lost 0 → false', () => {
      const s = pipelineStageRowToStage({ ...row, is_lost: 0 })
      expect(s.isLost).toBe(false)
    })

    it('also maps boolean true for is_won (pg native bool)', () => {
      const s = pipelineStageRowToStage({ ...row, is_won: true })
      expect(s.isWon).toBe(true)
    })

    it('also maps boolean false for is_lost (pg native bool)', () => {
      const s = pipelineStageRowToStage({ ...row, is_lost: false })
      expect(s.isLost).toBe(false)
    })

    it('defaults orderIndex to 0 when null', () => {
      const s = pipelineStageRowToStage({ ...row, order_index: null })
      expect(s.orderIndex).toBe(0)
    })

    it('defaults color to #6B7280 when null', () => {
      const s = pipelineStageRowToStage({ ...row, color: null })
      expect(s.color).toBe('#6B7280')
    })
  })

  describe('pipelineStageToRow', () => {
    it('maps camelCase → snake_case', () => {
      const r = pipelineStageToRow({
        id: 'ps-1', workspaceId: 'ws-1', name: 'won', label: 'Gewonnen',
        orderIndex: 3, color: '#22C55E', isWon: true, isLost: false,
      })
      expect(r.id).toBe('ps-1')
      expect(r.workspace_id).toBe('ws-1')
      expect(r.name).toBe('won')
      expect(r.label).toBe('Gewonnen')
      expect(r.order_index).toBe(3)
      expect(r.color).toBe('#22C55E')
    })

    it('maps isWon true → is_won 1', () => {
      const r = pipelineStageToRow({
        id: 'ps-1', workspaceId: 'ws-1', name: 'won', label: 'Gewonnen', isWon: true,
      })
      expect(r.is_won).toBe(1)
    })

    it('maps isWon false → is_won 0', () => {
      const r = pipelineStageToRow({
        id: 'ps-1', workspaceId: 'ws-1', name: 'active', label: 'Aktiv', isWon: false,
      })
      expect(r.is_won).toBe(0)
    })

    it('maps isLost true → is_lost 1', () => {
      const r = pipelineStageToRow({
        id: 'ps-2', workspaceId: 'ws-1', name: 'lost', label: 'Verloren', isLost: true,
      })
      expect(r.is_lost).toBe(1)
    })

    it('maps isLost false → is_lost 0', () => {
      const r = pipelineStageToRow({
        id: 'ps-2', workspaceId: 'ws-1', name: 'active', label: 'Aktiv', isLost: false,
      })
      expect(r.is_lost).toBe(0)
    })

    it('omits created_at', () => {
      const r = pipelineStageToRow({ id: 'ps-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r).not.toHaveProperty('created_at')
    })

    it('omits updated_at', () => {
      const r = pipelineStageToRow({ id: 'ps-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r).not.toHaveProperty('updated_at')
    })

    it('defaults orderIndex to 0 when undefined', () => {
      const r = pipelineStageToRow({ id: 'ps-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r.order_index).toBe(0)
    })

    it('defaults color to #6B7280 when undefined', () => {
      const r = pipelineStageToRow({ id: 'ps-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r.color).toBe('#6B7280')
    })
  })
})
