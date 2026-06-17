// Structured logging. Every line is a JSON object so the renderer debug panel and
// any file sink can parse it. No silent failures: errors are logged with context.

type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  [key: string]: unknown
}

let allToStderr = false

/** Route ALL log lines to stderr — used in CLI mode so stdout stays clean JSON. */
export function routeLogsToStderr(): void {
  allToStderr = true
}

function emit(level: Level, msg: string, fields?: LogFields): void {
  const line = JSON.stringify({ t: Date.now(), level, msg, ...fields })
  if (allToStderr || level === 'error' || level === 'warn') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
}

/** Normalize an unknown thrown value into a string for storage/display. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}
