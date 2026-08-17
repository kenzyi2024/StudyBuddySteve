import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000

// --- health check ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'study-buddy-steve-gateway', steve: 'hungry' })
})

// --- upload stub: accepts a job, returns a fake job id ---
// Replace with multer + storage + a call to the Python parser service.
app.post('/api/uploads', (_req, res) => {
  const jobId = `job_${Date.now()}`
  res.status(202).json({ jobId, status: 'eating' })
})

// --- poll job status stub ---
app.get('/api/jobs/:id', (req, res) => {
  res.json({
    jobId: req.params.id,
    status: 'done',
    events: [
      {
        id: 'evt_1',
        course: 'CS 101',
        title: 'Problem Set 1',
        type: 'assignment',
        due: '2026-09-14T23:59:00',
      },
      {
        id: 'evt_2',
        course: 'CS 101',
        title: 'Midterm Exam',
        type: 'exam',
        due: '2026-10-20T10:00:00',
      },
    ],
  })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`▸ Steve's gateway listening on http://localhost:${PORT}`)
})
