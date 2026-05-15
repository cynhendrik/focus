export interface Deadline {
  id: string
  customerId: string
  title: string
  dueDate: string
  done: boolean
  createdAt: string
}

export interface UpsertDeadlinePayload {
  id?: string
  customerId: string
  title: string
  dueDate: string
  done?: boolean
}
