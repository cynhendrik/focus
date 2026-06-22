import { describe, it, expect } from 'vitest'
import { leadStageRowToStage, leadStageToRow } from './lead-stages.mapper'

const row = {
  id: 'ls-1',
  workspace_id: 'ws-1',
  name: 'qualifiziert',
  label: 'Qualifiziert',
  order_index: 2,
  color: '#22C55E',
  is_qualified: 1,
  is_disqualified: 0,
  created_at: '2026-01-01T00:00:00Z',
}

describe('lead-stages.mapper', () => {
  describe('leadStageRowToStage', () => {
    it('maps snake_case → camelCase', () => {
      const s = leadStageRowToStage(row)
      expect(s.id).toBe('ls-1')
      expect(s.workspaceId).toBe('ws-1')
      expect(s.name).toBe('qualifiziert')
      expect(s.label).toBe('Qualifiziert')
      expect(s.orderIndex).toBe(2)
      expect(s.color).toBe('#22C55E')
      expect(s.createdAt).toBe('2026-01-01T00:00:00Z')
    })

    it('does not include updatedAt', () => {
      const s = leadStageRowToStage({ ...row, updated_at: '2026-06-01T00:00:00Z' })
      expect(s).not.toHaveProperty('updatedAt')
    })

    it('maps smallint is_qualified 1 → true', () => {
      const s = leadStageRowToStage({ ...row, is_qualified: 1 })
      expect(s.isQualified).toBe(true)
    })

    it('maps smallint is_qualified 0 → false', () => {
      const s = leadStageRowToStage({ ...row, is_qualified: 0 })
      expect(s.isQualified).toBe(false)
    })

    it('maps smallint is_disqualified 1 → true', () => {
      const s = leadStageRowToStage({ ...row, is_disqualified: 1 })
      expect(s.isDisqualified).toBe(true)
    })

    it('maps smallint is_disqualified 0 → false', () => {
      const s = leadStageRowToStage({ ...row, is_disqualified: 0 })
      expect(s.isDisqualified).toBe(false)
    })

    it('also maps boolean true for is_qualified (pg native bool)', () => {
      const s = leadStageRowToStage({ ...row, is_qualified: true })
      expect(s.isQualified).toBe(true)
    })

    it('also maps boolean false for is_disqualified (pg native bool)', () => {
      const s = leadStageRowToStage({ ...row, is_disqualified: false })
      expect(s.isDisqualified).toBe(false)
    })

    it('defaults orderIndex to 0 when null', () => {
      const s = leadStageRowToStage({ ...row, order_index: null })
      expect(s.orderIndex).toBe(0)
    })

    it('defaults color to #6B7280 when null', () => {
      const s = leadStageRowToStage({ ...row, color: null })
      expect(s.color).toBe('#6B7280')
    })
  })

  describe('leadStageToRow', () => {
    it('maps camelCase → snake_case', () => {
      const r = leadStageToRow({
        id: 'ls-1', workspaceId: 'ws-1', name: 'qualifiziert', label: 'Qualifiziert',
        orderIndex: 2, color: '#22C55E', isQualified: true, isDisqualified: false,
      })
      expect(r.id).toBe('ls-1')
      expect(r.workspace_id).toBe('ws-1')
      expect(r.name).toBe('qualifiziert')
      expect(r.label).toBe('Qualifiziert')
      expect(r.order_index).toBe(2)
      expect(r.color).toBe('#22C55E')
    })

    it('maps isQualified true → is_qualified 1', () => {
      const r = leadStageToRow({
        id: 'ls-1', workspaceId: 'ws-1', name: 'qualifiziert', label: 'Qualifiziert', isQualified: true,
      })
      expect(r.is_qualified).toBe(1)
    })

    it('maps isQualified false → is_qualified 0', () => {
      const r = leadStageToRow({
        id: 'ls-1', workspaceId: 'ws-1', name: 'neu', label: 'Neu', isQualified: false,
      })
      expect(r.is_qualified).toBe(0)
    })

    it('maps isDisqualified true → is_disqualified 1', () => {
      const r = leadStageToRow({
        id: 'ls-2', workspaceId: 'ws-1', name: 'disqualifiziert', label: 'Disqualifiziert', isDisqualified: true,
      })
      expect(r.is_disqualified).toBe(1)
    })

    it('maps isDisqualified false → is_disqualified 0', () => {
      const r = leadStageToRow({
        id: 'ls-2', workspaceId: 'ws-1', name: 'neu', label: 'Neu', isDisqualified: false,
      })
      expect(r.is_disqualified).toBe(0)
    })

    it('omits created_at', () => {
      const r = leadStageToRow({ id: 'ls-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r).not.toHaveProperty('created_at')
    })

    it('omits updated_at', () => {
      const r = leadStageToRow({ id: 'ls-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r).not.toHaveProperty('updated_at')
    })

    it('defaults orderIndex to 0 when undefined', () => {
      const r = leadStageToRow({ id: 'ls-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r.order_index).toBe(0)
    })

    it('defaults color to #6B7280 when undefined', () => {
      const r = leadStageToRow({ id: 'ls-1', workspaceId: 'ws-1', name: 'x', label: 'X' })
      expect(r.color).toBe('#6B7280')
    })
  })
})
