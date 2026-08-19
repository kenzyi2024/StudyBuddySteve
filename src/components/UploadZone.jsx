import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UploadCloud, FileText, FileImage, FileType2, X } from 'lucide-react'
import Steve from './Steve.jsx'
import RetroButton from './RetroButton.jsx'
import { uploadSyllabus, pollJob } from '../lib/api.js'

const ACCEPTED = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg']

// Processing phases. In live mode these are driven by the backend job status
// ('eating' | 'scanning' | 'done'); in demo mode (backend offline) they play
// on a timer so the frontend still shows Steve's whole routine.
const PHASES = [
  { key: 'eating', label: 'CHOMPING SYLLABUS…', mood: 'eating', color: 'magenta' },
  { key: 'scanning', label: 'LASER-SCANNING DATES…', mood: 'scanning', color: 'cyan' },
  { key: 'done', label: 'DIGESTED! DATES FOUND.', mood: 'done', color: 'lime' },
]
const PHASE_INDEX = { eating: 0, scanning: 1, done: 2, error: 2 }

function iconFor(name) {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return FileText
  if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return FileImage
  return FileType2
}

export default function UploadZone({ onComplete, authed = false, onNeedAuth }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([])
  const [phaseIndex, setPhaseIndex] = useState(-1) // -1 = idle
  const processing = phaseIndex >= 0

  const addFiles = useCallback((list) => {
    const incoming = Array.from(list).filter((f) =>
      ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext)),
    )
    if (incoming.length) setFiles((prev) => [...prev, ...incoming])
  }, [])

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragging(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  // Demo fallback: play the eat → scan → done phases on a timer, then finish
  // with no courseId so the dashboard falls back to seed data.
  const runSimulated = useCallback(() => {
    const timings = [1600, 2000, 1400]
    let i = 0
    setPhaseIndex(0)
    const advance = () => {
      i += 1
      if (i < PHASES.length) {
        setPhaseIndex(i)
        setTimeout(advance, timings[i])
      } else {
        setTimeout(() => onComplete?.({ courseId: null, events: null }), 700)
      }
    }
    setTimeout(advance, timings[0])
  }, [onComplete])

  // Live path: upload the first file, poll the job, drive Steve from real
  // status. If anything fails (backend offline), fall back to the demo.
  const startProcessing = useCallback(async () => {
    if (!files.length) return
    // Parsing persists to the user's account — require login first.
    if (!authed) {
      onNeedAuth?.()
      return
    }
    setPhaseIndex(0)
    try {
      const { jobId } = await uploadSyllabus(files[0])
      const job = await pollJob(jobId, {
        onPhase: (status) => setPhaseIndex(PHASE_INDEX[status] ?? 0),
      })
      // brief beat on the "done" frame before wiping to the dashboard
      setTimeout(
        () => onComplete?.({ courseId: job.jobId, events: job.events || [] }),
        700,
      )
    } catch (err) {
      // Session expired mid-flight -> back to the login modal.
      if (err?.status === 401) {
        setPhaseIndex(-1)
        onNeedAuth?.()
        return
      }
      // Backend not reachable — keep the experience alive with the demo timeline.
      runSimulated()
    }
  }, [files, authed, onNeedAuth, onComplete, runSimulated])

  const phase = PHASES[phaseIndex]

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* ---------- PROCESSING THEATRE ---------- */}
      <AnimatePresence mode="wait">
        {processing ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="crt retro-panel noise p-8 flex flex-col items-center text-center overflow-hidden"
          >
            <motion.div
              // CRT flicker on the whole processing panel
              animate={{ opacity: [1, 0.82, 1, 0.9, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.4 }}
            >
              <Steve mood={phase.mood} size={200} />
            </motion.div>

            {/* the document being devoured */}
            <AnimatePresence>
              {phase.key === 'eating' && (
                <motion.div
                  key="doc"
                  initial={{ y: -120, opacity: 1, rotate: -6 }}
                  animate={{ y: -40, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 1.4, ease: 'easeIn' }}
                  className="absolute top-10"
                >
                  <FileText size={48} className="text-beige" />
                </motion.div>
              )}
            </AnimatePresence>

            <p
              className={`font-pixel text-sm mt-6 text-${phase.color} animate-flicker`}
            >
              {phase.label}
            </p>

            {/* chunky progress meter */}
            <div className="mt-4 w-full max-w-sm h-6 border-3 border-ink bg-void relative">
              <motion.div
                className={`h-full bg-${phase.color}`}
                initial={{ width: '4%' }}
                animate={{ width: `${((phaseIndex + 1) / PHASES.length) * 100}%` }}
                transition={{ duration: 1.4, ease: 'linear' }}
              />
            </div>
            <p className="font-mono text-lg text-crt mt-3 caret">
              steve.exe running
            </p>
          </motion.div>
        ) : (
          /* ---------- DROP ZONE ---------- */
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              animate={{
                borderColor: dragging ? '#b8ff2e' : '#0a0812',
                backgroundColor: dragging ? 'rgba(184,255,46,0.08)' : 'rgba(26,21,51,1)',
              }}
              whileHover={{ scale: 1.01 }}
              className="crt noise relative cursor-pointer border-5 border-dashed
                shadow-chunk-lg p-10 flex flex-col items-center text-center"
            >
              <motion.div
                animate={{ y: dragging ? -6 : 0, rotate: dragging ? [-3, 3, -3] : 0 }}
                transition={{ duration: 0.4, repeat: dragging ? Infinity : 0 }}
              >
                <UploadCloud
                  size={56}
                  className={dragging ? 'text-lime' : 'text-cyan'}
                  strokeWidth={2.5}
                />
              </motion.div>

              <h3 className="font-pixel text-base sm:text-lg text-beige mt-5 leading-relaxed">
                {dragging ? 'DROP IT! STEVE IS HUNGRY' : 'FEED STEVE YOUR SYLLABUS'}
              </h3>
              <p className="font-mono text-xl text-cyan mt-2">
                drag &amp; drop, or click to browse
              </p>
              <p className="font-body text-xs text-beige/60 mt-3">
                Accepts PDF · DOCX · PNG / JPG
              </p>

              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED.join(',')}
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </motion.div>

            {/* queued files */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5 space-y-2"
                >
                  {files.map((f, idx) => {
                    const Icon = iconFor(f.name)
                    return (
                      <motion.div
                        key={f.name + idx}
                        layout
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="flex items-center gap-3 bg-dusk border-3 border-ink
                          shadow-chunk px-4 py-2"
                      >
                        <Icon size={20} className="text-amber shrink-0" />
                        <span className="font-mono text-lg text-beige truncate flex-1">
                          {f.name}
                        </span>
                        <button
                          onClick={() =>
                            setFiles((p) => p.filter((_, i) => i !== idx))
                          }
                          className="text-magenta hover:text-lime transition-colors"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X size={18} />
                        </button>
                      </motion.div>
                    )
                  })}

                  <div className="pt-3 flex justify-center">
                    <RetroButton color="lime" size="lg" onClick={startProcessing}>
                      ▸ Parse {files.length} File{files.length > 1 ? 's' : ''}
                    </RetroButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
