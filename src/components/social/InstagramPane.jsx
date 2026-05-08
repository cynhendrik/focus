import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import { fetchInstagramUser, fetchAllReels, buildExportJson, downloadJson } from '../../utils/instagramApi'
import { fmtDate, timeAgo } from '../../utils/helpers'
import { InstagramDashboard } from './InstagramDashboard'

function StatPill({ label, value, color = 'var(--text2)' }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

const DEMO_REELS = [
  { id: 'd1', caption: 'Morgens mit einem guten Kaffee starten ☕ #morgenroutine #lifestyle #productivity', hashtags: ['morgenroutine','lifestyle','productivity'], views: 48200, likes: 3140, comments: 87, shares: 412, saves: 890, reach: 41000, impressions: 52000, length_seconds: 28, posted_at: '2026-05-01T08:00:00Z', thumbnail_url: null },
  { id: 'd2', caption: 'So optimierst du deine Social-Media-Strategie in 3 Schritten 🚀 #marketing #socialmedia #wachstum', hashtags: ['marketing','socialmedia','wachstum'], views: 124500, likes: 8920, comments: 304, shares: 1870, saves: 3200, reach: 98000, impressions: 138000, length_seconds: 45, posted_at: '2026-04-22T14:30:00Z', thumbnail_url: null },
  { id: 'd3', caption: 'Behind the scenes: ein Tag in unserem Büro 🎬 #bts #teamwork #office', hashtags: ['bts','teamwork','office'], views: 19800, likes: 1240, comments: 43, shares: 98, saves: 210, reach: 17200, impressions: 22000, length_seconds: 60, posted_at: '2026-04-15T11:00:00Z', thumbnail_url: null },
  { id: 'd4', caption: 'Kundenfeedback der Woche — das motiviert uns jeden Tag 💜 #kundenzufriedenheit #feedback', hashtags: ['kundenzufriedenheit','feedback'], views: 31600, likes: 2180, comments: 119, shares: 320, saves: 540, reach: 28400, impressions: 34500, length_seconds: 22, posted_at: '2026-04-08T09:15:00Z', thumbnail_url: null },
]

function ConnectSection({ customerId }) {
  const connectInstagram  = useStore(s => s.connectInstagram)
  const saveInstagramCache = useStore(s => s.saveInstagramCache)
  const [token, setToken]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const handleConnect = async () => {
    if (!token.trim()) return
    setLoading(true); setError(null)
    try {
      const user = await fetchInstagramUser(token.trim())
      connectInstagram(customerId, { accessToken: token.trim(), username: user.username, userId: user.id })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDemo = () => {
    connectInstagram(customerId, { accessToken: 'DEMO', username: 'demo_account', userId: 'demo' })
    saveInstagramCache(customerId, DEMO_REELS)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', padding: '32px 36px',
      }}>
        {/* Instagram logo area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Instagram verbinden</h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Instagram Graph API Access Token eingeben</p>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 8 }}>
            <strong>So erhältst du deinen Access Token:</strong>
          </p>
          <ol style={{ paddingLeft: 16, fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}>
            <li>Gehe zu <strong style={{ color: 'var(--text2)' }}>developers.facebook.com</strong> → Graph API Explorer</li>
            <li>Wähle deine Facebook App und setze die Permissions: <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>instagram_basic</code>, <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>instagram_manage_insights</code></li>
            <li>Klicke auf "Generate Access Token" und kopiere den Token</li>
          </ol>
          <p style={{ fontSize: 11, color: 'var(--text4)', marginTop: 8 }}>
            Hinweis: Insights (Views, Reach etc.) benötigen ein Instagram Business- oder Creator-Konto.
          </p>
        </div>

        {/* Token input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
            Access Token
          </label>
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="EAAxxxxxxxxxxxxx..."
            type="password"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.4)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
            ⚠ {error}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={!token.trim() || loading}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 'var(--r-md)',
            background: token.trim() && !loading ? 'var(--p)' : 'var(--bg3)',
            border: 'none', color: token.trim() && !loading ? '#fff' : 'var(--text3)',
            fontSize: 13, fontWeight: 600, cursor: token.trim() && !loading ? 'pointer' : 'default',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          {loading ? 'Verbinde…' : 'Verbinden'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text4)' }}>oder</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button
          onClick={handleDemo}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 'var(--r-md)', marginTop: 16,
            background: 'transparent', border: '1px dashed var(--border2)',
            color: 'var(--text3)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--p3)'; e.currentTarget.style.color = 'var(--p)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text3)' }}
        >
          Demo-Daten laden (ohne Token testen)
        </button>
      </div>
    </div>
  )
}

function ReelCard({ reel }) {
  const [open, setOpen] = useState(false)
  const preview = (reel.caption || '').slice(0, 80)

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
      >
        {/* Thumbnail */}
        <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--bg3)', flexShrink: 0, overflow: 'hidden' }}>
          {reel.thumbnail_url
            ? <img src={reel.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎬</div>}
        </div>

        {/* Caption */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {preview || 'Kein Caption'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>{fmtDate(reel.posted_at)}</div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <StatPill label="Views"    value={fmt(reel.views)}    color="var(--p)" />
          <StatPill label="Likes"    value={fmt(reel.likes)} />
          <StatPill label="Shares"   value={fmt(reel.shares)} />
          <StatPill label="Saves"    value={fmt(reel.saves)} />
          <StatPill label="Reach"    value={fmt(reel.reach)} />
        </div>

        <svg width="12" height="12" fill="none" stroke="var(--text3)" viewBox="0 0 24 24"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--bg2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: reel.hashtags.length ? 12 : 0 }}>
            {[['Impressions', reel.impressions], ['Comments', reel.comments], ['Reach', reel.reach], ['Länge', reel.length_seconds ? `${reel.length_seconds}s` : '—']].map(([l, v]) => (
              <div key={l} style={{ background: 'var(--bg1)', borderRadius: 'var(--r-md)', padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{v != null ? fmt(v) : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          {reel.hashtags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {reel.hashtags.map(h => (
                <span key={h} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-pill)', background: 'var(--p5)', color: 'var(--p)', fontWeight: 500 }}>#{h}</span>
              ))}
            </div>
          )}
          {reel.caption && (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>{reel.caption}</p>
          )}
        </div>
      )}
    </div>
  )
}

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function InstagramPane({ customerId, customerName }) {
  const connection         = useStore(s => s.instagramConnections.find(c => c.customerId === customerId) ?? null)
  const cache              = useStore(s => s.instagramCache.find(c => c.customerId === customerId) ?? null)
  const disconnectInstagram = useStore(s => s.disconnectInstagram)
  const saveInstagramCache  = useStore(s => s.saveInstagramCache)

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [view, setView]       = useState('dashboard')

  const reels = cache?.reels ?? []

  const handleFetch = async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchAllReels(connection.accessToken)
      saveInstagramCache(customerId, data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    if (!reels.length) return
    const json = buildExportJson(customerName, reels)
    downloadJson(`${customerName.replace(/\s+/g, '_')}_instagram.json`, json)
  }

  if (!connection) return <ConnectSection customerId={customerId} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Connection header */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderBottom: 'none', margin: '16px 28px 0', borderRadius: 'var(--r-lg) var(--r-lg) 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #f09433 0%, #dc2743 50%, #bc1888 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>@{connection.username}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
            Verbunden {timeAgo(connection.connectedAt)}
            {cache?.fetchedAt && ` · Daten: ${timeAgo(cache.fetchedAt)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleFetch}
            disabled={loading}
            style={{ padding: '7px 16px', borderRadius: 'var(--r-md)', background: 'var(--p)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}
          >{loading ? 'Lädt…' : 'Daten abrufen'}</button>
          {reels.length > 0 && (
            <button
              onClick={handleExport}
              style={{ padding: '7px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              JSON exportieren
            </button>
          )}
          <button
            onClick={() => disconnectInstagram(customerId)}
            style={{ padding: '7px 12px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >Trennen</button>
        </div>
      </div>

      {/* View toggle tabs */}
      <div style={{ margin: '0 28px', background: 'var(--bg1)', border: '1px solid var(--border)', borderTop: '1px solid var(--border)', padding: '0 16px', display: 'flex', gap: 4, flexShrink: 0 }}>
        {[['dashboard', 'Dashboard'], ['reels', `Reels${reels.length ? ` (${reels.length})` : ''}`]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: view === v ? 600 : 400,
            color: view === v ? 'var(--p)' : 'var(--text3)',
            borderBottom: view === v ? '2px solid var(--p)' : '2px solid transparent',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      {error && (
        <div style={{ margin: '12px 28px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 12, color: 'var(--red)', flexShrink: 0 }}>
          ⚠ {error}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {reels.length === 0 ? (
          <div style={{ padding: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🎬</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Noch keine Daten</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Klicke auf "Daten abrufen" um Reels zu laden.</div>
            </div>
          </div>
        ) : view === 'dashboard' ? (
          <InstagramDashboard reels={reels} />
        ) : (
          <div style={{ padding: '20px 28px', overflowY: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reels.map(r => <ReelCard key={r.id} reel={r} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
