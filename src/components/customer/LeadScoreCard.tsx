// ─────────────────────────────────────────────────────────────────────────────
// LeadScoreCard — visualisiert den von der Rules Engine berechneten Lead
// Score eines Kunden: links ein Donut-Ring mit der Score-Zahl in der Bucket-
// Farbe (cold/warm/hot), rechts der Breakdown nach scoreFactors als
// horizontale Bars. Antwortet auf die Frage "warum hat dieser Kunde Score X?".
// ─────────────────────────────────────────────────────────────────────────────

import {
  scoreBucket, scoreColor, bucketLabel, rankFactors,
} from '@/lib/lead-score'

interface Props {
  score:   number
  factors: Record<string, number>
}

// SVG-Donut: 56px radius, 8px stroke. Stroke-Dashoffset codiert den Score.
function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score)
  const label = bucketLabel(scoreBucket(score))
  const r = 56
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const offset = c * (1 - pct)
  const size = 140 // viewBox

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="var(--border)" strokeWidth={8}
      />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 480ms ease-out' }}
      />
      {/* Center label */}
      <text
        x="50%" y="50%" textAnchor="middle"
        dominantBaseline="central" dy="-6"
        style={{
          fill: color, fontFamily: 'var(--font-mono)',
          fontSize: 32, fontWeight: 700,
        }}
      >
        {Math.round(score)}
      </text>
      <text
        x="50%" y="50%" textAnchor="middle"
        dominantBaseline="central" dy="18"
        style={{
          fill: color, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}
      >
        {label}
      </text>
    </svg>
  )
}

function FactorRow({ label, points, score }: {
  label:  string
  points: number
  score:  number
}) {
  const positive = points >= 0
  const color = positive ? scoreColor(score) : '#ef4444'
  // Bar-Breite relativ zum Score. Bei score=0 -> 0%, sonst |points|/score.
  // Negative Faktoren werden gegen denselben Maßstab gezeichnet, damit man
  // sieht "wie viel haette der Score sein koennen ohne diesen Abzug".
  const denom = Math.max(1, Math.abs(score), Math.abs(points))
  const width = Math.min(100, (Math.abs(points) / denom) * 100)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr 44px',
      alignItems: 'center', gap: 10,
    }}>
      <span style={{
        fontSize: 11.5, color: 'var(--fg)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{
        height: 6, borderRadius: 99,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${width}%`, height: '100%',
          background: color, opacity: positive ? 1 : 0.85,
          transition: 'width 380ms ease-out',
        }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        fontWeight: 600, color, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {positive ? '+' : ''}{points}
      </span>
    </div>
  )
}

export function LeadScoreCard({ score, factors }: Props) {
  const ranked = rankFactors(factors).slice(0, 6) // max 6 rows
  const isEmpty = score === 0 && ranked.length === 0

  return (
    <div style={{
      borderRadius: 16, border: '1px solid var(--border)',
      background: 'var(--bg1)', padding: 18,
      display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24,
      alignItems: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ScoreRing score={score} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', fontWeight: 600,
          }}>
            Lead Score
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginTop: 2 }}>
            Berechnet von der Rules Engine
          </div>
        </div>

        {isEmpty ? (
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', paddingTop: 4 }}>
            Noch keine Aktivität — sobald Regeln greifen, erscheint hier der Breakdown.
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            paddingTop: 4, borderTop: '1px solid var(--border)',
          }}>
            {ranked.map(f => (
              <FactorRow key={f.key} label={f.label} points={f.points} score={score} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
