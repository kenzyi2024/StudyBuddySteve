/**
 * Authentication: password hashing (bcryptjs) and stateless sessions via JWT.
 *
 * Two transports are supported so the app works both same-origin and across
 * domains (Vercel frontend ↔ separately-hosted backend):
 *   1. Authorization: Bearer <token>  — primary; immune to third-party-cookie
 *      blocking, so it's what the deployed cross-domain frontend uses.
 *   2. httpOnly cookie                — convenient for same-origin/local dev.
 *
 * A token is also accepted as ?token= for endpoints reached by top-level
 * navigation or plain links (OAuth start, .ics download) that can't set headers.
 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const COOKIE = 'steve_session'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function secret() {
  return process.env.JWT_SECRET || 'dev_insecure_secret_change_me'
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

export function signToken(userId) {
  return jwt.sign({ uid: String(userId) }, secret(), { expiresIn: '7d' })
}

// Issue a session: sets the cookie AND returns the raw token for the body.
export function issueSession(res, userId) {
  const token = signToken(userId)
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
  if (req.query?.token) return String(req.query.token)
  return null
}

// Populate req.userId if a valid token is present (header, cookie, or query).
export function attachUser(req, _res, next) {
  const token = tokenFromRequest(req)
  if (token) {
    try {
      req.userId = jwt.verify(token, secret()).uid
    } catch {
      /* invalid/expired — anonymous */
    }
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })
  next()
}
