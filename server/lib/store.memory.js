/**
 * In-memory implementation of the data store, used automatically when MongoDB
 * is unreachable so the app still works for local testing. Same async API as
 * store.mongo.js. NOTE: data is lost on restart — this is a dev fallback, not
 * for production.
 */
import crypto from 'crypto'

const users = new Map() // userId -> user
const usersByEmail = new Map() // email -> userId
const courses = new Map() // courseId -> course (with .user)
const events = new Map() // eventId -> event (with .user, .course)

const uid = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`
const norm = (email) => String(email).toLowerCase().trim()

function courseOut(c) {
  if (!c) return null
  return { id: c._id, name: c.name, term: c.term || '', file: c.file || null, parseStatus: c.parseStatus }
}
function eventOut(e) {
  if (!e) return null
  return {
    id: e._id,
    courseId: e.course,
    title: e.title,
    course: e.courseName || '',
    type: e.type,
    label: e.label || '',
    due: e.due instanceof Date ? e.due.toISOString() : e.due,
    allDay: !!e.allDay,
    approved: !!e.approved,
    done: !!e.done,
    confidence: e.confidence ?? 0.5,
    source: e.source || null,
  }
}

// --- users ---
export async function findUserByEmail(email) {
  const id = usersByEmail.get(norm(email))
  return id ? users.get(id) : null
}
export async function createUser({ email, name, passwordHash }) {
  const _id = uid('user')
  const user = { _id, email: norm(email), name: name || '', passwordHash, google: null, outlook: null }
  users.set(_id, user)
  usersByEmail.set(user.email, _id)
  return user
}
export async function getUserById(userId) {
  return users.get(userId) || null
}

// --- courses ---
export async function createCourse(userId, { name = 'Untitled Course', term = '', file } = {}) {
  const _id = uid('course')
  const c = { _id, user: userId, name, term, file: file || null, parseStatus: 'queued' }
  courses.set(_id, c)
  return courseOut(c)
}
export async function setCourseStatus(userId, courseId, status) {
  const c = courses.get(courseId)
  if (!c || c.user !== userId) return null
  c.parseStatus = status
  return courseOut(c)
}
export async function getCourse(userId, courseId) {
  const c = courses.get(courseId)
  return c && c.user === userId ? courseOut(c) : null
}
export async function setCourseName(userId, courseId, name) {
  const c = courses.get(courseId)
  if (c && c.user === userId) c.name = name
}

// --- events ---
export async function addEvents(userId, courseId, list = []) {
  const course = courses.get(courseId)
  if (!course || course.user !== userId) return []
  const created = []
  for (const e of list) {
    const _id = uid('evt')
    const ev = {
      _id,
      course: courseId,
      user: userId,
      title: e.title || 'Untitled',
      courseName: e.course || course.name || '',
      type: e.type || 'other',
      label: e.label || '',
      due: e.due ? new Date(e.due) : new Date(),
      allDay: !!e.allDay,
      approved: false,
      done: false,
      confidence: e.confidence ?? 0.5,
      source: e.source || null,
    }
    events.set(_id, ev)
    created.push(eventOut(ev))
  }
  return created
}
function scoped(userId, courseId) {
  return [...events.values()]
    .filter((e) => e.user === userId && e.course === courseId)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
}
export async function eventsForCourse(userId, courseId) {
  return scoped(userId, courseId).map(eventOut)
}
export async function approvedEventsForCourse(userId, courseId) {
  return scoped(userId, courseId).filter((e) => e.approved).map(eventOut)
}
export async function updateEvent(userId, eventId, patch) {
  const e = events.get(eventId)
  if (!e || e.user !== userId) return null
  for (const k of ['title', 'type', 'label', 'allDay', 'approved', 'done']) if (k in patch) e[k] = patch[k]
  if ('due' in patch) e.due = new Date(patch.due)
  if ('course' in patch) e.courseName = patch.course
  return eventOut(e)
}

// All events across the user's courses.
export async function allEventsForUser(userId) {
  return [...events.values()]
    .filter((e) => e.user === userId)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .map(eventOut)
}
export async function deleteEvent(userId, eventId) {
  const e = events.get(eventId)
  if (!e || e.user !== userId) return false
  return events.delete(eventId)
}
export async function approveAll(userId, courseId) {
  scoped(userId, courseId).forEach((e) => (events.get(e._id).approved = true))
  return eventsForCourse(userId, courseId)
}

// --- provider tokens ---
export async function saveTokens(userId, provider, tok) {
  const u = users.get(userId)
  if (u) u[provider] = tok
  return tok
}
export async function getTokens(userId, provider) {
  return users.get(userId)?.[provider] || null
}
