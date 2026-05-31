// ─────────────────────────────────────────────────────────────────────────────
// Wochen-Review — Freitag-Ritual: 3 Fragen + Wochen-Mood (1-5).
// Aktuelle Woche oben, vergangene Wochen kompakt darunter.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react'
import { CalendarCheck, CheckCircle2 } from 'lucide-react'
import {
  usePrivateReviewsStore,
  mondayOfWeek, isoWeekNumber,
  type WeekMood, type WeeklyReview,
} from '@/store/private-reviews.store'

const MOOD_EMOJI: Record<WeekMood, string> = { 1: '😣', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const MOOD_LABEL: Record<WeekMood, string> = {
  1: 'Schwer', 2: 'Zaeh', 3: 'Solide', 4: 'Gut', 5: 'Stark',
}

function fmtWeekRange(monday: string): string {
  const start = new Date(monday + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  return `${fmt(start)} – ${fmt(end)}`
}

export function WeeklyReviewRoute() {
  const reviews = usePrivateReviewsStore(s => s.reviews)
  const ensure  = usePrivateReviewsStore(s => s.ensure)
  const update  = usePrivateReviewsStore(s => s.update)

  // Aktuelle Woche
  const today = new Date().toLocaleDateString('sv')
  const monday = mondayOfWeek(today)
  const week = isoWeekNumber(monday)

  // Stelle sicher, dass es einen Review-Entry fuer diese Woche gibt
  useEffect(() => {
    ensure(monday)
  }, [monday, ensure])

  const current = useMemo(
    () => reviews.find(r => r.weekStart === monday) ?? ensure(monday),
    [reviews, monday, ensure],
  )
  const past = useMemo(
    () => reviews.filter(r => r.weekStart !== monday).sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [reviews, monday],
  )

  const [q1, setQ1] = useState(current.q1)
  const [q2, setQ2] = useState(current.q2)
  const [q3, setQ3] = useState(current.q3)
  const [mood, setMood] = useState<WeekMood | null>(current.mood)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setQ1(current.q1); setQ2(current.q2); setQ3(current.q3); setMood(current.mood)
  }, [current.id])

  // Auto-Save mit debounce
  useEffect(() => {
    const t = setTimeout(() => {
      update(current.id, { q1, q2, q3, mood })
    }, 400)
    return () => clearTimeout(t)
  }, [q1, q2, q3, mood, current.id, update])

  const completeReview = () => {
    update(current.id, { q1, q2, q3, mood })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1600)
  }

  // Friday-Hinweis
  const now = new Date()
  const fridayHint = now.getDay() === 5 ? `${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}.` : '17:30.'

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="priv-section-label">
        <CalendarCheck size={11} /> Wochen-Review
      </div>

      <h1 className="priv-title">
        Freitag, {fridayHint} <span className="muted">Dein Ritual.</span>
      </h1>
      <p className="priv-subtitle">
        Einmal die Woche zurückblicken — drei Fragen, fünf Minuten. So bleibt der Kurs
        deiner, nicht der der Termine.
      </p>

      {/* ── Current Review-Card ────────────────────────────────────────── */}
      <div className="priv-card" style={{ marginBottom: 32, padding: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--priv-fg-muted)', fontWeight: 600,
          }}>
            KW {week} · {fmtWeekRange(monday)}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--priv-accent)', fontWeight: 600,
          }}>
            Diese Woche
          </span>
        </div>

        <ReviewQuestion
          number={1}
          question="Was lief diese Woche gut?"
          placeholder="Wofuer bist du dankbar?"
          value={q1}
          onChange={setQ1}
        />
        <ReviewQuestion
          number={2}
          question="Was hat mich aufgehalten?"
          placeholder="Was hat Energie gekostet?"
          value={q2}
          onChange={setQ2}
        />
        <ReviewQuestion
          number={3}
          question="Fokus für nächste Woche"
          placeholder="Die eine Sache, die zaehlt."
          value={q3}
          onChange={setQ3}
        />

        {/* Mood */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          marginTop: 20, marginBottom: 16,
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--priv-fg-muted)' }}>
            Wie fühlt sich die Woche an?
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {([1, 2, 3, 4, 5] as WeekMood[]).map(m => (
              <button
                key={m}
                onClick={() => setMood(mood === m ? null : m)}
                title={MOOD_LABEL[m]}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: mood === m ? 'var(--priv-accent-soft)' : 'var(--priv-surface-2)',
                  border: `1px solid ${mood === m ? 'var(--priv-accent)' : 'var(--priv-border)'}`,
                  cursor: 'pointer', fontSize: 17,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 140ms',
                }}
              >
                {MOOD_EMOJI[m]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={completeReview} className="priv-btn">
            <CheckCircle2 size={13} />
            {savedFlash ? 'Review gesichert' : 'Review abschliessen'}
          </button>
        </div>
      </div>

      {/* ── Vergangene Wochen ──────────────────────────────────────────── */}
      <div className="priv-section-label">
        Vergangene Wochen <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--priv-fg-dim)',
          fontWeight: 400, letterSpacing: '0.05em', textTransform: 'none',
        }}>{past.length}</span>
      </div>

      {past.length === 0 ? (
        <div style={{
          padding: '20px 18px', borderRadius: 12,
          border: '1px dashed var(--priv-border)',
          color: 'var(--priv-fg-dim)', fontSize: 12.5,
          textAlign: 'center',
        }}>
          Noch kein Rueckblick. Erst nach der ersten Woche fuellt sich das Archiv.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {past.slice(0, 12).map(r => <PastWeek key={r.id} review={r} />)}
        </div>
      )}
    </div>
  )
}

function ReviewQuestion({
  number, question, placeholder, value, onChange,
}: {
  number: number
  question: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: 'var(--priv-surface-2)',
          border: '1px solid var(--priv-border)',
          color: 'var(--priv-fg-muted)',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {number}
        </span>
        <span style={{ fontSize: 13, color: 'var(--priv-fg)', fontWeight: 600 }}>
          {question}
        </span>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight: 70,
          background: 'var(--priv-surface-2)',
          border: '1px solid var(--priv-border)',
          borderRadius: 10,
          padding: '10px 12px',
          color: 'var(--priv-fg)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55,
          outline: 'none', resize: 'vertical',
        }}
      />
    </div>
  )
}

function PastWeek({ review }: { review: WeeklyReview }) {
  const week = isoWeekNumber(review.weekStart)
  const range = fmtWeekRange(review.weekStart)
  return (
    <div className="priv-card" style={{ padding: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
          color: 'var(--priv-fg-muted)', fontWeight: 600,
        }}>
          KW {week} · {range}
        </span>
        {review.mood && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--priv-accent)', fontWeight: 600,
          }}>
            {MOOD_EMOJI[review.mood]} {MOOD_LABEL[review.mood]}
          </span>
        )}
      </div>
      {review.q1 && (
        <div style={{ fontSize: 12.5, color: 'var(--priv-fg-muted)', marginBottom: 4 }}>
          <strong style={{ color: 'var(--priv-fg)' }}>Gut:</strong> {review.q1}
        </div>
      )}
      {review.q3 && (
        <div style={{ fontSize: 12.5, color: 'var(--priv-fg-muted)' }}>
          <strong style={{ color: 'var(--priv-fg)' }}>Fokus:</strong> {review.q3}
        </div>
      )}
    </div>
  )
}
