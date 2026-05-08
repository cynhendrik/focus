import { useState, useMemo, Component } from 'react'
import { useStore } from '../../store'
import { computeHealthScore } from '../../utils/healthScore'
import { CustomerHeader } from './CustomerHeader'
import { CustomerDashboard } from '../dashboard/CustomerDashboard'
import { AiPanel } from '../ai-panel/AiPanel'
import { WorkflowPane } from '../workflow/WorkflowPane'
import { SocialMediaTab } from '../social/SocialMediaTab'
import { AblagePane } from '../ablage/AblagePane'
import { ClientChatView } from '../chat/ClientChatView'
import { HistorieTab } from '../tabs/HistorieTab'
import { HealthTab } from '../tabs/HealthTab'
import { ZeitmanagementPane } from '../time/ZeitmanagementPane'

class CustomerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: 'var(--red)', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>Render-Fehler:</strong>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {String(this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export function CustomerView({ customerId, onTimeEntry }) {
  const customers            = useStore(s => s.customers)
  const todos                = useStore(s => s.todos)
  const kpis                 = useStore(s => s.kpis)
  const notes                = useStore(s => s.notes)
  const deadlines            = useStore(s => s.deadlines)
  const instagramConnections = useStore(s => s.instagramConnections)
  const instagramCache       = useStore(s => s.instagramCache)

  const customer = customers.find(c => c.id === customerId)

  const { score } = useMemo(() =>
    computeHealthScore(customerId, { customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache }),
    [customerId, customers, todos, kpis, notes, deadlines, instagramConnections, instagramCache]
  )

  const healthScore = { score }

  const [activeTab, setActiveTab] = useState('workflow')

  if (!customer) return null

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':     return <CustomerDashboard customerId={customerId} />
      case 'workflow':      return <WorkflowPane customerId={customerId} />
      case 'ablage':        return <AblagePane customerId={customerId} />
      case 'kommunikation': return <ClientChatView customerId={customerId} />
      case 'historie':      return <HistorieTab customerId={customerId} />
      case 'health':        return <HealthTab customerId={customerId} />
      case 'social':        return <SocialMediaTab customerId={customerId} />
      case 'zeit':          return <ZeitmanagementPane customerId={customerId} onAddEntry={() => onTimeEntry?.(customerId)} />
      default:              return null
    }
  }

  return (
    <CustomerErrorBoundary>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <CustomerHeader
          customer={customer}
          healthScore={healthScore}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {renderTab()}
          </div>
          <AiPanel customerId={customerId} />
        </div>
      </div>
    </CustomerErrorBoundary>
  )
}
