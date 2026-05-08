import { useState } from 'react'
import { useStore } from '../../store'
import { InstagramPane } from './InstagramPane'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', available: true },
  { id: 'tiktok',    label: 'TikTok',    available: false },
  { id: 'meta',      label: 'Meta Ads',  available: false },
]

export function SocialMediaTab({ customerId }) {
  const [platform, setPlatform] = useState('instagram')
  const customers = useStore(s => s.customers)
  const customer  = customers.find(c => c.id === customerId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Platform selector */}
      <div style={{ padding: '16px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', gap: 2, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: 4, boxShadow: 'var(--shadow-sm)' }}>
          {PLATFORMS.map(p => {
            const active = p.id === platform && p.available
            return (
              <button
                key={p.id}
                onClick={() => p.available && setPlatform(p.id)}
                style={{
                  padding: '7px 16px', borderRadius: 'var(--r-lg)', border: 'none',
                  cursor: p.available ? 'pointer' : 'default',
                  background: active ? 'var(--bg)' : 'transparent',
                  color: active ? 'var(--p)' : p.available ? 'var(--text3)' : 'var(--text4)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  fontFamily: 'inherit', boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {p.label}
                {!p.available && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 99, background: 'var(--bg3)', color: 'var(--text4)', letterSpacing: '0.05em' }}>SOON</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', marginTop: 4 }}>
        {platform === 'instagram' && <InstagramPane customerId={customerId} customerName={customer?.name ?? 'Kunde'} />}
      </div>
    </div>
  )
}
