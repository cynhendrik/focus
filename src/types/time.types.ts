export interface TimeEntry {
  id: string
  customerId: string
  description: string
  minutes: number
  date: string
  createdAt: string
}

export interface AddTimeEntryPayload {
  customerId: string
  description: string
  minutes: number
  date: string
}
