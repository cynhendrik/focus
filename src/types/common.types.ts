import type { AppError } from './error.types'

export type ID = string

export interface TimestampedEntity {
  createdAt: string
  updatedAt: string
}

export interface AsyncState<T> {
  data: T
  isLoading: boolean
  error: AppError | null
}
