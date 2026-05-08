const isDev = import.meta.env.DEV

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
  [key: string]: unknown
}

function format(level: LogLevel, message: string, ctx?: LogContext): string {
  const timestamp = new Date().toISOString()
  const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctxStr}`
}

export const log = {
  info(message: string, ctx?: LogContext): void {
    if (isDev) console.info(format('info', message, ctx))
  },
  warn(message: string, ctx?: LogContext): void {
    console.warn(format('warn', message, ctx))
  },
  error(message: string, ctx?: LogContext): void {
    console.error(format('error', message, ctx))
  },
  debug(message: string, ctx?: LogContext): void {
    if (isDev) console.debug(format('debug', message, ctx))
  },
}
