/**
 * Thin client for the Study Buddy Steve gateway.
 *
 * BASE resolves in this order: VITE_API_BASE if set, else the Vite proxy
 * ('/api' → localhost:4000) in dev, else the deployed gateway in production.
 * The gateway URL is a public endpoint (it ships in the browser bundle either
 * way), so hard-coding the prod default is safe and means the app works without
 * any Vercel env var. Auth uses a bearer token (localStorage) as the primary
 * transport so sessions survive across domains where cookies are blocked.
 */
import type { StudyPrefs } from '../types'

type Json = any

// Deployed Node/Express gateway on Cloud Run (public URL).
const PROD_API = 'https://steve-gateway-spzxweozdq-uc.a.run.app/api'
const BASE = (
  import.meta.env?.VITE_API_BASE || (import.meta.env?.DEV ? '/api' : PROD_API)
).replace(/\/$/, '')

const TOKEN_KEY = 'steve_token'
let authToken: string | null = null
try {
  authToken = localStorage.getItem(TOKEN_KEY)
} catch {
  /* localStorage unavailable (SSR / privacy mode) */
}

export function setToken(token: string | null): void {
  authToken = token || null
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
export function getToken(): string | null {
  return authToken
}

// fetch wrapper: attach bearer token + include cookies.
function req(path: string, opts: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers || {}) }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  return fetch(`${BASE}${path}`, { credentials: 'include', ...opts, headers })
}

async function json(res: Response): Promise<Json> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).error || detail
    } catch {
      /* ignore */
    }
    const err = new Error(`${detail}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

const jsonHeaders = { 'Content-Type': 'application/json' }

// The browser's IANA timezone. Sent at sign-in so reminders fire at the right
// real-world time (deadlines are stored as wall-clock times).
export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

// --- auth ---
export async function me(): Promise<Json> {
  return json(await req('/auth/me'))
}
export async function register(body: { email: string; password: string; name?: string }): Promise<Json> {
  const r = await json(
    await req('/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...body, tz: TZ }) }),
  )
  if (r.token) setToken(r.token)
  return r
}
export async function login(body: { email: string; password: string }): Promise<Json> {
  const r = await json(
    await req('/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...body, tz: TZ }) }),
  )
  if (r.token) setToken(r.token)
  return r
}
export async function logout(): Promise<Json> {
  try {
    return await json(await req('/auth/logout', { method: 'POST' }))
  } finally {
    setToken(null)
  }
}
export async function forgotPassword(email: string): Promise<Json> {
  return json(await req('/auth/forgot', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email }) }))
}
export async function resetPassword(token: string, password: string): Promise<Json> {
  const r = await json(
    await req('/auth/reset', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token, password }) }),
  )
  if (r.token) setToken(r.token)
  return r
}
export async function verifyEmail(token: string): Promise<Json> {
  return json(await req('/auth/verify', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token }) }))
}
export async function saveTimezone(tz: string): Promise<Json> {
  return json(await req('/me/timezone', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tz }) }))
}
export async function resendVerification(): Promise<Json> {
  return json(await req('/auth/resend-verification', { method: 'POST' }))
}

// --- uploads & parsing ---
export async function uploadSyllabus(file: File, meta: { course?: string; term?: string } = {}): Promise<Json> {
  const form = new FormData()
  form.append('file', file)
  if (meta.course) form.append('course', meta.course)
  if (meta.term) form.append('term', meta.term)
  return json(await req('/uploads', { method: 'POST', body: form }))
}
export async function getJob(jobId: string): Promise<Json> {
  return json(await req(`/jobs/${jobId}`))
}
export async function pollJob(
  jobId: string,
  {
    onPhase,
    intervalMs = 700,
    timeoutMs = 60000,
  }: { onPhase?: (status: string, job: Json) => void; intervalMs?: number; timeoutMs?: number } = {},
): Promise<Json> {
  const start = Date.now()
  let last: string | null = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await getJob(jobId)
    if (job.status !== last) {
      last = job.status
      onPhase?.(job.status, job)
    }
    if (job.status === 'done' || job.status === 'error') return job
    if (Date.now() - start > timeoutMs) throw new Error('parse timed out')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

// --- events ---
export async function patchEvent(eventId: string, patch: Record<string, unknown>): Promise<Json> {
  return json(await req(`/events/${eventId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(patch) }))
}
export async function deleteEvent(eventId: string): Promise<Json> {
  return json(await req(`/events/${eventId}`, { method: 'DELETE' }))
}
export async function commitCourse(courseId: string): Promise<Json> {
  return json(await req(`/courses/${courseId}/commit`, { method: 'POST' }))
}
export async function getMyEvents(): Promise<Json> {
  return json(await req('/me/events'))
}
// Syllabi parsed but not yet added to the calendar: [{ courseId, name, count }].
export async function getPendingReviews(): Promise<Json> {
  return json(await req('/me/pending'))
}
export async function getCourseEvents(courseId: string): Promise<Json> {
  return json(await req(`/courses/${courseId}/events`))
}
export async function discardPendingReview(courseId: string): Promise<Json> {
  return json(await req(`/courses/${courseId}/pending`, { method: 'DELETE' }))
}

// --- import from another calendar ---
export async function importIcsFile(file: File): Promise<Json> {
  const form = new FormData()
  form.append('file', file)
  form.append('tz', TZ)
  return json(await req('/import/ics', { method: 'POST', body: form }))
}
export async function importIcsUrl(url: string): Promise<Json> {
  return json(await req('/import/ics', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ url, tz: TZ }) }))
}
export async function importCanvas(url: string): Promise<Json> {
  return json(await req('/import/canvas', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ url, tz: TZ }) }))
}
export async function canvasStatus(): Promise<Json> {
  try {
    return await json(await req('/me/canvas'))
  } catch {
    return { connected: false, lastSync: null }
  }
}
export async function syncCanvas(): Promise<Json> {
  return json(await req('/import/canvas/sync', { method: 'POST' }))
}
export async function disconnectCanvas(): Promise<Json> {
  return json(await req('/me/canvas', { method: 'DELETE' }))
}

// --- study plan ---
export async function saveStudyPrefs(prefs: Partial<StudyPrefs>): Promise<Json> {
  return json(await req('/me/study-prefs', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ prefs }) }))
}
export async function buildStudyPlan(): Promise<Json> {
  return json(await req('/me/study-plan', { method: 'POST' }))
}

// --- reminders / web push ---
export async function reminderStatus(): Promise<Json> {
  try {
    return await json(await req('/reminders/status'))
  } catch {
    return { push: false, sms: false }
  }
}
export async function saveReminderPrefs(prefs: {
  phone?: string
  smsEnabled?: boolean
  emailReminders?: boolean
  reminderLead?: number
}): Promise<Json> {
  return json(await req('/me/reminders', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(prefs) }))
}
export async function getPushKey(): Promise<Json> {
  return json(await req('/push/key'))
}
export async function subscribePush(subscription: PushSubscription): Promise<Json> {
  return json(await req('/push/subscribe', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(subscription) }))
}
export async function unsubscribePush(endpoint: string): Promise<Json> {
  return json(await req('/push/unsubscribe', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ endpoint }) }))
}

// --- calendar files & subscription feed ---
// Absolute gateway base (BASE is relative '/api' in dev behind the Vite proxy).
function absoluteBase(): string {
  return new URL(BASE, window.location.origin).href.replace(/\/$/, '')
}

// Download an .ics through an authenticated request (no token in the URL).
async function downloadIcs(path: string, filename: string): Promise<void> {
  const res = await req(path)
  if (!res.ok) await json(res) // throws with the server's message
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function downloadMyCalendar(): Promise<void> {
  return downloadIcs('/me/calendar.ics', 'my-semester.ics')
}

// Read-only subscription URL for calendar apps. It contains a feed-only secret
// (not the login token), and resetFeedUrl() invalidates the old link.
const feedUrlFor = (token: string) => `${absoluteBase()}/feed/${token}.ics`
export async function getFeedUrl(): Promise<string> {
  const { token } = await json(await req('/me/feed'))
  return feedUrlFor(token)
}
export async function resetFeedUrl(): Promise<string> {
  const { token } = await json(await req('/me/feed/rotate', { method: 'POST' }))
  return feedUrlFor(token)
}
