/** Stabile, gut unterscheidbare Farbe pro Person (aus der User-ID gehasht). */
const PALETTE = [
  '#F2754F', // Koralle (Marke)
  '#5B8DEF', // Blau
  '#3FB68B', // Grün
  '#C77DFF', // Violett
  '#E6A23C', // Gold
  '#EA5455', // Rot
  '#2CB1BC', // Türkis
  '#B57EDC', // Lila
  '#4C9A2A', // Oliv
  '#E8875A', // Terrakotta
]

export function personColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
