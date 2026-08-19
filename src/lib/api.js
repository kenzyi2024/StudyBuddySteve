/**
 * Thin client for the Study Buddy Steve gateway.
 *
 * All calls hit a relative /api path, which Vite proxies to the Express
 * gateway (see vite.config.js) in dev. In production the frontend is served by
 * the same origin as the API, so relative paths keep working.
 *
 * Every function throws on non-2xx so callers can fall back to demo mode.
 */
const BASE = '/api'

async function json(res) {
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).error || detail
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${detail}`)
  }
  return res.status === 204 ? null : res.json()
}

/** Upload one or more syllabus files. Returns { jobId, status } for the first. */
export async function uploadSyllabus(file, meta = {}) {
  const form = new FormData()
  form.append('file', file)
  if (meta.course) form.append('course', meta.course)
  if (meta.term) form.append('term', meta.term)
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form })
  return json(res)
}

/** Fetch a parse job's status + events. */
export async function getJob(jobId) {
  return json(await fetch(`${BASE}/jobs/${jobId}`))
}

/**
 * Poll a job until it reaches a terminal state (done/error) or times out.
 * onPhase(status) is called on each status change to drive Steve's animation.
 */
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

/** Patch a single event (title, course, type, due, allDay, approved). */
export async function patchEvent(eventId, patch) {
  return json(
    await fetch(`${BASE}/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export async function deleteEvent(eventId) {
  return json(await fetch(`${BASE}/events/${eventId}`, { method: 'DELETE' }))
}

export async function approveCourse(courseId) {
  return json(await fetch(`${BASE}/courses/${courseId}/approve`, { method: 'POST' }))
}

/** URL that kicks off the OAuth flow for a provider, syncing a course on return. */
export function oauthStartUrl(provider, courseId) {
  const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''
  return `${BASE}/oauth/${provider}${qs}`
}

/** Which providers have server-side credentials configured. */
export async function oauthStatus() {
  try {
    return await json(await fetch(`${BASE}/oauth/status`))
  } catch {
    return { google: false, outlook: false }
  }
}

/** Absolute URL for the .ics download / subscription. */
export function calendarIcsUrl(courseId, { all = false, reminder } = {}) {
  const qs = new URLSearchParams()
  if (all) qs.set('all', '1')
  if (reminder) qs.set('reminder', String(reminder))
  const suffix = qs.toString() ? `?${qs}` : ''
  return `${BASE}/courses/${courseId}/calendar.ics${suffix}`
}
