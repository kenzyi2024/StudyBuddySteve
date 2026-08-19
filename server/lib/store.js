/**
 * Tiny in-memory store so the gateway runs without MongoDB during development.
 * Swap these functions for the Mongoose models in ../models when you wire up
 * the database — the shapes match.
 */

const courses = new Map() // courseId -> course
const events = new Map() // eventId -> event
const tokens = new Map() // provider -> { accessToken, refreshToken, expiry }

// --- OAuth token store (single-user dev). In production, key by user id and
// encrypt at rest. ---
export function saveTokens(provider, tok) {
  tokens.set(provider, tok)
  return tok
}
export function getTokens(provider) {
  return tokens.get(provider) || null
}

let seq = 0
const id = (p) => `${p}_${Date.now().toString(36)}_${seq++}`

export function createCourse({ name = 'Untitled Course', term = '', file } = {}) {
  const courseId = id('course')
  const course = {
    id: courseId,
    name,
    term,
    file: file || null,
    parseStatus: 'queued',
    createdAt: new Date().toISOString(),
  }
  courses.set(courseId, course)
  return course
}

export function setCourseStatus(courseId, status) {
  const c = courses.get(courseId)
  if (c) c.parseStatus = status
  return c
}

export function getCourse(courseId) {
  return courses.get(courseId) || null
}

export function addEvents(courseId, list = []) {
  const created = []
  for (const e of list) {
    const evId = id('evt')
    const ev = {
      id: evId,
      courseId,
      title: e.title || 'Untitled',
      course: e.course || courses.get(courseId)?.name || '',
      type: e.type || 'other',
      due: e.due, // ISO string
      allDay: !!e.allDay,
      approved: false,
      confidence: e.confidence ?? 0.5,
      source: e.source || null,
    }
    events.set(evId, ev)
    created.push(ev)
  }
  return created
}

export function eventsForCourse(courseId) {
  return [...events.values()].filter((e) => e.courseId === courseId)
}

export function getEvent(eventId) {
  return events.get(eventId) || null
}

export function updateEvent(eventId, patch) {
  const e = events.get(eventId)
  if (!e) return null
  Object.assign(e, patch, { id: e.id, courseId: e.courseId })
  return e
}

export function deleteEvent(eventId) {
  return events.delete(eventId)
}

export function approveAll(courseId) {
  const list = eventsForCourse(courseId)
  list.forEach((e) => (e.approved = true))
  return list
}
