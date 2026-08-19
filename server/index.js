import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import cookieParser from 'cookie-parser'

import { connectMongo } from './lib/db.js'
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

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use(attachUser) // populates req.userId when a valid session cookie exists

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

// ------------------------------------------------------------------
//  Health
// ------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'study-buddy-steve-gateway', steve: 'hungry' })
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
  issueSession(res, user._id)
  res.status(201).json({ user: publicUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = await store.findUserByEmail(email || '')
  if (!user || !(await verifyPassword(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  issueSession(res, user._id)
  res.json({ user: publicUser(user) })
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
  const updated = await store.updateEvent(req.userId, req.params.id, req.body || {})
  if (!updated) return res.status(404).json({ error: 'Unknown event' })
  res.json({ event: updated })
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
connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`▸ Steve's gateway listening on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('✖ Could not start — MongoDB connection failed:\n ', err.message)
    process.exit(1)
  })
