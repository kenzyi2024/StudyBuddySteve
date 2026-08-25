import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import cookieParser from 'cookie-parser'

import { buildICS } from './lib/ics.js'
import { parseIcs } from './lib/icsImport.js'
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
import { initSms, smsEnabled, sendSms } from './lib/sms.js'

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

// Baseline security headers on every API response.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  next()
})

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
const publicUser = (u) => ({
  id: String(u._id),
  email: u.email,
  name: u.name || '',
  phone: u.phone || '',
  smsEnabled: !!u.smsEnabled,
})

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

// ------------------------------------------------------------------
//  Import from another calendar (.ics file / URL) + Canvas
// ------------------------------------------------------------------

async function fetchIcs(url) {
  const https = url.replace(/^webcal:/i, 'https:')
  const resp = await fetch(https, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`Could not fetch calendar (${resp.status})`)
  return resp.text()
}

async function doImport(userId, icsText, { tz, defaultType, courseName }) {
  const { calendarName, events } = parseIcs(icsText, { tz, defaultType, courseName })
  const name = courseName || calendarName || 'Imported Calendar'
  // get-or-create so re-imports/re-syncs reuse the same course container
  const course = await store.getOrCreateCourse(userId, name)
  const result = await store.importEvents(userId, course.id, events)
  return { course: name, found: events.length, ...result }
}

// Generic import: multipart .ics file OR JSON { url }.
app.post('/api/import/ics', requireAuth, upload.single('file'), async (req, res) => {
  const tz = req.body.tz || 'UTC'
  try {
    let text
    if (req.file) text = req.file.buffer.toString('utf8')
    else if (req.body.url) text = await fetchIcs(req.body.url)
    else return res.status(400).json({ error: 'Provide an .ics file or a url' })
    res.json(await doImport(req.userId, text, { tz }))
  } catch (e) {
    res.status(422).json({ error: e.message || 'Import failed' })
  }
})

// Canvas: import from the student's Canvas calendar-feed URL + save it for re-sync.
app.post('/api/import/canvas', requireAuth, async (req, res) => {
  const { url, tz } = req.body || {}
  if (!url) return res.status(400).json({ error: 'Paste your Canvas calendar-feed URL' })
  try {
    const text = await fetchIcs(url)
    const out = await doImport(req.userId, text, { tz: tz || 'UTC', defaultType: 'homework', courseName: 'Canvas' })
    // save the feed + timezone so the daily cron can re-sync without a browser
    await store.setCanvasFeed(req.userId, url.replace(/^webcal:/i, 'https:'), tz || 'UTC')
    const lastSync = await store.setCanvasSynced(req.userId)
    res.json({ ...out, source: 'canvas', lastSync })
  } catch (e) {
    res.status(422).json({ error: e.message || 'Canvas import failed' })
  }
})

// Canvas connection status for the current user.
app.get('/api/me/canvas', requireAuth, async (req, res) => {
  const u = await store.getUserById(req.userId)
  res.json({ connected: !!u?.canvasFeedUrl, lastSync: u?.canvasLastSync || null })
})

// Disconnect Canvas — stops the daily auto-sync (keeps imported events).
app.delete('/api/me/canvas', requireAuth, async (req, res) => {
  await store.clearCanvasFeed(req.userId)
  res.json({ ok: true })
})

// Manual re-sync for the signed-in user (the "Sync now" button).
app.post('/api/import/canvas/sync', requireAuth, async (req, res) => {
  const u = await store.getUserById(req.userId)
  if (!u?.canvasFeedUrl) return res.status(400).json({ error: 'Canvas isn’t connected yet.' })
  try {
    const text = await fetchIcs(u.canvasFeedUrl)
    const out = await doImport(req.userId, text, { tz: u.tz || 'UTC', defaultType: 'homework', courseName: 'Canvas' })
    const lastSync = await store.setCanvasSynced(req.userId)
    res.json({ ...out, source: 'canvas', lastSync })
  } catch (e) {
    res.status(422).json({ error: e.message || 'Canvas sync failed' })
  }
})

// Scheduled Canvas re-sync — Cloud Scheduler hits this (secret-protected). For
// every student who connected a feed, re-fetch and import new assignments
// (dedup by UID means nothing is duplicated).
app.post('/api/cron/canvas-sync', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['x-cron-key'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const users = await store.usersWithCanvas()
  let imported = 0
  let skipped = 0
  let failed = 0
  for (const u of users) {
    try {
      const text = await fetchIcs(u.url)
      const out = await doImport(u.userId, text, { tz: u.tz, defaultType: 'homework', courseName: 'Canvas' })
      imported += out.imported
      skipped += out.skipped
      await store.setCanvasSynced(u.userId)
    } catch {
      failed++
    }
  }
  res.json({ users: users.length, imported, skipped, failed })
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

// Which reminder channels are available server-side (frontend hides the rest).
app.get('/api/reminders/status', (_req, res) => {
  res.json({ push: pushEnabled(), sms: smsEnabled() })
})

// Save SMS reminder preferences (phone number + opt-in).
app.post('/api/me/reminders', requireAuth, async (req, res) => {
  const { phone, smsEnabled: sms } = req.body || {}
  if (sms && !/^\+?[1-9]\d{7,14}$/.test((phone || '').replace(/[\s()-]/g, ''))) {
    return res.status(400).json({ error: 'Enter a valid phone number in international format, e.g. +15551234567' })
  }
  await store.setReminderPrefs(req.userId, {
    phone: (phone || '').replace(/[\s()-]/g, ''),
    smsEnabled: !!sms,
  })
  const user = await store.getUserById(req.userId)
  res.json({ user: publicUser(user) })
})

// Reminder sender — triggered by Cloud Scheduler (NOT a user). Protected by a
// shared secret so only the scheduler can invoke it. Finds deadlines due soon,
// groups by user, sends one push digest each, and marks them reminded.
app.post('/api/cron/send-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['x-cron-key'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  if (!pushEnabled() && !smsEnabled()) {
    return res.json({ sent: 0, note: 'no channels configured (set VAPID and/or Twilio keys)' })
  }

  const hours = Number(req.query.hours) || 24
  const due = await store.dueSoonUnreminded(hours)
  const byUser = {}
  for (const e of due) (byUser[e.userId] ||= []).push(e)

  let pushSent = 0
  let smsSent = 0
  const remindedIds = []
  for (const [userId, items] of Object.entries(byUser)) {
    const title = items.length === 1 ? '⏰ 1 deadline coming up' : `⏰ ${items.length} deadlines coming up`
    const lines = items.slice(0, 4).map((i) => `• ${i.title}${i.course ? ` (${i.course})` : ''}`)
    const body = lines.join('\n')
    let delivered = false

    // 1) device push
    const subs = pushEnabled() ? await store.getPushSubs(userId) : []
    for (const sub of subs) {
      try {
        await sendPush(sub, { title, body, url: FRONTEND_URL })
        pushSent++
        delivered = true
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await store.removePushSub(userId, sub.endpoint)
      }
    }

    // 2) SMS
    if (smsEnabled()) {
      const user = await store.getUserById(userId)
      if (user?.smsEnabled && user?.phone) {
        try {
          await sendSms(user.phone, `Study Buddy Steve — ${title}\n${lines.join('\n')}`)
          smsSent++
          delivered = true
        } catch {
          /* SMS failed for this user; keep going */
        }
      }
    }

    if (delivered) remindedIds.push(...items.map((i) => i.id))
  }
  await store.markReminded(remindedIds)
  res.json({ users: Object.keys(byUser).length, pushSent, smsSent, events: remindedIds.length })
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
Promise.all([store.initStore(), initSms()]).then(([mode, smsOn]) => {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `▸ Steve's gateway on http://localhost:${PORT}  [store: ${mode}] [push: ${pushOn ? 'on' : 'off'}] [sms: ${smsOn ? 'on' : 'off'}]`,
    )
  })
})
