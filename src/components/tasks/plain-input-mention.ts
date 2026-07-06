export interface ResolvedInputMention { marker: string; id: string }

/** Fuegt den gewaehlten Marker ("@Klara ") an Stelle des "@query"-Tokens ein. */
export function insertMentionMarker(
  value: string, startOffset: number, cursorOffset: number, marker: string,
): { value: string; cursor: number } {
  const before = value.slice(0, startOffset)
  const after = value.slice(cursorOffset)
  const inserted = `${marker} `
  return { value: `${before}${inserted}${after}`, cursor: before.length + inserted.length }
}

/**
 * Entfernt aufgeloeste "@Marker"-Tokens aus dem Text und liefert die zugehoerige
 * assigneeId (letzter Treffer gewinnt -- gleiche Konvention wie parseTaskText).
 * Bewusst NICHT der volle prefix-parser (kein !!/~30m/#tag/Datum).
 */
export function stripResolvedMentions(
  text: string, mentions: ResolvedInputMention[],
): { cleanTitle: string; assigneeId?: string } {
  const mentionMap = new Map(mentions.map(m => [m.marker.toLowerCase(), m.id]))
  let assigneeId: string | undefined
  const parts = text.split(/\s+/).filter(Boolean).filter(token => {
    if (token.toLowerCase().startsWith('@')) {
      const id = mentionMap.get(token.toLowerCase())
      if (id) { assigneeId = id; return false }
    }
    return true
  })
  return { cleanTitle: parts.join(' '), assigneeId }
}

/**
 * Anker-Position (Pixel) fuer das Popover unterhalb des Cursors in einem
 * normalen Input -- per Canvas-Textmessung statt ProseMirror-coordsAtPos.
 * Faellt auf die linke Feldkante zurueck, wenn Canvas nicht verfuegbar ist.
 */
export function getInputCaretAnchor(input: HTMLInputElement): { top: number; left: number } {
  const rect = input.getBoundingClientRect()
  const style = window.getComputedStyle(input)
  const paddingLeft = parseFloat(style.paddingLeft) || 0
  let offsetX = 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    offsetX = ctx.measureText(input.value.slice(0, input.selectionStart ?? 0)).width
  }
  return { top: rect.bottom + 4, left: rect.left + paddingLeft + offsetX }
}
