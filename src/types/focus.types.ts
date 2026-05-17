export type FocusBucket = 'today' | 'tomorrow' | 'this_week' | 'later'

export interface FocusTodo {
  id: string
  title: string
  customer?: string
  notes?: string
  when: FocusBucket
}

export const BUCKET_CONFIG: Record<FocusBucket, { label: string; color: string }> = {
  today:     { label: 'Heute',       color: '#E74C3C' },
  tomorrow:  { label: 'Morgen',      color: '#F1C40F' },
  this_week: { label: 'Diese Woche', color: '#3498DB' },
  later:     { label: 'Später',      color: '#BDC3C7' },
}
