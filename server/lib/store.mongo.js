/**
 * MongoDB-backed data access, scoped by user. Every course/event operation
 * takes a userId so one user can never read or mutate another's data.
 *
 * Returned objects are plain (lean) with an `id` string field, matching the
 * shape the frontend and .ics/sync code expect.
 */
import { User, Course, Event } from '../models/index.js'

// Normalize a Mongoose doc to the API shape ({ id, ... }).
function courseOut(c) {
  if (!c) return null
  return {
    id: String(c._id),
    name: c.name,
    term: c.term || '',
    file: c.file || null,
    parseStatus: c.parseStatus,
  }
}

function eventOut(e) {
  if (!e) return null
  return {
    id: String(e._id),
    courseId: String(e.course),
    title: e.title,
    course: e.courseName || '',
    type: e.type,
    label: e.label || '',
    due: e.due instanceof Date ? e.due.toISOString() : e.due,
    allDay: !!e.allDay,
    approved: !!e.approved,
    committed: e.committed !== false,
    done: !!e.done,
    confidence: e.confidence ?? 0.5,
    source: e.source || null,
  }
}

// --- users ---
export async function findUserByEmail(email) {
  return User.findOne({ email: String(email).toLowerCase().trim() })
}
export async function createUser({ email, name, passwordHash }) {
  return User.create({ email, name, passwordHash })
}
export async function getUserById(userId) {
  return User.findById(userId)
}

// --- courses ---
export async function createCourse(userId, { name = 'Untitled Course', term = '', file } = {}) {
  const c = await Course.create({ user: userId, name, term, file: file || null, parseStatus: 'queued' })
  return courseOut(c)
}
export async function setCourseStatus(userId, courseId, status) {
  const c = await Course.findOneAndUpdate(
    { _id: courseId, user: userId },
    { parseStatus: status },
    { new: true },
  )
  return courseOut(c)
}
export async function getCourse(userId, courseId) {
  return courseOut(await Course.findOne({ _id: courseId, user: userId }))
}
export async function setCourseName(userId, courseId, name) {
  await Course.updateOne({ _id: courseId, user: userId }, { name })
}

// Known event types; anything else is coerced to 'other' so an unexpected
// type value can never fail the whole insert.
const KNOWN_TYPES = new Set([
  'reading', 'homework', 'quiz', 'exam', 'project', 'study', 'other', 'assignment',
])

// --- events ---
export async function addEvents(userId, courseId, list = []) {
  const course = await Course.findOne({ _id: courseId, user: userId })
  if (!course) return []
  const docs = list.map((e) => ({
    course: course._id,
    user: userId,
    title: e.title || 'Untitled',
    courseName: e.course || course.name || '',
    type: KNOWN_TYPES.has(e.type) ? e.type : 'other',
    label: e.label || '',
    due: e.due ? new Date(e.due) : new Date(),
    allDay: !!e.allDay,
    approved: false,
    committed: false, // awaits the student's approval before hitting the calendar
    done: false,
    confidence: e.confidence ?? 0.5,
    source: e.source || null,
  }))
  // ordered:false → valid events still save even if one is malformed.
  const created = await Event.insertMany(docs, { ordered: false })
  return created.map(eventOut)
}

// Import events from an .ics (committed immediately; dedupe by externalUid).
export async function importEvents(userId, courseId, list = []) {
  const course = await Course.findOne({ _id: courseId, user: userId })
  if (!course) return { imported: 0, skipped: 0 }
  const uids = list.map((e) => e.externalUid).filter(Boolean)
  const existing = new Set(
    uids.length ? await Event.find({ user: userId, externalUid: { $in: uids } }).distinct('externalUid') : [],
  )
  const docs = []
  let skipped = 0
  for (const e of list) {
    if (e.externalUid && existing.has(e.externalUid)) {
      skipped++
      continue
    }
    docs.push({
      course: course._id,
      user: userId,
      title: e.title || 'Untitled',
      courseName: e.course || course.name || '',
      type: KNOWN_TYPES.has(e.type) ? e.type : 'other',
      externalUid: e.externalUid || undefined,
      due: e.due ? new Date(e.due) : new Date(),
      allDay: !!e.allDay,
      approved: false,
      committed: true, // imports come from the student's real calendar
      done: false,
      confidence: 1,
      source: { method: 'import' },
    })
  }
  if (docs.length) await Event.insertMany(docs, { ordered: false })
  return { imported: docs.length, skipped }
}

export async function setCanvasFeed(userId, url) {
  await User.updateOne({ _id: userId }, { canvasFeedUrl: url })
}

export async function eventsForCourse(userId, courseId) {
  const list = await Event.find({ course: courseId, user: userId }).sort({ due: 1 })
  return list.map(eventOut)
}

export async function approvedEventsForCourse(userId, courseId) {
  const list = await Event.find({ course: courseId, user: userId, approved: true }).sort({ due: 1 })
  return list.map(eventOut)
}

export async function updateEvent(userId, eventId, patch) {
  const clean = {}
  for (const k of ['title', 'type', 'label', 'due', 'allDay', 'approved', 'done']) {
    if (k in patch) clean[k] = k === 'due' ? new Date(patch[k]) : patch[k]
  }
  if ('course' in patch) clean.courseName = patch.course
  const e = await Event.findOneAndUpdate({ _id: eventId, user: userId }, clean, { new: true })
  return eventOut(e)
}

// All COMMITTED events across the user's courses (account calendar / task list).
export async function allEventsForUser(userId) {
  const list = await Event.find({ user: userId, committed: { $ne: false } }).sort({ due: 1 })
  return list.map(eventOut)
}

// Approve a course's parsed events → they now appear in the calendar.
export async function commitCourse(userId, courseId) {
  await Event.updateMany({ course: courseId, user: userId }, { committed: true })
  return eventsForCourse(userId, courseId)
}

export async function deleteEvent(userId, eventId) {
  const r = await Event.deleteOne({ _id: eventId, user: userId })
  return r.deletedCount > 0
}

export async function approveAll(userId, courseId) {
  await Event.updateMany({ course: courseId, user: userId }, { approved: true })
  return eventsForCourse(userId, courseId)
}

// --- push subscriptions ---
export async function savePushSub(userId, sub) {
  // de-dupe by endpoint, then add
  await User.updateOne({ _id: userId }, { $pull: { pushSubs: { endpoint: sub.endpoint } } })
  await User.updateOne({ _id: userId }, { $push: { pushSubs: sub } })
}
export async function removePushSub(userId, endpoint) {
  await User.updateOne({ _id: userId }, { $pull: { pushSubs: { endpoint } } })
}
export async function getPushSubs(userId) {
  const u = await User.findById(userId).select('pushSubs')
  return u?.pushSubs || []
}

// --- reminder prefs (SMS) ---
export async function setReminderPrefs(userId, { phone, smsEnabled }) {
  const patch = {}
  if (phone !== undefined) patch.phone = phone
  if (smsEnabled !== undefined) patch.smsEnabled = !!smsEnabled
  await User.updateOne({ _id: userId }, patch)
}

// --- reminders ---
// Events due within `hours`, not done, not yet reminded. Returns raw rows with
// userId so the cron can group + push.
export async function dueSoonUnreminded(hours = 24) {
  const now = new Date()
  const until = new Date(now.getTime() + hours * 3600 * 1000)
  const list = await Event.find({
    done: false,
    reminded: { $ne: true },
    committed: { $ne: false },
    due: { $gte: now, $lte: until },
  }).sort({ due: 1 })
  return list.map((e) => ({
    id: String(e._id),
    userId: String(e.user),
    title: e.title,
    course: e.courseName || '',
    due: e.due.toISOString(),
  }))
}
export async function markReminded(ids = []) {
  if (ids.length) await Event.updateMany({ _id: { $in: ids } }, { reminded: true })
}

// --- provider tokens (stored on the user) ---
export async function saveTokens(userId, provider, tok) {
  await User.updateOne({ _id: userId }, { [provider]: tok })
  return tok
}
export async function getTokens(userId, provider) {
  const u = await User.findById(userId).select(provider)
  return u?.[provider] || null
}
