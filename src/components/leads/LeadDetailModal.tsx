import { useState, useEffect } from 'react'
import { UserCheck, Trash2, Repeat } from 'lucide-react'
import { useLeadsStore } from '@/store/leads.store'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { leadToUpsertPayload } from '@/lib/lead-payload'
import { useDialogFocus } from '@/components/ui/Sheet'
import { ActivityStream } from '@/components/activity/ActivityStream'
import { ConvertLeadChoice } from '@/components/leads/ConvertLeadChoice'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { log } from '@/lib/logger'
import type { Lead } from '@/types/lead.types'

interface Props {
  lead: Lead
  workspaceId: string
  onClose: () => void
}

export function LeadDetailModal({ lead, workspaceId, onClose }: Props) {
  const upsertLead      = useLeadsStore(s => s.upsert)
  const convertToClient = useLeadsStore(s => s.convertToClient)
  const convertToDeal   = useLeadsStore(s => s.convertToDeal)
  const deleteLead      = useLeadsStore(s => s.deleteLead)
  const userId          = useAuthStore(s => s.user?.id ?? '')
  const showToast       = useToastStore(s => s.show)
  const dialogRef       = useDialogFocus(true)
  const [showConvertChoice, setShowConvertChoice] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  // Follow-up-Sequenz: 4 vorgetextete Mails (Tag 2/5/10/21), die als
  // Stapel-Karten zur Freigabe erscheinen — kein Auto-Versand.
  const [sequenceActive, setSequenceActive] = useState<boolean | null>(null)
  const [sequenceBusy, setSequenceBusy]     = useState(false)

  useEffect(() => {
    let cancelled = false
    FollowUpQueueService.getForLead(lead.id)
      .then(items => { if (!cancelled) setSequenceActive(items.some(i => i.status === 'pending')) })
      .catch(() => { if (!cancelled) setSequenceActive(false) })
    return () => { cancelled = true }
  }, [lead.id])

  async function handleSequenceToggle() {
    setSequenceBusy(true)
    try {
      if (sequenceActive) {
        await FollowUpQueueService.cancelForLead(lead.id)
        setSequenceActive(false)
        showToast({ message: 'Sequenz gestoppt — es landen keine weiteren Mails im Stapel.', variant: 'success' })
      } else {
        // Protokoll-Aktivität als Auslöser, damit der Start im Verlauf steht.
        const trigger = await ActivitiesGateway.create({
          workspaceId, createdBy: userId, accountId: lead.id,
          type: 'note', title: 'Follow-up-Sequenz gestartet',
          body: '4 vorgetextete Mails (Tag 2/5/10/21) — jede wartet im Stapel auf Freigabe.',
          status: 'done',
        })
        await FollowUpQueueService.createSequence({
          workspaceId, leadId: lead.id, triggerActivityId: trigger.id,
          leadName: lead.name, companyName: lead.companyName ?? undefined,
        })
        setSequenceActive(true)
        showToast({ message: 'Sequenz geplant — die erste Mail liegt in 2 Tagen im Stapel.', variant: 'success' })
      }
    } catch (err) {
      log.error('sequence toggle failed', { err })
      showToast({ message: 'Sequenz konnte nicht geändert werden.', variant: 'error' })
    } finally {
      setSequenceBusy(false)
    }
  }

  async function handleConvertChoice(withDeal: boolean, dealValue?: number) {
    try {
      if (withDeal) {
        await convertToDeal(lead.id, workspaceId, userId, dealValue)
      } else {
        await convertToClient(lead.id)
      }
      showToast({
        message: withDeal
          ? `${lead.name} ist jetzt Kunde — Deal in der Pipeline.`
          : `${lead.name} ist jetzt Kunde.`,
        variant: 'success',
      })
      setShowConvertChoice(false)
      onClose()
    } catch {
      // convertToDeal meldet seine Fehler selbst per Toast.
      if (!withDeal) showToast({ message: `${lead.name} konnte nicht umgewandelt werden.`, variant: 'error' })
      setShowConvertChoice(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Lead „${lead.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    setDeleting(true)
    try {
      await deleteLead(lead.id, workspaceId)
      showToast({ message: `${lead.name} gelöscht.`, variant: 'success' })
      onClose()
    } catch {
      showToast({ message: `${lead.name} konnte nicht gelöscht werden.`, variant: 'error' })
      setDeleting(false)
    }
  }

  // Local mirror of the phone — the modal receives `lead` as a snapshot, so
  // edits would otherwise not show until the board re-opens the modal.
  const [phone, setPhone]               = useState(lead.phone ?? '')
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneDraft, setPhoneDraft]     = useState('')
  const [phoneSaving, setPhoneSaving]   = useState(false)
  const [phoneError, setPhoneError]     = useState<string | null>(null)

  function startEditPhone() {
    setPhoneDraft(phone)
    setPhoneError(null)
    setEditingPhone(true)
  }

  async function savePhone() {
    const next = phoneDraft.trim()
    setPhoneSaving(true)
    setPhoneError(null)
    try {
      await upsertLead(leadToUpsertPayload(lead, { phone: next || undefined }))
      setPhone(next)
      setEditingPhone(false)
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setPhoneSaving(false)
    }
  }

  useEffect(() => {
    const hide = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', hide)
    return () => document.removeEventListener('keydown', hide)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={lead.name}
        tabIndex={-1}
        style={{
          width: '100%', maxWidth: 840,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 0,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', maxHeight: '95vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{lead.name}</div>
              {lead.companyName && (
                <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{lead.companyName}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleSequenceToggle}
                disabled={sequenceBusy || sequenceActive === null || (!sequenceActive && !lead.email)}
                title={!lead.email && !sequenceActive
                  ? 'Ohne E-Mail-Adresse keine Sequenz möglich'
                  : sequenceActive
                    ? 'Follow-up-Sequenz stoppen'
                    : '4 vorgetextete Follow-up-Mails planen — jede wartet im Stapel auf Freigabe'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  cursor: sequenceBusy ? 'default' : 'pointer',
                  border: '1px solid var(--accent)', background: sequenceActive ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  opacity: sequenceBusy || (!sequenceActive && !lead.email) ? 0.55 : 1,
                }}
              >
                <Repeat size={14} />
                {sequenceBusy ? 'Moment…' : sequenceActive ? 'Sequenz stoppen' : 'Sequenz starten'}
              </button>
              <button
                onClick={() => setShowConvertChoice(true)}
                title="Lead zum Kunden machen — wahlweise mit Deal in der Pipeline"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--ok)', background: 'transparent',
                  color: 'var(--ok)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                <UserCheck size={14} /> Zu Kunde machen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Lead löschen"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, cursor: deleting ? 'default' : 'pointer',
                  border: '1px solid var(--danger)', background: 'transparent',
                  color: 'var(--danger)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                <Trash2 size={14} /> {deleting ? 'Wird gelöscht…' : 'Löschen'}
              </button>
              <button
                aria-label="Schließen"
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--fg-dim)', fontSize: 18, lineHeight: 1, padding: '2px 6px',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Contact info */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }}>
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                  background: 'var(--accent-soft)', padding: '5px 10px',
                  borderRadius: 99, fontWeight: 500,
                }}
              >
                ✉️ {lead.email}
              </a>
            )}

            {/* Phone — editable inline */}
            {editingPhone ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  className="mock-input"
                  type="tel"
                  value={phoneDraft}
                  onChange={e => setPhoneDraft(e.target.value)}
                  placeholder="+49 151 1234567"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') savePhone()
                    if (e.key === 'Escape') { e.stopPropagation(); setEditingPhone(false) }
                  }}
                  style={{ width: 170, fontSize: 12, padding: '5px 10px' }}
                />
                <button
                  className="btn-primary"
                  onClick={savePhone}
                  disabled={phoneSaving}
                  style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
                >
                  {phoneSaving ? '…' : 'OK'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setEditingPhone(false)}
                  disabled={phoneSaving}
                  style={{ fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                >
                  Abbrechen
                </button>
              </div>
            ) : phone ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <a
                  href={`tel:${phone}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                    background: 'var(--accent-soft)', padding: '5px 10px',
                    borderRadius: 99, fontWeight: 500,
                  }}
                >
                  📞 {phone}
                </a>
                <button
                  aria-label="Telefonnummer bearbeiten"
                  title="Bearbeiten"
                  onClick={startEditPhone}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--fg-dim)', fontSize: 12, padding: '2px 4px',
                  }}
                >
                  ✎
                </button>
              </span>
            ) : (
              <button
                onClick={startEditPhone}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--warn)', cursor: 'pointer',
                  background: 'rgba(251,191,36,0.10)', padding: '5px 10px',
                  border: '1px dashed rgba(251,191,36,0.4)', borderRadius: 99, fontWeight: 600,
                }}
              >
                📞 + Telefon hinzufügen
              </button>
            )}

            {!lead.email && !phone && !editingPhone && (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine E-Mail hinterlegt</span>
            )}
          </div>
          {phoneError && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{phoneError}</div>
          )}
        </div>

        {/* Scrollable body — unified activity stream (same as customer), incl.
            automatic follow-ups for this lead. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          <ActivityStream
            accountId={lead.id}
            sources={{ followUpQueue: true }}
            compact
            loadActivitiesOnMount
          />
        </div>
      </div>

      {showConvertChoice && (
        <ConvertLeadChoice
          leadName={lead.name}
          onChoose={handleConvertChoice}
          onCancel={() => setShowConvertChoice(false)}
        />
      )}
    </div>
  )
}
