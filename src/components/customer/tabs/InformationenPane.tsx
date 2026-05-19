import { ProfilPane } from './ProfilPane'
import { NotizPane } from './NotizPane'

interface Props { customerId: string }

export function InformationenPane({ customerId }: Props) {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{
        width: 380, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
      }}>
        <ProfilPane customerId={customerId} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <NotizPane customerId={customerId} />
      </div>
    </div>
  )
}
