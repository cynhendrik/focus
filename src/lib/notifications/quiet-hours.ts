/**
 * Ruhezeiten-Logik der Präsenz-Schicht — pure Funktionen, kein Store-Zugriff.
 * „Ruhig aber präsent": nach quietFrom, vor quietUntil und (optional) am
 * Wochenende bleibt die App stumm.
 */
export interface QuietConfig {
  quietHoursEnabled: boolean
  quietFrom: string   // 'HH:MM'
  quietUntil: string  // 'HH:MM'
  weekendQuiet: boolean
}

export interface BriefingConfig extends QuietConfig {
  briefingEnabled: boolean
  briefingTime: string // 'HH:MM'
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function minutesOf(hhmm: string): number {
  // Ungültige/leere Zeitangaben nicht still als 00:00 interpretieren.
  if (!hhmm || !hhmm.includes(':')) return 0
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export function isQuietTime(d: Date, cfg: QuietConfig): boolean {
  // weekendQuiet wirkt unabhängig von quietHoursEnabled — Wochenende ist auch dann stumm, wenn Ruhezeiten aus sind.
  if (cfg.weekendQuiet && isWeekend(d)) return true
  if (!cfg.quietHoursEnabled) return false
  const now = d.getHours() * 60 + d.getMinutes()
  const from = minutesOf(cfg.quietFrom)
  const until = minutesOf(cfg.quietUntil)
  // Fenster über Mitternacht (18:00 → 07:00) korrekt behandeln.
  return from <= until ? now >= from && now < until : now >= from || now < until
}

export function shouldFireBriefing(
  now: Date, cfg: BriefingConfig, lastFiredDate: string, todayIso: string,
): boolean {
  if (!cfg.briefingEnabled) return false
  if (lastFiredDate === todayIso) return false
  if (isWeekend(now)) return false
  if (isQuietTime(now, cfg)) return false
  return now.getHours() * 60 + now.getMinutes() >= minutesOf(cfg.briefingTime)
}
