/**
 * Sammelt schnell aufeinanderfolgende Aufrufe und führt `fn` erst aus, wenn `waitMs`
 * lang Ruhe herrscht. Genutzt z. B. im Realtime-Handler, damit ein Sturm an
 * Tabellen-Änderungs-Events (Bulk-/Mehrfach-Writes) nur EINEN Reload-Zyklus auslöst
 * statt einen pro Event. `cancel()` löscht einen ausstehenden Aufruf (Effekt-Cleanup).
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void
  cancel: () => void
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: A) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, waitMs)
  }

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return debounced
}
