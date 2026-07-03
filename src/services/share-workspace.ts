import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { runMigration, bumpSequences } from '@/data/migration-runner'
import { rescopeWorkspace } from '@/data/workspace-local'

/**
 * Orchestriert das Teilen eines lokalen Workspaces:
 * 1. Cloud-Workspace-Record anlegen (createCloudWorkspaceRecord)
 * 2. Lokale Daten migrieren (runMigration)
 * 3. Sequenzen hochstellen (bumpSequences)
 * 4. ERST NACH erfolgreicher Migration: flip (loadWorkspaces + setActiveWorkspace)
 *
 * Bei Fehler in Schritt 2/3: kein Flip, activeWorkspaceId bleibt unverändert.
 */
export async function shareWorkspace(
  localWsId: string,
  name: string,
  onProgress?: (entity: string, n: number) => void,
): Promise<{ cloudWsId: string; joinCode: string | null }> {
  const uid = useAuthStore.getState().user?.id
  if (!uid) throw new Error('Nicht eingeloggt')

  // Step 1: Cloud-Record anlegen (vor Migration)
  const cloudWsId = await useWorkspaceStore.getState().createCloudWorkspaceRecord(name)

  // Step 2+3: Migration + Sequences — bei Fehler wird hier geworfen, kein Flip
  await runMigration({ localWsId, cloudWsId, uid }, onProgress)
  await bumpSequences({ localWsId, cloudWsId, uid })

  // Lokale Zeilen auf die Cloud-ID umziehen: verhindert, dass die Selbstheilung
  // (loadWorkspaces-Orphan-Scan) den gerade geteilten Workspace als lokalen
  // Geist wiederbelebt — die Reste gehören jetzt sichtbar dem Cloud-Workspace.
  await rescopeWorkspace(localWsId, cloudWsId, uid)

  // Step 4: Erst NACH erfolgreicher Migration flippen
  await useWorkspaceStore.getState().loadWorkspaces()
  useWorkspaceStore.setState((s) => ({
    localWorkspaces: s.localWorkspaces.filter((w) => w.id !== localWsId),
  }))
  useWorkspaceStore.getState().setActiveWorkspace(cloudWsId)

  const joinCode =
    useWorkspaceStore.getState().workspaces.find((w) => w.id === cloudWsId)?.join_code ?? null

  return { cloudWsId, joinCode }
}
