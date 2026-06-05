import { useState, useMemo } from 'react'
import { useAccountsStore }    from '@/store/accounts.store'
import { useNotesModuleStore } from '@/store/notes-module.store'

interface Props {
  selectedId: string | null
  onSelect:   (accountId: string) => void
}

export function CustomerNotesPanel({ selectedId, onSelect }: Props) {
  const accounts = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const entries  = useNotesModuleStore(s => s.entries)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() =>
    accounts.filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name, 'de')),
  [accounts, search])

  const entryCountForSelected = entries.length

  function initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316']
  function colorFor(name: string): string {
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length
    return COLORS[h]
  }

  return (
    <div style={{
      width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8,
        }}>Kunden</div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)',
            color: 'var(--fg)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {filtered.map(account => {
          const color = colorFor(account.name)
          const isActive = account.id === selectedId
          return (
            <div
              key={account.id}
              onClick={() => onSelect(account.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                marginBottom: 2, transition: 'all 120ms',
                border: `1px solid ${isActive ? 'rgba(181,240,35,0.15)' : 'transparent'}`,
                background: isActive ? 'rgba(181,240,35,0.06)' : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: `${color}22`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
              }}>
                {initials(account.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  color: isActive ? 'var(--accent)' : 'var(--fg)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{account.name}</div>
              </div>
              {isActive && entryCountForSelected > 0 && (
                <div style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  background: 'rgba(181,240,35,0.12)', color: 'var(--accent)',
                  padding: '1px 6px', borderRadius: 99, flexShrink: 0,
                }}>{entryCountForSelected}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
