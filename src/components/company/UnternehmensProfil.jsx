import { useState } from 'react'
import { useStore } from '../../store'

const INDUSTRIES   = ['Agentur', 'Coaching', 'E-Commerce', 'SaaS', 'Handwerk', 'Sonstiges']
const TEAM_SIZES   = ['1', '2–5', '6–15', '16–50', '50+']
const TARGET_TYPES = ['Agentur', 'Coach', 'Creator', 'Dienstleister', 'Vertrieb', 'Sonstiges']

export function UnternehmensProfil() {
  const companyProfile    = useStore(s => s.companyProfile)
  const setCompanyProfile = useStore(s => s.setCompanyProfile)
  const [form, setForm]   = useState(companyProfile)
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)',
    background: 'var(--bg2)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
  }
  const labelStyle = {
    display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6,
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 4 }}>
          Unternehmensprofil
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Grundlegende Informationen über dein Unternehmen</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 32, alignItems: 'start' }}>
        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Unternehmensname</label>
            <input value={form.name} onChange={e => update('name', e.target.value)}
              placeholder="z.B. Muster GmbH" style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Branche</label>
              <select value={form.industry} onChange={e => update('industry', e.target.value)} style={inputStyle}>
                <option value="">Auswählen…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Teamgröße</label>
              <select value={form.teamSize} onChange={e => update('teamSize', e.target.value)} style={inputStyle}>
                <option value="">Auswählen…</option>
                {TEAM_SIZES.map(t => <option key={t} value={t}>{t} Personen</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Zieltyp</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TARGET_TYPES.map(type => {
                const active = form.targetType === type
                return (
                  <button key={type} onClick={() => update('targetType', active ? '' : type)} style={{
                    padding: '6px 16px', borderRadius: 'var(--r-pill)',
                    border: `1px solid ${active ? 'var(--border3)' : 'var(--border2)'}`,
                    background: active ? 'var(--p5)' : 'transparent',
                    color: active ? 'var(--p)' : 'var(--text2)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>{type}</button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Beschreibung / Mission</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)}
              placeholder="Was macht dein Unternehmen besonders?" rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
          </div>

          <button onClick={() => setCompanyProfile(form)} style={{
            alignSelf: 'flex-start', padding: '10px 24px', borderRadius: 'var(--r-md)',
            background: 'var(--p)', border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--p2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--p)'}
          >Speichern</button>
        </div>

        {/* Preview Card */}
        <div style={{
          background: 'var(--bg1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: '24px', position: 'sticky', top: 0,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 16 }}>Vorschau</div>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="22" height="22" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8, minHeight: 28 }}>
            {form.name || <span style={{ color: 'var(--text4)', fontWeight: 400 }}>Unternehmensname</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {form.industry   && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 500 }}>{form.industry}</span>}
            {form.targetType && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--p5)', color: 'var(--p)', fontWeight: 600 }}>{form.targetType}</span>}
            {form.teamSize   && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--bg3)', color: 'var(--text3)', fontWeight: 500 }}>{form.teamSize} Personen</span>}
          </div>
          {form.description
            ? <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.65 }}>{form.description}</p>
            : <p style={{ fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Noch keine Beschreibung…</p>}
        </div>
      </div>
    </div>
  )
}
