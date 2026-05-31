// ─────────────────────────────────────────────────────────────────────────────
// Lead-Score helpers — shared zwischen LeadScoreCard und ClientsRoute.
// Alle Funktionen sind pure und ohne Side-Effects.
//
// Score ist 0–100 und wird im Backend von der Rules Engine berechnet.
// `scoreFactors` ist ein Record<rule_key, points> mit positiven UND negativen
// Beitraegen (z.B. { qualified_meeting: 25, no_reply_7d: -10 }).
// ─────────────────────────────────────────────────────────────────────────────

export type ScoreBucket = 'cold' | 'warm' | 'hot'

export function scoreBucket(score: number): ScoreBucket {
  if (score >= 70) return 'hot'
  if (score >= 40) return 'warm'
  return 'cold'
}

export function scoreColor(score: number): string {
  const b = scoreBucket(score)
  if (b === 'hot')  return '#D0FC69'
  if (b === 'warm') return '#f59e0b'
  return '#ef4444'
}

export function bucketLabel(bucket: ScoreBucket): string {
  if (bucket === 'hot')  return 'Hot'
  if (bucket === 'warm') return 'Warm'
  return 'Cold'
}

// snake_case rule key → "Snake Case" — fuer die Breakdown-Bars.
export function prettyFactor(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export interface FactorEntry {
  key:    string
  label:  string
  points: number
}

// Sortiert die Faktoren nach absolutem Wert (groesste Treiber zuerst),
// damit der wichtigste Beitrag immer oben steht — egal ob positiv oder negativ.
export function rankFactors(factors: Record<string, number>): FactorEntry[] {
  return Object.entries(factors)
    .map(([key, points]) => ({ key, label: prettyFactor(key), points }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
}

