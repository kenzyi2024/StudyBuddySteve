import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'

import { buildICS } from './lib/ics.js'
import * as store from './lib/store.js'
import { parseSyllabus } from './lib/parserClient.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000

// Keep uploads in memory; forward straight to the Python parser.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
})

// --- health ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'study-buddy-steve-gateway', steve: 'hungry' })
})

// --- upload a syllabus: create a course, parse it, store the events ---
app.post('/api/uploads', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: "file")' })

  const course = store.createCourse({
    name: req.body.course || 'Untitled Course',
    term: req.body.term || '',
    file: { filename: req.file.originalname, mime: req.file.mimetype },
  })

  // Respond immediately with the job; parse asynchronously.
  res.status(202).json({ jobId: course.id, status: 'eating' })

  try {
    store.setCourseStatus(course.id, 'scanning')
    const result = await parseSyllabus(req.file.buffer, req.file.originalname, req.file.mimetype)
    if (result.course && !req.body.course) course.name = result.course
    store.addEvents(course.id, result.events || [])
    store.setCourseStatus(course.id, 'done')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('parse failed:', err.message)
    store.setCourseStatus(course.id, 'error')
  }
})

// --- poll parse status + events ---
app.get('/api/jobs/:id', (req, res) => {
  const course = store.getCourse(req.params.id)
  if (!course) return res.status(404).json({ error: 'Unknown job' })
  res.json({
    jobId: course.id,
    status: course.parseStatus,
    course: course.name,
    events: store.eventsForCourse(course.id),
  })
})

// --- list events for a course ---
app.get('/api/courses/:id/events', (req, res) => {
  if (!store.getCourse(req.params.id)) return res.status(404).json({ error: 'Unknown course' })
  res.json({ events: store.eventsForCourse(req.params.id) })
})

// --- edit a single event ---
app.patch('/api/events/:id', (req, res) => {
  const allowed = ['title', 'course', 'type', 'due', 'allDay', 'approved']
  const patch = {}
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k]
  const updated = store.updateEvent(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'Unknown event' })
  res.json({ event: updated })
})

// --- delete an event ---
app.delete('/api/events/:id', (req, res) => {
  const ok = store.deleteEvent(req.params.id)
  res.status(ok ? 204 : 404).end()
})

// --- approve all events in a course ---
app.post('/api/courses/:id/approve', (req, res) => {
  if (!store.getCourse(req.params.id)) return res.status(404).json({ error: 'Unknown course' })
  const events = store.approveAll(req.params.id)
  res.json({ approved: events.length, events })
})

// --- universal .ics (download or subscription) ---
// ?all=1 exports every event; default exports only approved events.
app.get('/api/courses/:id/calendar.ics', (req, res) => {
  const course = store.getCourse(req.params.id)
  if (!course) return res.status(404).json({ error: 'Unknown course' })

  const all = req.query.all === '1'
  const events = store.eventsForCourse(course.id).filter((e) => all || e.approved)

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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`▸ Steve's gateway listening on http://localhost:${PORT}`)
})
