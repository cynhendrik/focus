import type { PreparedItem, PreparedItemPayload } from '@/types/prepared-item.types'

function parsePayload(raw: unknown): PreparedItemPayload {
  if (raw && typeof raw === 'object') return raw as PreparedItemPayload
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object') return p as PreparedItemPayload
    } catch { /* kaputtes JSON → Fallback */ }
  }
  return { title: '', why: '' }
}

/** Tauri-Command-Ergebnis (camelCase, payload = JSON-String) → PreparedItem. */
export function rawToPreparedItem(raw: Omit<PreparedItem, 'payload'> & { payload: string }): PreparedItem {
  return { ...raw, payload: parsePayload(raw.payload) }
}

/** Supabase-Row (snake_case, payload = jsonb) → PreparedItem. */
export function rowToPreparedItem(row: Record<string, unknown>): PreparedItem {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    type: row.type as PreparedItem['type'],
    sourceKind: row.source_kind as PreparedItem['sourceKind'],
    sourceId: row.source_id as string,
    assignee: (row.assignee as string | null) ?? null,
    payload: parsePayload(row.payload),
    score: row.score as number,
    status: row.status as PreparedItem['status'],
    snoozeUntil: (row.snooze_until as string | null) ?? null,
    ruleId: (row.rule_id as string) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    approvedAt: (row.approved_at as string | null) ?? null,
  }
}

/** PreparedItem → Supabase-Row. */
export function preparedItemToRow(item: PreparedItem): Record<string, unknown> {
  return {
    id: item.id, workspace_id: item.workspaceId, type: item.type,
    source_kind: item.sourceKind, source_id: item.sourceId, assignee: item.assignee,
    payload: item.payload, score: item.score, status: item.status,
    snooze_until: item.snoozeUntil, rule_id: item.ruleId,
    created_at: item.createdAt, updated_at: item.updatedAt, approved_at: item.approvedAt,
  }
}
