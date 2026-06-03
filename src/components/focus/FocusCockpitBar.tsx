// src/components/focus/FocusCockpitBar.tsx
import { useRef, useState, useCallback } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useDealsStore } from '@/store/deals.store'
import { generateCorraDraft } from '@/lib/ai/corra'
import { useToastStore } from '@/store/toast.store'
import { CorraLamp } from './cockpit/CorraLamp'
import { CockpitTaskForm } from './cockpit/CockpitTaskForm'
import { CockpitInvoiceForm } from './cockpit/CockpitInvoiceForm'
import { CockpitMailForm } from './cockpit/CockpitMailForm'
import type { LampState } from './cockpit/CorraLamp'
import type { CockpitMailFormRef } from './cockpit/CockpitMailForm'

type Tab = 'task' | 'invoice' | 'email'

interface Props {
  customerId: string | undefined
  customerName: string
}

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'task',    icon: '+',  label: 'Task'     },
  { id: 'invoice', icon: '€',  label: 'Rechnung' },
  { id: 'email',   icon: '✉',  label: 'E-Mail'   },
]

export function FocusCockpitBar({ customerId, customerName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('task')
  const [lampState, setLampState] = useState<LampState>('off')
  const [mailSubject, setMailSubject] = useState('')

  const mailRef       = useRef<CockpitMailFormRef>(null)
  const activities    = useActivitiesStore(s => s.activities)
  const allDeals      = useDealsStore(s => s.deals)
  const showToast     = useToastStore(s => s.show)

  // Lamp readiness — only the email tab uses the lamp (invoice has its own inline button)
  const emailLampReady   = activeTab === 'email' && mailSubject.trim().length > 3
  const currentLampState: LampState = lampState === 'loading'
    ? 'loading'
    : emailLampReady ? 'ready' : 'off'

  const handleMailSubjectChange = useCallback((s: string) => setMailSubject(s), [])

  const handleSwitchToEmail = useCallback((subject: string, body: string) => {
    setActiveTab('email')
    setTimeout(() => mailRef.current?.fillDraft(subject, body), 50)
  }, [])

  const handleLampClick = async () => {
    if (currentLampState !== 'ready') return
    setLampState('loading')
    try {
      if (activeTab === 'email') {
        const lastAct  = [...activities]
          .filter(a => a.accountId === customerId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        const openDeal = allDeals.find(d => d.accountId === customerId && d.value)

        const draft = await generateCorraDraft({
          kind: 'followup',
          customerName,
          topic: mailSubject,
          notes: [lastAct?.title, openDeal?.title].filter(Boolean).join(', ') || undefined,
        })
        if (draft) {
          mailRef.current?.fillDraft(mailSubject, draft)
        }
      }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setLampState('off')
    }
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg)',
      flexShrink: 0,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 14px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              color: activeTab === tab.id ? 'var(--fg)' : 'var(--fg-dim)',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
              transition: 'all 180ms',
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 5, fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: activeTab === tab.id ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--fg-dim)',
            }}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* CORRA Lamp */}
        <CorraLamp state={currentLampState} onClick={handleLampClick} />
      </div>

      {/* Form area */}
      <div style={{ padding: '14px 20px 16px' }}>
        {activeTab === 'task' && (
          <CockpitTaskForm
            customerId={customerId}
            customerName={customerName}
            onCreated={() => {}}
          />
        )}
        {activeTab === 'invoice' && (
          <CockpitInvoiceForm
            customerId={customerId}
            customerName={customerName}
            onCorraInvoiceDraft={handleSwitchToEmail}
          />
        )}
        {activeTab === 'email' && (
          <CockpitMailForm
            ref={mailRef}
            customerId={customerId}
            customerName={customerName}
            onSubjectChange={handleMailSubjectChange}
          />
        )}
      </div>
    </div>
  )
}
