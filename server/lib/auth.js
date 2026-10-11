/**
 * Authentication: password hashing (bcryptjs) and stateless sessions via JWT.
 *
 * Two transports are supported so the app works both same-origin and across
 * domains (Vercel frontend ↔ separately-hosted backend):
 *   1. Authorization: Bearer <token>  — primary; immune to third-party-cookie
 *      blocking, so it's what the deployed cross-domain frontend uses.
 *   2. httpOnly cookie                — convenient for same-origin/local dev.
 *
 * Tokens are never accepted in the URL: query strings end up in logs, browser
 * history, and (for calendar subscriptions) third-party servers. Calendar
 * subscriptions use a separate read-only feed token instead (see /api/feed).
 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const COOKIE = 'steve_session'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  // Never sign real sessions with a publicly-known fallback.
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is not set')
  return 'dev_insecure_secret_change_me'
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

// Session tokens carry the user's tokenVersion (`tv`). Bumping the version
// (e.g. on password reset) invalidates every session issued before it.
export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ uid: String(userId), tv: tokenVersion }, secret(), { expiresIn: '7d' })
}

// Short-lived, single-purpose tokens (email verification, password reset).
// `tv` lets a reset link be single-use: once the password changes, the
// version moves on and the old link no longer matches.
export function signPurposeToken(userId, purpose, expiresIn = '1h', tokenVersion = 0) {
  return jwt.sign({ uid: String(userId), purpose, tv: tokenVersion }, secret(), { expiresIn })
}
// Returns the user id, or null. Use verifyPurposeTokenDetails when the token
// version also matters (password reset).
export function verifyPurposeToken(token, purpose) {
  return verifyPurposeTokenDetails(token, purpose)?.uid ?? null
}
export function verifyPurposeTokenDetails(token, purpose) {
  try {
    const d = jwt.verify(token, secret())
    return d.purpose === purpose ? { uid: d.uid, tv: d.tv ?? 0 } : null
  } catch {
    return null
  }
}

// Issue a session: sets the cookie AND returns the raw token for the body.
export function issueSession(res, userId, tokenVersion = 0) {
  const token = signToken(userId, tokenVersion)
  // Cross-site cookies require SameSite=None + Secure. Enable in production or
  // when explicitly configured; use Lax locally so http://localhost works.
  const crossSite =
    process.env.COOKIE_SAMESITE === 'none' || process.env.NODE_ENV === 'production'
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    secure: crossSite,
    maxAge: MAX_AGE_MS,
  })
  return token
}

export function clearSession(res) {
  res.clearCookie(COOKIE)
}

function tokenFromRequest(req) {
  const auth = req.headers?.authorization
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  if (req.cookies?.[COOKIE]) return req.cookies[COOKIE]
  return null
}

// Decode a session token → { uid, tv }, or null. Purpose tokens (email
// verification, password reset) share the signing secret but are NOT sessions,
// so they're rejected here — otherwise an emailed link would log you in.
export function verifySessionToken(token) {
  try {
    const d = jwt.verify(token, secret())
    if (d.purpose) return null
    return { uid: d.uid, tv: d.tv ?? 0 }
  } catch {
    return null
  }
}

// Populate req.userId / req.tokenVersion if a valid session token is present
// (Authorization header or cookie). The token version is checked against the user
// record by the gateway (see checkTokenVersion in index.js).
export function attachUser(req, _res, next) {
  const token = tokenFromRequest(req)
  const session = token ? verifySessionToken(token) : null
  if (session) {
    req.userId = session.uid
    req.tokenVersion = session.tv
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })
  next()
}
