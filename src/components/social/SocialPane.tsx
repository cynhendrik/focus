import { useState } from 'react'

interface Props {
  customerId: string
}

interface ReelEntry {
  id: string
  caption: string
  views: number
  likes: number
  comments: number
  postedAt: string
}

const DEMO_REELS: ReelEntry[] = [
  { id: '1', caption: 'Morgens mit einem guten Kaffee starten ☕ #morgenroutine', views: 48200, likes: 3140, comments: 87, postedAt: '2026-05-01' },
  { id: '2', caption: 'Social-Media-Strategie in 3 Schritten 🚀 #marketing', views: 124500, likes: 8920, comments: 304, postedAt: '2026-04-22' },
  { id: '3', caption: 'Behind the scenes: ein Tag im Büro 🎬 #teamwork', views: 19800, likes: 1240, comments: 43, postedAt: '2026-04-15' },
]

export function SocialPane({ customerId }: Props) {
  const [token, setToken] = useState('')
  const [connected, setConnected] = useState(false)
  const [username, setUsername] = useState('')

  const connect = () => {
    if (!token.trim()) return
    setConnected(true)
    setUsername('@kunde_demo')
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="text-4xl">📸</div>
        <p className="text-sm font-medium text-[var(--text)]">Instagram verbinden</p>
        <p className="text-xs text-[var(--text2)] text-center max-w-xs">
          Verbinde das Instagram-Konto des Kunden, um Reichweite, Engagement und Reel-Performance direkt hier zu sehen.
        </p>
        <div className="flex gap-2 w-full max-w-sm">
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Instagram Access Token"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={connect} className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">
            Verbinden
          </button>
        </div>
      </div>
    )
  }

  const totalViews = DEMO_REELS.reduce((s, r) => s + r.views, 0)
  const avgLikes = Math.round(DEMO_REELS.reduce((s, r) => s + r.likes, 0) / DEMO_REELS.length)
  const engagementRate = ((DEMO_REELS.reduce((s, r) => s + r.likes + r.comments, 0) / totalViews) * 100).toFixed(1)

  return (
    <div className="flex flex-col gap-6">
      {/* Account header */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--bg1)]">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg">
          📸
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--text)]">{username}</p>
          <p className="text-xs text-[var(--text2)]">Verbunden</p>
        </div>
        <button onClick={() => setConnected(false)} className="text-xs text-[var(--text2)] hover:text-red-400">
          Trennen
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Gesamt-Views', value: fmtNumber(totalViews) },
          { label: 'Ø Likes', value: fmtNumber(avgLikes) },
          { label: 'Engagement', value: `${engagementRate}%` },
        ].map(stat => (
          <div key={stat.label} className="p-3 rounded-lg bg-[var(--bg1)] text-center">
            <p className="text-lg font-bold text-primary">{stat.value}</p>
            <p className="text-xs text-[var(--text2)]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Reels */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider mb-2">Letzte Reels</h3>
        <div className="flex flex-col gap-2">
          {DEMO_REELS.map(reel => (
            <div key={reel.id} className="p-3 rounded-lg bg-[var(--bg1)] flex gap-4 items-center">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text)] truncate">{reel.caption}</p>
                <p className="text-[10px] text-[var(--text2)] mt-0.5">{reel.postedAt}</p>
              </div>
              <div className="flex gap-3 text-xs text-[var(--text2)] flex-shrink-0">
                <span>{fmtNumber(reel.views)} 👁</span>
                <span>{fmtNumber(reel.likes)} ♥</span>
                <span>{reel.comments} 💬</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function fmtNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
