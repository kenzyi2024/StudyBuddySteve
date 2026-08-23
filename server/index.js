import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import cookieParser from 'cookie-parser'

import { buildICS } from './lib/ics.js'
import * as store from './lib/store.js'
import { parseSyllabus } from './lib/parserClient.js'
import {
  hashPassword,
  verifyPassword,
  issueSession,
  clearSession,
  attachUser,
  requireAuth,
} from './lib/auth.js'
import {
  PROVIDERS,
  isConfigured,
  buildAuthUrl,
  encodeState,
  decodeState,
  exchangeCode,
  refreshAccessToken,
} from './lib/oauth.js'
import { pushEvents } from './lib/calendarSync.js'
import { initPush, pushEnabled, publicKey, sendPush } from './lib/push.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000
// FRONTEND_URL may be a comma-separated allowlist (e.g. prod + preview URLs).
const FRONTEND_URLS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const FRONTEND_URL = FRONTEND_URLS[0]

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl (no origin) and any allowlisted frontend
      if (!origin || FRONTEND_URLS.includes(origin)) return cb(null, true)
      cb(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())
app.use(attachUser) // reads Bearer header / cookie / ?token

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

// ------------------------------------------------------------------
//  Health
// ------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'study-buddy-steve-gateway',
    steve: 'hungry',
    store: store.storeMode(), // 'mongo' (persistent) or 'memory' (dev fallback)
  })
})

// ------------------------------------------------------------------
//  Auth
// ------------------------------------------------------------------
const publicUser = (u) => ({ id: String(u._id), email: u.email, name: u.name || '' })

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {}
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email and a password of 8+ characters are required' })
  }
  if (await store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' })
  }
  const user = await store.createUser({ email, name, passwordHash: await hashPassword(password) })
  const token = issueSession(res, user._id)
  res.status(201).json({ user: publicUser(user), token })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = await store.findUserByEmail(email || '')
  if (!user || !(await verifyPassword(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  const token = issueSession(res, user._id)
  res.json({ user: publicUser(user), token })
})

app.post('/api/auth/logout', (_req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

app.get('/api/auth/me', async (req, res) => {
  if (!req.userId) return res.json({ user: null })
  const user = await store.getUserById(req.userId)
  res.json({ user: user ? publicUser(user) : null })
})

// ------------------------------------------------------------------
//  Uploads & parsing (auth-scoped)
// ------------------------------------------------------------------
app.post('/api/uploads', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: "file")' })

  const course = await store.createCourse(req.userId, {
    name: req.body.course || 'Untitled Course',
    term: req.body.term || '',
    file: { filename: req.file.originalname, mime: req.file.mimetype },
  })

  res.status(202).json({ jobId: course.id, status: 'eating' })

  try {
    await store.setCourseStatus(req.userId, course.id, 'scanning')
    const result = await parseSyllabus(req.file.buffer, req.file.originalname, req.file.mimetype)
    if (result.course && !req.body.course) await store.setCourseName(req.userId, course.id, result.course)
    await store.addEvents(req.userId, course.id, result.events || [])
    await store.setCourseStatus(req.userId, course.id, 'done')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('parse failed:', err.message)
    await store.setCourseStatus(req.userId, course.id, 'error')
  }
})

app.get('/api/jobs/:id', requireAuth, async (req, res) => {
  const course = await store.getCourse(req.userId, req.params.id)
  if (!course) return res.status(404).json({ error: 'Unknown job' })
  res.json({
    jobId: course.id,
    status: course.parseStatus,
    course: course.name,
    events: await store.eventsForCourse(req.userId, course.id),
  })
})

app.get('/api/courses/:id/events', requireAuth, async (req, res) => {
  if (!(await store.getCourse(req.userId, req.params.id)))
    return res.status(404).json({ error: 'Unknown course' })
  res.json({ events: await store.eventsForCourse(req.userId, req.params.id) })
})

app.patch('/api/events/:id', requireAuth, async (req, res) => {
  const allowed = ['title', 'course', 'type', 'label', 'due', 'allDay', 'approved', 'done']
  const patch = {}
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k]
  const updated = await store.updateEvent(req.userId, req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'Unknown event' })
  res.json({ event: updated })
})

// All of the signed-in user's events across every course — powers the saved
// account calendar / task list / reminders.
app.get('/api/me/events', requireAuth, async (req, res) => {
  res.json({ events: await store.allEventsForUser(req.userId) })
})

app.delete('/api/events/:id', requireAuth, async (req, res) => {
  const ok = await store.deleteEvent(req.userId, req.params.id)
  res.status(ok ? 204 : 404).end()
})

app.post('/api/courses/:id/approve', requireAuth, async (req, res) => {
  if (!(await store.getCourse(req.userId, req.params.id)))
    return res.status(404).json({ error: 'Unknown course' })
  const events = await store.approveAll(req.userId, req.params.id)
  res.json({ approved: events.length, events })
})

// Commit a course's parsed events to the account calendar (student approval).
app.post('/api/courses/:id/commit', requireAuth, async (req, res) => {
  if (!(await store.getCourse(req.userId, req.params.id)))
    return res.status(404).json({ error: 'Unknown course' })
  const events = await store.commitCourse(req.userId, req.params.id)
  res.json({ committed: events.length, events })
})

// ------------------------------------------------------------------
//  Universal .ics (auth-scoped)
// ------------------------------------------------------------------
app.get('/api/courses/:id/calendar.ics', requireAuth, async (req, res) => {
  const course = await store.getCourse(req.userId, req.params.id)
  if (!course) return res.status(404).json({ error: 'Unknown course' })

  const all = req.query.all === '1'
  const events = all
    ? await store.eventsForCourse(req.userId, course.id)
    : await store.approvedEventsForCourse(req.userId, course.id)

  const ics = buildICS(events, {
    calName: course.name || 'Study Buddy Steve',
    reminderMinutes: Number(req.query.reminder) || 60,
  })
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${(course.name || 'calendar').replace(/[^\w.-]+/g, '_')}.ics"`,
  )
  res.send(ics)
})

// ------------------------------------------------------------------
//  Web Push reminders (deadlines reach students even when the app is closed)
// ------------------------------------------------------------------

// VAPID public key the browser needs to subscribe (null when push is off).
app.get('/api/push/key', (_req, res) => {
  res.json({ key: pushEnabled() ? publicKey() : null })
})

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  const sub = req.body
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' })
  await store.savePushSub(req.userId, sub)
  res.status(201).json({ ok: true })
})

app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  if (req.body?.endpoint) await store.removePushSub(req.userId, req.body.endpoint)
  res.json({ ok: true })
})

// Reminder sender — triggered by Cloud Scheduler (NOT a user). Protected by a
// shared secret so only the scheduler can invoke it. Finds deadlines due soon,
// groups by user, sends one push digest each, and marks them reminded.
app.post('/api/cron/send-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['x-cron-key'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  if (!pushEnabled()) return res.json({ sent: 0, note: 'push disabled (set VAPID keys)' })

  const hours = Number(req.query.hours) || 24
  const due = await store.dueSoonUnreminded(hours)
  const byUser = {}
  for (const e of due) (byUser[e.userId] ||= []).push(e)

  let sent = 0
  const remindedIds = []
  for (const [userId, items] of Object.entries(byUser)) {
    const subs = await store.getPushSubs(userId)
    if (!subs.length) continue
    const title = items.length === 1 ? '⏰ 1 deadline coming up' : `⏰ ${items.length} deadlines coming up`
    const body = items.slice(0, 4).map((i) => `• ${i.title}${i.course ? ` (${i.course})` : ''}`).join('\n')
    for (const sub of subs) {
      try {
        await sendPush(sub, { title, body, url: FRONTEND_URL })
        sent++
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await store.removePushSub(userId, sub.endpoint) // subscription expired
        }
      }
    }
    remindedIds.push(...items.map((i) => i.id))
  }
  await store.markReminded(remindedIds)
  res.json({ users: Object.keys(byUser).length, sent, events: remindedIds.length })
})

// One .ics for the user's ENTIRE account (all courses) — subscribe once.
app.get('/api/me/calendar.ics', requireAuth, async (req, res) => {
  const events = await store.allEventsForUser(req.userId)
  const ics = buildICS(events, {
    calName: 'My Semester · Study Buddy Steve',
    reminderMinutes: Number(req.query.reminder) || 60,
  })
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="my-semester.ics"')
  res.send(ics)
})

// ------------------------------------------------------------------
//  OAuth calendar sync (auth-scoped; userId travels in signed state)
// ------------------------------------------------------------------
app.get('/api/oauth/status', (_req, res) => {
  res.json({ google: isConfigured('google'), outlook: isConfigured('outlook') })
})

app.get('/api/oauth/:provider', requireAuth, (req, res) => {
  const { provider } = req.params
  if (!PROVIDERS[provider]) return res.status(404).send('Unknown provider')
  if (!isConfigured(provider))
    return res.status(503).send(`${provider} OAuth not configured. See OAUTH_SETUP.md.`)
  const state = encodeState({ provider, userId: req.userId, courseId: req.query.courseId || null })
  res.redirect(buildAuthUrl(provider, state))
})

app.get('/api/oauth/:provider/callback', async (req, res) => {
  const { provider } = req.params
  const { code, state, error } = req.query
  const back = (params) => res.redirect(`${FRONTEND_URL}/?${new URLSearchParams(params)}`)

  if (error) return back({ synced: provider, status: 'denied' })
  const decoded = decodeState(state)
  if (!PROVIDERS[provider] || !code || !decoded || decoded.provider !== provider) {
    return back({ synced: provider, status: 'bad_state' })
  }

  try {
    const tok = await exchangeCode(provider, code)
    await store.saveTokens(decoded.userId, provider, tok)

    let created = 0
    if (decoded.courseId) {
      const approved = await store.approvedEventsForCourse(decoded.userId, decoded.courseId)
      if (approved.length) created = (await pushEvents(provider, tok.accessToken, approved)).created
    }
    return back({ synced: provider, status: 'ok', count: String(created) })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('oauth callback failed:', e.message)
    return back({ synced: provider, status: 'error' })
  }
})

app.post('/api/courses/:id/sync/:provider', requireAuth, async (req, res) => {
  const { id, provider } = req.params
  if (!PROVIDERS[provider]) return res.status(404).json({ error: 'Unknown provider' })
  if (!(await store.getCourse(req.userId, id))) return res.status(404).json({ error: 'Unknown course' })

  let tok = await store.getTokens(req.userId, provider)
  if (!tok) return res.status(401).json({ error: `Not connected to ${provider}` })

  try {
    if (tok.expiry && tok.expiry < Date.now() && tok.refreshToken) {
      tok = await store.saveTokens(req.userId, provider, await refreshAccessToken(provider, tok.refreshToken))
    }
    const approved = await store.approvedEventsForCourse(req.userId, id)
    res.json({ provider, ...(await pushEvents(provider, tok.accessToken, approved)) })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// ------------------------------------------------------------------
//  Boot: connect DB first, then listen.
// ------------------------------------------------------------------
const pushOn = initPush()
store.initStore().then((mode) => {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `▸ Steve's gateway on http://localhost:${PORT}  [store: ${mode}] [push: ${pushOn ? 'on' : 'off'}]`,
    )
  })
})
