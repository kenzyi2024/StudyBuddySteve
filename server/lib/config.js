/**
 * Startup config checks. In production the gateway must refuse to boot rather
 * than run with unsafe fallbacks (a publicly-known JWT secret, or an in-memory
 * store that silently loses every account and event on restart).
 */
export function productionConfigErrors(env = process.env) {
  if (env.NODE_ENV !== 'production') return []
  const errors = []
  if (!env.JWT_SECRET) errors.push('JWT_SECRET is not set')
  if (!env.MONGODB_URI) errors.push('MONGODB_URI is not set')
  return errors
}
