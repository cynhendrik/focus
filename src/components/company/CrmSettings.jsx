import { useState } from 'react'
import { useStore } from '../../store'

function ChipList({ items, onChange, placeholder, addLabel }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
  }

  const remove = (item) => onChange(items.filter(i => i !== item))

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {items.map(item => (
          <span key={item} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 500, padding: '4px 10px',
            borderRadius: 'var(--r-pill)',
            background: 'var(--p5)', color: 'var(--p)',
            border: '1px solid var(--border3)',
          }}>
            {item}
            <button onClick={() => remove(item)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--p)', padding: 0, lineHeight: 1, fontSize: 14,
              display: 'flex', alignItems: 'center',
            }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--bg2)', border: '1px solid var(--border2)',
            color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
          onBlur={e => e.target.style.borderColor = 'var(--border2)'}
        />
        <button onClick={add} style={{
          padding: '8px 16px', borderRadius: 'var(--r-md)',
          background: 'var(--bg3)', border: '1px solid var(--border2)',
          color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg4)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg3)' }}
        >{addLabel}</button>
      </div>
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 44, height: 24, borderRadius: 99, padding: '0 3px',
      background: on ? 'var(--p)' : 'var(--bg4)',
      border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8,
}

export function CrmSettings() {
  const crmSettings        = useStore(s => s.crmSettings)
  const updateCrmSettings  = useStore(s => s.updateCrmSettings)

  const [followUpDraft, setFollowUpDraft] = useState(String(crmSettings.followUpDays))

  const saveFollowUpDays = () => {
    const n = parseInt(followUpDraft, 10)
    if (!isNaN(n) && n > 0) updateCrmSettings({ followUpDays: n })
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>CRM-Einstellungen</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Passe Statuse, Prioritäten, Tags und Follow-Up-Regeln an</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 640 }}>

        {/* Statuses */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px' }}>
          <label style={labelStyle}>Kundenstatus</label>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Definiere die Statusoptionen, die beim Anlegen und Bearbeiten von Kunden verfügbar sind.
          </p>
          <ChipList
            items={crmSettings.statuses}
            onChange={v => updateCrmSettings({ statuses: v })}
            placeholder="Neuen Status eingeben…"
            addLabel="Hinzufügen"
          />
        </div>

        {/* Priorities */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px' }}>
          <label style={labelStyle}>Prioritäten</label>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Prioritätsstufen für Kunden und Aufgaben.
          </p>
          <ChipList
            items={crmSettings.priorities}
            onChange={v => updateCrmSettings({ priorities: v })}
            placeholder="Neue Priorität eingeben…"
            addLabel="Hinzufügen"
          />
        </div>

        {/* Tags */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px' }}>
          <label style={labelStyle}>Tags</label>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Freie Tags zur Kategorisierung deiner Kunden.
          </p>
          <ChipList
            items={crmSettings.tags}
            onChange={v => updateCrmSettings({ tags: v })}
            placeholder="Neuen Tag eingeben…"
            addLabel="Hinzufügen"
          />
        </div>

        {/* Follow-Up */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Automatische Follow-Ups</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Erinnere dich automatisch nach X Tagen ohne Aktivität.</div>
            </div>
            <Toggle on={crmSettings.followUpEnabled} onChange={v => updateCrmSettings({ followUpEnabled: v })} />
          </div>
          {crmSettings.followUpEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Erinnerung nach</span>
              <input
                type="number"
                min="1"
                value={followUpDraft}
                onChange={e => setFollowUpDraft(e.target.value)}
                onBlur={saveFollowUpDays}
                onKeyDown={e => e.key === 'Enter' && saveFollowUpDays()}
                style={{
                  width: 64, padding: '6px 10px', borderRadius: 'var(--r-md)',
                  background: 'var(--bg2)', border: '1px solid var(--border2)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  textAlign: 'center',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
                onBlur2={e => e.target.style.borderColor = 'var(--border2)'}
              />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Tagen ohne Aktivität</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
