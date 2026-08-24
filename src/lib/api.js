/**
 * Thin client for the Study Buddy Steve gateway.
 *
 * BASE resolves to:
 *   - dev:  '/api'  (Vite proxies it to the local gateway)
 *   - prod: VITE_API_BASE, e.g. 'https://your-backend.onrender.com/api'
 *
 * Auth uses a bearer token (stored in localStorage) as the primary transport
 * so sessions survive across domains where third-party cookies are blocked;
 * cookies still ride along for same-origin dev.
 */
const BASE = (import.meta.env?.VITE_API_BASE || '/api').replace(/\/$/, '')

const TOKEN_KEY = 'steve_token'
let authToken = null
try {
  authToken = localStorage.getItem(TOKEN_KEY)
} catch {
  /* localStorage unavailable (SSR / privacy mode) */
}

export function setToken(token) {
  authToken = token || null
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
export function getToken() {
  return authToken
}

// fetch wrapper: attach bearer token + include cookies.
function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  return fetch(`${BASE}${path}`, { credentials: 'include', ...opts, headers })
}

async function json(res) {
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).error || detail
    } catch {
      /* ignore */
    }
    const err = new Error(`${detail}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

// --- auth ---
export async function me() {
  return json(await req('/auth/me'))
}
export async function register({ email, password, name }) {
  const r = await json(
    await req('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    }),
  )
  if (r.token) setToken(r.token)
  return r
}
export async function login({ email, password }) {
  const r = await json(
    await req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
  if (r.token) setToken(r.token)
  return r
}
export async function logout() {
  try {
    return await json(await req('/auth/logout', { method: 'POST' }))
  } finally {
    setToken(null)
  }
}

// --- uploads & parsing ---
export async function uploadSyllabus(file, meta = {}) {
  const form = new FormData()
  form.append('file', file)
  if (meta.course) form.append('course', meta.course)
  if (meta.term) form.append('term', meta.term)
  return json(await req('/uploads', { method: 'POST', body: form }))
}

export async function getJob(jobId) {
  return json(await req(`/jobs/${jobId}`))
}

export async function pollJob(jobId, { onPhase, intervalMs = 700, timeoutMs = 60000 } = {}) {
  const start = Date.now()
  let last = null
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
export async function patchEvent(eventId, patch) {
  return json(
    await req(`/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}
export async function deleteEvent(eventId) {
  return json(await req(`/events/${eventId}`, { method: 'DELETE' }))
}
export async function approveCourse(courseId) {
  return json(await req(`/courses/${courseId}/approve`, { method: 'POST' }))
}

// Commit parsed events to the account calendar (after the student reviews them).
export async function commitCourse(courseId) {
  return json(await req(`/courses/${courseId}/commit`, { method: 'POST' }))
}

// All of the signed-in user's events across every course.
export async function getMyEvents() {
  return json(await req('/me/events'))
}

// --- import from another calendar ---
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
export async function importIcsFile(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('tz', TZ)
  return json(await req('/import/ics', { method: 'POST', body: form }))
}
export async function importIcsUrl(url) {
  return json(
    await req('/import/ics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, tz: TZ }),
    }),
  )
}
export async function importCanvas(url) {
  return json(
    await req('/import/canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, tz: TZ }),
    }),
  )
}

// --- reminders / web push ---
export async function reminderStatus() {
  try {
    return await json(await req('/reminders/status'))
  } catch {
    return { push: false, sms: false }
  }
}
export async function saveReminderPrefs({ phone, smsEnabled }) {
  return json(
    await req('/me/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, smsEnabled }),
    }),
  )
}
export async function getPushKey() {
  return json(await req('/push/key'))
}
export async function subscribePush(subscription) {
  return json(
    await req('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    }),
  )
}
export async function unsubscribePush(endpoint) {
  return json(
    await req('/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }),
  )
}

// Absolute URL for the whole-account .ics (subscribe/download).
export function myCalendarIcsUrl({ reminder } = {}) {
  const qs = new URLSearchParams()
  if (reminder) qs.set('reminder', String(reminder))
  if (authToken) qs.set('token', authToken)
  const s = qs.toString() ? `?${qs}` : ''
  return `${BASE}/me/calendar.ics${s}`
}

// --- calendar sync ---
// These are reached by top-level navigation / plain links, which can't send an
// Authorization header — so the token travels as ?token= (backend accepts it).
export function oauthStartUrl(provider, courseId) {
  const qs = new URLSearchParams()
  if (courseId) qs.set('courseId', courseId)
  if (authToken) qs.set('token', authToken)
  const s = qs.toString() ? `?${qs}` : ''
  return `${BASE}/oauth/${provider}${s}`
}
export async function oauthStatus() {
  try {
    return await json(await req('/oauth/status'))
  } catch {
    return { google: false, outlook: false }
  }
}
export function calendarIcsUrl(courseId, { all = false, reminder } = {}) {
  const qs = new URLSearchParams()
  if (all) qs.set('all', '1')
  if (reminder) qs.set('reminder', String(reminder))
  if (authToken) qs.set('token', authToken)
  const suffix = qs.toString() ? `?${qs}` : ''
  return `${BASE}/courses/${courseId}/calendar.ics${suffix}`
}
