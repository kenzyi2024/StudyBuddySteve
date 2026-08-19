/**
 * Authentication: password hashing (bcryptjs), stateless sessions via a JWT
 * stored in an httpOnly cookie, and an Express middleware that populates
 * req.userId.
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

export function issueSession(res, userId) {
  const token = jwt.sign({ uid: String(userId) }, secret(), { expiresIn: '7d' })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  })
}

export function clearSession(res) {
  res.clearCookie(COOKIE)
}

// Populate req.userId if a valid session cookie is present; never throws.
export function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE]
  if (token) {
    try {
      req.userId = jwt.verify(token, secret()).uid
    } catch {
      /* invalid/expired — treat as anonymous */
    }
  }
  next()
}

// Hard gate: 401 unless authenticated.
export function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })
  next()
}
