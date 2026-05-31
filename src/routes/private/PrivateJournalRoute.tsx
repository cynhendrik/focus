// ─────────────────────────────────────────────────────────────────────────────
// Private Journal — "Wie war heute?" Drei Zeilen am Ende des Tages.
// Stimmungs-Chip + freier Text. Frueh oben einsehbar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react'
import { BookOpen, Save } from 'lucide-react'
import {
  useJournalStore,
  MOOD_LABEL, MOOD_COLOR,
  type JournalEntry, type JournalMood,
} from '@/store/journal.store'

const MOODS: JournalMood[] = ['energiegeladen', 'ruhig', 'fokussiert', 'muede', 'genervt']

function todayIso(): string {
  return new Date().toLocaleDateString('sv')
}

function fmtFullDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function relLabel(iso: string): string {
  const today = todayIso()
  if (iso === today) return 'Heute'
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (iso === y.toLocaleDateString('sv')) return 'Gestern'
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Heutiger Eintrag oder neuer Draft
function useTodayDraft() {
  const entries = useJournalStore(s => s.entries)
  const create  = useJournalStore(s => s.create)
  const update  = useJournalStore(s => s.update)

  const today = todayIso()

  // Existiert schon ein heutiger Eintrag? Sonst keinen automatisch anlegen —
  // erst beim Speichern. So bleibt die Eintrags-Liste sauber.
  const existing = useMemo(
    () => entries.find(e => e.date === today),
    [entries, today],
  )

  const [mood, setMood] = useState<JournalMood | undefined>(existing?.mood)
  const [body, setBody] = useState(existing?.body ?? '')
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setMood(existing?.mood)
    setBody(existing?.body ?? '')
  }, [existing?.id])

  const save = () => {
    if (existing) {
      update(existing.id, { body, mood })
    } else {
      const id = create(today)
      update(id, { body, mood })
    }
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1400)
  }

  return { existing, mood, setMood, body, setBody, save, savedFlash }
}

export function PrivateJournalRoute() {
  const entries = useJournalStore(s => s.entries)
  const { mood, setMood, body, setBody, save, savedFlash } = useTodayDraft()

  // Frueher Eintraege: alles ausser den heutigen, neueste zuerst.
  const today = todayIso()
  const past = useMemo(
    () => entries.filter(e => e.date !== today).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, today],
  )

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="priv-section-label">
        <BookOpen size={11} /> Journal
      </div>

      <h1 className="priv-title">Wie war heute?</h1>
      <p className="priv-subtitle">
        Ein paar Zeilen am Ende des Tages. Für dich, nicht für die Akte.
      </p>

      {/* ── Heute-Eintrag-Card ─────────────────────────────────────────── */}
      <div className="priv-card" style={{ marginBottom: 32 }}>
        {/* Datum-Label */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--priv-fg-dim)', fontWeight: 600,
          }}>
            <span>{new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            <span style={{ color: 'var(--priv-fg-dim)' }}>·</span>
            <span>{new Date().toLocaleDateString('de-DE', { weekday: 'long' })} · Heute</span>
          </div>
        </div>

        {/* Stimmungs-Chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {MOODS.map(m => (
            <MoodChip
              key={m}
              mood={m}
              active={mood === m}
              onClick={() => setMood(mood === m ? undefined : m)}
            />
          ))}
        </div>

        {/* Textfeld */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Was hat dich heute beschäftigt? Was lief gut?"
          style={{
            width: '100%', minHeight: 140,
            background: 'transparent', border: 'none', outline: 'none',
            resize: 'vertical',
            color: 'var(--priv-fg)', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.65,
            padding: 0, marginBottom: 12,
          }}
        />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--priv-fg-dim)', fontStyle: 'italic' }}>
            {savedFlash ? '✓ Gesichert' : '„Zwei Absätze, dann schreiben."'}
          </span>
          <button onClick={save} className="priv-btn">
            <Save size={13} />
            Eintrag sichern
          </button>
        </div>
      </div>

      {/* ── Frühere Einträge ───────────────────────────────────────────── */}
      <div className="priv-section-label">
        Frühere Einträge <span style={{
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
          Noch keine vergangenen Einträge. Heute kann der erste sein.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {past.slice(0, 12).map(e => <PastEntry key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  )
}

function MoodChip({ mood, active, onClick }: { mood: JournalMood; active: boolean; onClick: () => void }) {
  const color = MOOD_COLOR[mood]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 99,
        background: active ? `color-mix(in oklch, ${color} 18%, transparent)` : 'var(--priv-surface-2)',
        border: `1px solid ${active ? color : 'var(--priv-border)'}`,
        color: active ? color : 'var(--priv-fg-muted)',
        fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        transition: 'all 140ms',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 99, background: color, opacity: active ? 1 : 0.7,
      }} />
      {MOOD_LABEL[mood]}
    </button>
  )
}

function PastEntry({ entry }: { entry: JournalEntry }) {
  const color = entry.mood ? MOOD_COLOR[entry.mood] : 'var(--priv-fg-dim)'
  return (
    <div className="priv-card">
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8,
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
      }}>
        <span style={{ color: 'var(--priv-fg-muted)', fontWeight: 600 }}>
          {fmtFullDate(entry.date)}
        </span>
        {entry.mood && (
          <>
            <span style={{ color: 'var(--priv-fg-dim)' }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: color }} />
              {MOOD_LABEL[entry.mood]}
            </span>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--priv-fg-dim)', fontSize: 10 }}>
          {relLabel(entry.date)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--priv-fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {entry.body || <span style={{ color: 'var(--priv-fg-dim)', fontStyle: 'italic' }}>(leer)</span>}
      </div>
    </div>
  )
}
