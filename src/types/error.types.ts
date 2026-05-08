export type ErrorKind =
  | 'Db'
  | 'Io'
  | 'Imap'
  | 'Auth'
  | 'NotFound'
  | 'Validation'
  | 'ExternalApi'

export interface AppError {
  kind: ErrorKind
  message: string
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value
  )
}

export function formatError(error: unknown): string {
  if (isAppError(error)) return `${error.kind}: ${error.message}`
  if (error instanceof Error) return error.message
  return String(error)
}
