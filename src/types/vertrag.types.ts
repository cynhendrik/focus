import type { TaxMode } from '@/types/finance.types'

export type VertragStatus = 'active' | 'paused' | 'ended'
export type IntervalUnit  = 'days' | 'weeks' | 'months' | 'years'

export interface VertragItem {
  title:     string
  quantity:  number
  unitPrice: number
  taxRate:   number
}

export interface Vertrag {
  id:              string
  accountId:       string
  title:           string
  intervalValue:   number
  intervalUnit:    IntervalUnit
  startDate:       string
  nextBillingDate: string
  endDate:         string | null
  status:          VertragStatus
  taxMode:         TaxMode
  notes:           string
  items:           VertragItem[]
  createdAt:       string
}

export interface CreateVertragPayload {
  accountId:     string
  title:         string
  intervalValue: number
  intervalUnit:  IntervalUnit
  startDate:     string
  endDate:       string | null
  taxMode:       TaxMode
  notes:         string
  items:         VertragItem[]
}

export function addInterval(dateISO: string, value: number, unit: IntervalUnit): string {
  const d = new Date(dateISO)
  if (unit === 'days')   d.setDate(d.getDate() + value)
  if (unit === 'weeks')  d.setDate(d.getDate() + value * 7)
  if (unit === 'months') d.setMonth(d.getMonth() + value)
  if (unit === 'years')  d.setFullYear(d.getFullYear() + value)
  return d.toLocaleDateString('sv')
}

export function intervalLabel(value: number, unit: IntervalUnit): string {
  const units: Record<IntervalUnit, [string, string]> = {
    days:   ['Tag',   'Tage'],
    weeks:  ['Woche', 'Wochen'],
    months: ['Monat', 'Monate'],
    years:  ['Jahr',  'Jahre'],
  }
  const [sg, pl] = units[unit]
  return `alle ${value} ${value === 1 ? sg : pl}`
}

export function calcVertragTotals(items: VertragItem[], taxMode: TaxMode) {
  const kleinunternehmer = taxMode === 'kleinunternehmer'
  const subtotal  = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice * 100) / 100, 0)
  const taxAmount = kleinunternehmer
    ? 0
    : items.reduce((s, i) => {
        const net = Math.round(i.quantity * i.unitPrice * 100) / 100
        return s + Math.round(net * (i.taxRate / 100) * 100) / 100
      }, 0)
  return {
    subtotal:  Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total:     Math.round((subtotal + taxAmount) * 100) / 100,
  }
}
