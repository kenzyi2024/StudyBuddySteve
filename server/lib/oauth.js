/**
 * OAuth 2.0 (authorization-code flow) for Google Calendar and Microsoft Graph.
 *
 * No SDK — just the two HTTP calls each provider needs (authorize + token).
 * Credentials come from env (see .env.example / OAUTH_SETUP.md).
 */
import crypto from 'crypto'

export const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: () =>
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/oauth/google/callback',
    // Google needs these to return a refresh_token
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  outlook: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access Calendars.ReadWrite User.Read',
    clientId: () => process.env.MS_CLIENT_ID,
    clientSecret: () => process.env.MS_CLIENT_SECRET,
    redirectUri: () =>
      process.env.MS_REDIRECT_URI || 'http://localhost:4000/api/oauth/outlook/callback',
    extraAuthParams: {},
  },
}

export function isConfigured(provider) {
  const p = PROVIDERS[provider]
  return !!(p && p.clientId() && p.clientSecret())
}

// --- state (CSRF + courseId round-trip) ---
// Signed, short-lived state so the callback knows which course to sync without
// a session store. HMAC prevents tampering.
function stateSecret() {
  return process.env.JWT_SECRET || 'dev_state_secret'
}

export function encodeState(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function decodeState(state) {
  if (!state || !state.includes('.')) return null
  const [body, sig] = state.split('.')
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  const data = JSON.parse(Buffer.from(body, 'base64url').toString())
  // reject states older than 10 minutes
  if (Date.now() - data.ts > 10 * 60 * 1000) return null
  return data
}

// --- authorize URL ---
export function buildAuthUrl(provider, state) {
  const p = PROVIDERS[provider]
  const params = new URLSearchParams({
    client_id: p.clientId(),
    redirect_uri: p.redirectUri(),
    response_type: 'code',
    scope: p.scope,
    state,
    ...p.extraAuthParams,
  })
  return `${p.authUrl}?${params}`
}

// --- exchange authorization code for tokens ---
export async function exchangeCode(provider, code) {
  const p = PROVIDERS[provider]
  const body = new URLSearchParams({
    client_id: p.clientId(),
    client_secret: p.clientSecret(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: p.redirectUri(),
  })
  const resp = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) throw new Error(`${provider} token exchange failed: ${resp.status} ${await resp.text()}`)
  const t = await resp.json()
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token || null,
    expiry: Date.now() + (t.expires_in || 3600) * 1000,
  }
}

// --- refresh an expired access token ---
export async function refreshAccessToken(provider, refreshToken) {
  const p = PROVIDERS[provider]
  const body = new URLSearchParams({
    client_id: p.clientId(),
    client_secret: p.clientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const resp = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) throw new Error(`${provider} token refresh failed: ${resp.status}`)
  const t = await resp.json()
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token || refreshToken,
    expiry: Date.now() + (t.expires_in || 3600) * 1000,
  }
}
