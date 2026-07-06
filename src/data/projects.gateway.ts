import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ProjectsService } from '@/services/projects.service'
import { projectRowToProject, projectToRow, projectPhaseRowToPhase } from './projects.mapper'
import type {
  Project, UpsertProjectPayload, ProjectPhase, CreateProjectPhasePayload,
} from '@/types/project.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; code?: string } | null): never {
  const e = error ?? {}
  throw new Error(e.code ? `${e.message ?? 'Supabase-Fehler'} (${e.code})` : (e.message ?? 'Supabase-Fehler'))
}

export const ProjectsGateway = {
  async getAll(workspaceId: string): Promise<Project[]> {
    if (!shared()) return ProjectsService.getAll(workspaceId)
    const { data, error } = await supabase.from('projects').select('*')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(projectRowToProject)
  },

  async getById(id: string): Promise<Project> {
    if (!shared()) return ProjectsService.getById(id)
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
    if (error) fail(error)
    return projectRowToProject(data)
  },

  async upsert(payload: UpsertProjectPayload): Promise<Project> {
    if (!shared()) return ProjectsService.upsert(payload)
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('projects')
      .upsert(projectToRow(payload, { id, now, isNew: !payload.id }), { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return projectRowToProject(data)
  },

  async delete(id: string, workspaceId: string): Promise<void> {
    if (!shared()) return ProjectsService.delete(id, workspaceId)
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) fail(error)
  },

  async advancePhase(projectId: string): Promise<Project> {
    if (!shared()) return ProjectsService.advancePhase(projectId)
    const { data: phases, error: pErr } = await supabase.from('project_phases').select('*')
      .eq('project_id', projectId).order('order_index', { ascending: true })
    if (pErr) fail(pErr)
    const { data: proj, error: gErr } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (gErr) fail(gErr)
    if (proj.status === 'completed') {
      throw new Error('Projekt ist bereits abgeschlossen')
    }
    const currentIndex = (phases ?? []).findIndex(p => p.id === proj.current_phase_id)
    const next = currentIndex >= 0 ? (phases ?? [])[currentIndex + 1] : (phases ?? [])[0]
    const now = new Date().toISOString()
    const patch = next
      ? { current_phase_id: next.id, updated_at: now }
      : { status: 'completed', completed_at: now, updated_at: now }
    const { data, error } = await supabase.from('projects').update(patch).eq('id', projectId).select('*').single()
    if (error) fail(error)
    return projectRowToProject(data)
  },

  async setStatus(projectId: string, status: 'active' | 'paused'): Promise<Project> {
    if (!shared()) return ProjectsService.setStatus(projectId, status)
    const { data: proj, error: gErr } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (gErr) fail(gErr)
    if (proj.status === 'completed') {
      throw new Error('Abgeschlossenes Projekt kann nicht pausiert werden')
    }
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('projects')
      .update({ status, updated_at: now }).eq('id', projectId).select('*').single()
    if (error) fail(error)
    return projectRowToProject(data)
  },

  async getPhases(projectId: string): Promise<ProjectPhase[]> {
    if (!shared()) return ProjectsService.getPhases(projectId)
    const { data, error } = await supabase.from('project_phases').select('*')
      .eq('project_id', projectId).order('order_index', { ascending: true })
    if (error) fail(error)
    return (data ?? []).map(projectPhaseRowToPhase)
  },

  async createPhase(payload: CreateProjectPhasePayload): Promise<ProjectPhase> {
    if (!shared()) return ProjectsService.createPhase(payload)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const { data: existing, error: eErr } = await supabase.from('project_phases')
      .select('order_index').eq('project_id', payload.projectId)
      .order('order_index', { ascending: false }).limit(1)
    if (eErr) fail(eErr)
    const orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0
    const { data, error } = await supabase.from('project_phases')
      .insert({ id, project_id: payload.projectId, name: payload.name, order_index: orderIndex, created_at: now })
      .select('*').single()
    if (error) fail(error)
    if (orderIndex === 0) {
      await supabase.from('projects').update({ current_phase_id: id })
        .eq('id', payload.projectId).is('current_phase_id', null)
    }
    return projectPhaseRowToPhase(data)
  },

  async deletePhase(id: string, projectId: string): Promise<void> {
    if (!shared()) return ProjectsService.deletePhase(id, projectId)
    const { data: proj, error: pErr } = await supabase.from('projects')
      .select('current_phase_id').eq('id', projectId).single()
    if (pErr) fail(pErr)
    if (proj.current_phase_id === id) {
      throw new Error('Aktuelle Phase kann nicht geloescht werden -- zuerst eine andere Phase aktivieren')
    }
    const { error } = await supabase.from('project_phases').delete().eq('id', id)
    if (error) fail(error)
  },

  async reorderPhases(projectId: string, orderedIds: string[]): Promise<void> {
    if (!shared()) return ProjectsService.reorderPhases(projectId, orderedIds)
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('project_phases').update({ order_index: i }).eq('id', orderedIds[i])
      if (error) fail(error)
    }
  },
}
