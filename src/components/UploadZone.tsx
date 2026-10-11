import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UploadCloud, FileText, FileImage, FileType2, X } from 'lucide-react'
import Steve from './Steve'
import type { Mood } from './Steve'
import RetroButton from './RetroButton'
import { uploadSyllabus, pollJob } from '../lib/api'
import type { EventItem } from '../types'

const ACCEPTED = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg']
const MAX_BYTES = 20 * 1024 * 1024 // matches the gateway's upload limit

interface Phase {
  key: string
  label: string
  mood: Mood
  color: string
}

// Processing phases. In live mode these are driven by the backend job status
// ('eating' | 'scanning' | 'done'); in demo mode (backend offline) they play
// on a timer so the frontend still shows Steve's whole routine.
const PHASES: Phase[] = [
  { key: 'eating', label: 'CHOMPING SYLLABUS…', mood: 'eating', color: 'magenta' },
  { key: 'scanning', label: 'LASER-SCANNING DATES…', mood: 'scanning', color: 'cyan' },
  { key: 'done', label: 'DIGESTED! DATES FOUND.', mood: 'done', color: 'lime' },
]
const PHASE_INDEX: Record<string, number> = { eating: 0, scanning: 1, done: 2, error: 2 }

function iconFor(name: string) {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return FileText
  if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return FileImage
  return FileType2
}

/** One successfully parsed syllabus (a course awaiting review). */
export interface ParsedSyllabus {
  courseId: string
  events: EventItem[]
  fileName: string
}

interface UploadZoneProps {
  /**
   * Called once with every file that parsed, plus messages for any that failed
   * (so the next screen can still report them).
   */
  onComplete?: (results: ParsedSyllabus[], failures: string[]) => void
  authed?: boolean
  onNeedAuth?: () => void
}

export default function UploadZone({ onComplete, authed = false, onNeedAuth }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [phaseIndex, setPhaseIndex] = useState(-1) // -1 = idle
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null) // skipped files
  const [progress, setProgress] = useState<{ index: number; total: number; name: string } | null>(null)
  const processing = phaseIndex >= 0

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    const all = Array.from(list)
    const wrongType = all.filter((f) => !ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext)))
    const tooBig = all.filter((f) => !wrongType.includes(f) && f.size > MAX_BYTES)
    const incoming = all.filter((f) => !wrongType.includes(f) && !tooBig.includes(f))
    const skipped = [
      ...wrongType.map((f) => `${f.name} (not a PDF, DOCX, or image)`),
      ...tooBig.map((f) => `${f.name} (over 20 MB)`),
    ]
    setNotice(skipped.length ? `Skipped ${skipped.join(', ')}` : null)
    if (incoming.length) setFiles((prev) => [...prev, ...incoming])
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  // Upload + parse each queued file in turn, driving Steve from the real backend
  // status. A file that fails doesn't stop the rest; every success is handed up
  // (each becomes a syllabus to review). We never fabricate sample data.
  const startProcessing = useCallback(async () => {
    if (!files.length) return
    // Parsing persists to the user's account — require login first.
    if (!authed) {
      onNeedAuth?.()
      return
    }
    setError(null)
    setNotice(null)
    const results: ParsedSyllabus[] = []
    const failed: string[] = []
    const failedFiles: File[] = []

    for (const [index, file] of files.entries()) {
      setProgress({ index: index + 1, total: files.length, name: file.name })
      setPhaseIndex(0)
      try {
        const { jobId } = await uploadSyllabus(file)
        const job = await pollJob(jobId, {
          onPhase: (status) => setPhaseIndex(PHASE_INDEX[status] ?? 0),
        })
        if (job.status === 'error') {
          failed.push(`${file.name}: Steve couldn’t read it`)
          failedFiles.push(file)
        } else results.push({ courseId: job.jobId, events: job.events || [], fileName: file.name })
      } catch (e) {
        const err = e as Error & { status?: number }
        if (err?.status === 401) {
          setPhaseIndex(-1)
          setProgress(null)
          onNeedAuth?.()
          return
        }
        failed.push(
          err?.status == null
            ? `${file.name}: couldn’t reach Steve’s server (or it timed out)`
            : `${file.name}: ${err.message}`,
        )
        failedFiles.push(file)
      }
    }

    setProgress(null)
    if (failed.length) {
      setError(
        `${failed.join(' · ')}. Use a PDF/DOCX with selectable text or a clear photo, then try again.`,
      )
    }
    // Keep only the files that failed queued, so "Parse" retries just those.
    setFiles(failedFiles)
    if (!results.length) {
      setPhaseIndex(-1)
      return
    }
    // Real results — even if empty. The review screen shows the truth.
    setTimeout(() => onComplete?.(results, failed), 700)
  }, [files, authed, onNeedAuth, onComplete])

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
              {progress && progress.total > 1
                ? `file ${progress.index} of ${progress.total} · ${progress.name}`
                : 'steve.exe running'}
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
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = '' // so picking the same file again still fires
                }}
              />
            </motion.div>

            {notice && (
              <p className="mt-4 font-mono text-lg text-amber" role="status">
                ▸ {notice}
              </p>
            )}

            {/* error banner — honest failure, never fake data */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 flex items-start gap-2 bg-magenta text-ink border-3 border-ink shadow-chunk px-4 py-3"
                >
                  <span className="font-pixel text-xs shrink-0">!</span>
                  <span className="font-mono text-lg leading-tight">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

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
