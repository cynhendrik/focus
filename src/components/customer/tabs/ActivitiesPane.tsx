import { useEffect, useState } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { ActivityModal } from '@/components/pipeline/ActivityModal'
import type { ActivityType } from '@/types/pipeline.types'
import { Phone, Users, Mail, FileText, Trash2 } from 'lucide-react'

const TYPE_ICONS: Record<string, typeof Phone> = {
  call:    Phone,
  meeting: Users,
  email:   Mail,
  note:    FileText,
}

const TYPE_LABELS: Record<string, string> = {
  call:    'Anruf',
  meeting: 'Meeting',
  email:   'E-Mail',
  note:    'Notiz',
}

function formatActivityDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dCopy = new Date(iso)
  dCopy.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - dCopy.getTime()) / 86400000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Gestern'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props { customerId: string }

export function ActivitiesPane({ customerId }: Props) {
  const { activities, loadForCustomer, remove } = useActivitiesStore()
  const [modal, setModal] = useState<ActivityType | null>(null)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const QUICK_TYPES: { id: ActivityType; Icon: typeof Phone; label: string }[] = [
    { id: 'call',    Icon: Phone,     label: 'Anruf' },
    { id: 'meeting', Icon: Users,     label: 'Meeting' },
    { id: 'email',   Icon: Mail,      label: 'E-Mail' },
    { id: 'note',    Icon: FileText,  label: 'Notiz' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {QUICK_TYPES.map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setModal(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              color: 'var(--fg-muted)',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {activities.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-dim)', fontSize: 12 }}>
          Noch keine Aktivitäten erfasst.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {activities.map(activity => {
          const Icon = TYPE_ICONS[activity.type] ?? FileText
          return (
            <div
              key={activity.id}
              className="activity-row"
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
                position: 'relative',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} style={{ color: 'var(--fg-muted)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {TYPE_LABELS[activity.type] ?? activity.type}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 8 }}>
                    {formatActivityDate(activity.createdAt)}
                  </span>
                </div>
                {activity.body && (
                  <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.5 }}>
                    {activity.body}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(activity.id)}
                className="activity-delete"
                style={{
                  width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'var(--fg-dim)', cursor: 'pointer',
                  opacity: 0, transition: 'opacity 150ms', background: 'transparent', flexShrink: 0,
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {modal && (
        <ActivityModal
          customerId={customerId}
          presetType={modal}
          onClose={() => setModal(null)}
        />
      )}

      <style>{`.activity-row:hover .activity-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
