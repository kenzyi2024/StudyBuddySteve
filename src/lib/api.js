/**
 * Thin client for the Study Buddy Steve gateway.
 *
 * All calls hit a relative /api path (Vite proxies it to the Express gateway
 * in dev) and send credentials so the session cookie rides along. Every
 * function throws on non-2xx so callers can handle auth / offline states.
 */
const BASE = '/api'

// fetch wrapper: always include cookies.
function req(path, opts = {}) {
  return fetch(`${BASE}${path}`, { credentials: 'include', ...opts })
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
  return json(
    await req('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    }),
  )
}
export async function login({ email, password }) {
  return json(
    await req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
}
export async function logout() {
  return json(await req('/auth/logout', { method: 'POST' }))
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

// --- calendar sync ---
export function oauthStartUrl(provider, courseId) {
  const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''
  return `${BASE}/oauth/${provider}${qs}`
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
  const suffix = qs.toString() ? `?${qs}` : ''
  return `${BASE}/courses/${courseId}/calendar.ics${suffix}`
}
