import { useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { CustomerTabs, type CustomerTab } from '@/components/customer/CustomerTabs'
import { WorkflowPane } from '@/components/workflow/WorkflowPane'
import { DashboardPane } from '@/components/kpis/DashboardPane'
import { ZeitPane } from '@/components/time/ZeitPane'

interface Props {
  customerId: string
}

export function CustomerRoute({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const [activeTab, setActiveTab] = useState<CustomerTab>('workflow')

  if (!customer) {
    return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-semibold text-[var(--text)]">{customer.name}</h1>
        {customer.company && (
          <p className="text-sm text-[var(--text2)] mt-0.5">{customer.company}</p>
        )}
        <div className="mt-3">
          <CustomerTabs active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'workflow' && (
          <WorkflowPane customerId={customerId} />
        )}
        {activeTab === 'dashboard' && (
          <DashboardPane customerId={customerId} />
        )}
        {activeTab === 'zeit' && (
          <ZeitPane customerId={customerId} />
        )}
        {activeTab === 'ablage' && (
          <p className="text-sm text-[var(--text2)]">Ablage — Phase 2.6</p>
        )}
        {activeTab === 'kommunikation' && (
          <p className="text-sm text-[var(--text2)]">Kommunikation — Phase 2.5</p>
        )}
      </div>
    </div>
  )
}
