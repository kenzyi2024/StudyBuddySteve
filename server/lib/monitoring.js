/**
 * Error tracking via Sentry. Enabled only when SENTRY_DSN is set; otherwise a
 * no-op. Loaded lazily so the dependency is optional at runtime.
 */
let Sentry = null

export async function initMonitoring() {
  if (!process.env.SENTRY_DSN) return false
  try {
    Sentry = await import('@sentry/node')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
    })
    return true
  } catch {
    Sentry = null
    return false
  }
}

export function captureError(err) {
  if (!Sentry) return
  try {
    Sentry.captureException(err)
  } catch {
    /* ignore */
  }
}
