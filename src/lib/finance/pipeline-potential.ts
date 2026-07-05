import type { Deal, PipelineStage } from '@/types/pipeline.types'

/** Summe der Werte aller offenen Deals. Won/Lost über die Stage-Flags
 *  aufgelöst (Stages sind umbenennbar); Namens-Fallback für Alt-Daten.
 *  Bewusst ungewichtet — Stage-Wahrscheinlichkeiten wären Pseudo-Präzision. */
export function pipelinePotential(deals: Deal[], stages: PipelineStage[]): number {
  const byName = new Map(stages.map(s => [s.name, s]))
  let sum = 0
  for (const d of deals) {
    const st = byName.get(d.stage)
    const won  = st ? st.isWon  : d.stage === 'won'
    const lost = st ? st.isLost : d.stage === 'lost'
    if (won || lost) continue
    sum += d.value ?? 0
  }
  return Math.round(sum * 100) / 100
}
