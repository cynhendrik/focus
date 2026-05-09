import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { CustomerTabs, type CustomerTab } from '@/components/customer/CustomerTabs'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { WorkflowPane } from '@/components/workflow/WorkflowPane'
import { DashboardPane } from '@/components/kpis/DashboardPane'
import { ZeitPane } from '@/components/time/ZeitPane'
import { KommunikationPane } from '@/components/chat/KommunikationPane'
import { AblagePane } from '@/components/ablage/AblagePane'
import { CrmPane } from '@/components/crm/CrmPane'
import { FocusAiPane } from '@/components/focus/FocusAiPane'
import { SocialPane } from '@/components/social/SocialPane'

const STATUS_LABEL: Record<string, string> = {
  lead: 'Lead', aktiv: 'Aktiv', inaktiv: 'Inaktiv', lost: 'Lost',
}
const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-500',
  aktiv: 'bg-green-500/10 text-green-500',
  inaktiv: 'bg-gray-400/10 text-gray-400',
  lost: 'bg-red-400/10 text-red-400',
}

interface Props {
  customerId: string
}

export function CustomerRoute({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const [activeTab, setActiveTab] = useState<CustomerTab>('workflow')
  const [showEdit, setShowEdit] = useState(false)

  if (!customer) {
    return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-[var(--border)]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-[var(--text)]">{customer.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[customer.status] ?? ''}`}>
                {STATUS_LABEL[customer.status] ?? customer.status}
              </span>
              {customer.priority === 'high' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">Hohe Priorität</span>
              )}
            </div>
            {customer.company && (
              <p className="text-sm text-[var(--text2)] mt-0.5">{customer.company}</p>
            )}
            <div className="flex gap-3 mt-1">
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="text-xs text-[var(--text2)] hover:text-primary">{customer.email}</a>
              )}
              {customer.phone && (
                <span className="text-xs text-[var(--text2)]">{customer.phone}</span>
              )}
            </div>
            {(customer.tags ?? []).length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {customer.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)]"
            >
              Bearbeiten
            </button>
            <button
              onClick={() => setSelected(null)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)]"
            >
              ✕
            </button>
          </div>
        </div>
        <CustomerTabs active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'workflow' && <WorkflowPane customerId={customerId} />}
        {activeTab === 'dashboard' && <DashboardPane customerId={customerId} />}
        {activeTab === 'crm' && <CrmPane customerId={customerId} />}
        {activeTab === 'zeit' && <ZeitPane customerId={customerId} />}
        {activeTab === 'ablage' && <AblagePane customerId={customerId} />}
        {activeTab === 'kommunikation' && <KommunikationPane customerId={customerId} />}
        {activeTab === 'social' && <SocialPane customerId={customerId} />}
        {activeTab === 'ai' && <FocusAiPane customerId={customerId} />}
      </div>

      {showEdit && (
        <CustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
