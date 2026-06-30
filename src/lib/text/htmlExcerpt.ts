/**
 * Wandelt Rich-Text-HTML (TipTap) in einen einzeiligen Klartext-Auszug für
 * Vorschauen (z. B. eine Dokument-Notiz im Verlauf). Entfernt Tags, dekodiert
 * die häufigsten Entities, kollabiert Whitespace und kürzt mit Ellipse.
 */
export function htmlToExcerpt(html: string | null | undefined, maxLen = 140): string {
  if (!html) return ''
  const text = html
    .replace(/<[^>]*>/g, ' ')   // Tags entfernen
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')       // Whitespace kollabieren
    .trim()
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1).trimEnd() + '…'
}
