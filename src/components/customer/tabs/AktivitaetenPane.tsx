import { FollowupsPane } from './FollowupsPane'
import { ActivitiesPane } from './ActivitiesPane'

interface Props { customerId: string }

export function AktivitaetenPane({ customerId }: Props) {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{
        width: 340, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
      }}>
        <FollowupsPane customerId={customerId} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ActivitiesPane customerId={customerId} />
      </div>
    </div>
  )
}
