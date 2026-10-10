import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import RetroButton from '../RetroButton'
import Steve from '../Steve'
import { saveStudyPrefs } from '../../lib/api'
import { useModalA11y } from '../../lib/useModalA11y'
import type { Ref } from 'react'
import type { StudyPrefs } from '../../types'

interface Question {
  key: keyof StudyPrefs
  q: string
  options: [string | number, string][]
}

// The quiz — each question maps to one study preference.
const QUESTIONS: Question[] = [
  {
    key: 'bestTime',
    q: 'When do you focus best?',
    options: [
      ['morning', 'Morning 🌅'],
      ['afternoon', 'Afternoon ☀️'],
      ['evening', 'Evening 🌆'],
      ['night', 'Night 🌙'],
    ],
  },
  {
    key: 'sessionLength',
    q: 'Ideal study session length?',
    options: [
      [25, '25 min (Pomodoro)'],
      [45, '45 min'],
      [90, '90 min (deep work)'],
    ],
  },
  {
    key: 'startDaysBefore',
    q: 'How early do you start studying for an exam?',
    options: [
      [3, '3 days before'],
      [7, 'A week before'],
      [14, 'Two weeks before'],
    ],
  },
  {
    key: 'days',
    q: 'Which days can you study?',
    options: [
      ['weekdays', 'Weekdays'],
      ['weekends', 'Weekends'],
      ['both', 'Any day'],
    ],
  },
  {
    key: 'style',
    q: 'One subject per session, or mix it up?',
    options: [
      ['single', 'One subject at a time'],
      ['interleaved', 'Mix topics (interleaving)'],
    ],
  },
  {
    key: 'perWeek',
    q: 'How many study sessions per week?',
    options: [
      [3, '3 — light'],
      [5, '5 — steady'],
      [7, '7 — intense'],
    ],
  },
]

/**
 * StudyQuiz — onboarding quiz that sets study preferences and builds a plan.
 * Skipping uses best-practice defaults. Props: open, onClose, onDone().
 */
interface StudyQuizProps {
  open: boolean
  onClose: () => void
  onDone?: () => void
}

export default function StudyQuiz({ open, onClose, onDone }: StudyQuizProps) {
  return <AnimatePresence>{open && <Inner onClose={onClose} onDone={onDone} />}</AnimatePresence>
}

type Result = { ok: true; sessions: number } | { ok: false; error: string }

function Inner({ onClose, onDone }: Omit<StudyQuizProps, 'open'>) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Partial<StudyPrefs>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const dialogRef = useModalA11y(onClose)
  const total = QUESTIONS.length
  const done = step >= total

  const choose = (key: keyof StudyPrefs, val: string | number) => {
    setAnswers((a) => ({ ...a, [key]: val }))
    setStep((s) => s + 1)
  }

  // Save prefs; the server merges defaults and (re)builds the plan, returning the
  // sessions it created. Surface that outcome instead of silently closing.
  const finish = async (prefs: Partial<StudyPrefs>) => {
    setBusy(true)
    setResult(null)
    try {
      const r = await saveStudyPrefs(prefs)
      const sessions = Array.isArray(r?.sessions) ? r.sessions.length : 0
      setResult({ ok: true, sessions })
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message || 'Could not reach the server.' })
    } finally {
      setBusy(false)
    }
  }

  const q = QUESTIONS[step]

  return (
    <motion.div
      className="fixed inset-0 z-[96] grid place-items-center p-4 bg-ink/75 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        ref={dialogRef as Ref<HTMLDivElement>}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Study style quiz"
        className="crt retro-panel noise w-full max-w-md p-6 shadow-chunk-lg outline-none"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10">
              <Steve mood={done ? 'done' : 'reading'} size={40} />
            </div>
            <div>
              <h3 className="font-pixel text-sm text-beige leading-tight">STUDY STYLE</h3>
              <p className="font-mono text-base text-cyan">
                {result ? 'all set' : done ? 'ready to build' : `question ${step + 1} of ${total}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-magenta hover:text-lime" aria-label="Skip">
            <X size={22} />
          </button>
        </div>

        {/* progress */}
        <div className="h-3 border-3 border-ink bg-void mb-5">
          <motion.div
            className="h-full bg-lime"
            animate={{ width: `${(Math.min(step, total) / total) * 100}%` }}
          />
        </div>

        {result ? (
          /* ---------- OUTCOME ---------- */
          <div className="py-2">
            {result.ok && result.sessions > 0 ? (
              <>
                <p className="font-mono text-xl text-lime mb-2">
                  ▸ Study plan ready — {result.sessions} session{result.sessions === 1 ? '' : 's'} added.
                </p>
                <p className="font-body text-sm text-beige/80 mb-5">
                  Steve spaced them around your exams, quizzes, and projects at your best time of day.
                  Find them on the <span className="text-cyan">Study Plan</span> tab (or anywhere a
                  <span className="text-crt"> Study</span> tag appears).
                </p>
                <RetroButton color="lime" size="lg" onClick={() => onDone?.()} className="w-full">
                  ▸ View my plan
                </RetroButton>
              </>
            ) : result.ok ? (
              <>
                <p className="font-mono text-xl text-amber mb-2">▸ Preferences saved.</p>
                <p className="font-body text-sm text-beige/80 mb-5">
                  Steve builds study sessions around your <span className="text-magenta">exams</span>,{' '}
                  <span className="text-amber">quizzes</span>, and <span className="text-grape">projects</span>.
                  There aren’t any on your calendar yet — add a syllabus or those dates, and your plan
                  appears automatically.
                </p>
                <RetroButton color="lime" size="lg" onClick={() => onDone?.()} className="w-full">
                  ▸ Got it
                </RetroButton>
              </>
            ) : (
              <>
                <p className="font-mono text-xl text-magenta mb-2">▸ Couldn’t build your plan.</p>
                <p className="font-body text-sm text-beige/80 mb-1">{result.error}</p>
                <p className="font-body text-xs text-beige/60 mb-5">
                  Your answers weren’t saved. Check your connection (or that the backend is running) and
                  try again.
                </p>
                <div className="flex gap-2">
                  <RetroButton color="beige" size="lg" onClick={onClose} className="flex-1">
                    Close
                  </RetroButton>
                  <RetroButton color="lime" size="lg" disabled={busy} onClick={() => finish(answers)} className="flex-1">
                    {busy ? 'RETRYING…' : 'Try again'}
                  </RetroButton>
                </div>
              </>
            )}
          </div>
        ) : !done ? (
          <div>
            <p className="font-body font-bold text-beige text-lg mb-4">{q.q}</p>
            <div className="space-y-2">
              {q.options.map(([val, label]) => (
                <button
                  key={String(val)}
                  onClick={() => choose(q.key, val)}
                  className="w-full text-left font-mono text-xl text-beige bg-void border-3 border-ink px-4 py-3 hover:bg-magenta hover:text-ink transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              {step > 0 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="font-mono text-lg text-cyan hover:text-lime"
                >
                  ← back
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={() => finish({})}
                className="font-mono text-lg text-beige/60 hover:text-lime underline decoration-dashed underline-offset-4"
              >
                skip — use a default plan
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="font-mono text-xl text-cyan mb-4">
              Steve will space out your study sessions around each exam, at your
              best time of day.
            </p>
            <RetroButton color="lime" size="lg" disabled={busy} onClick={() => finish(answers)}>
              {busy ? 'BUILDING…' : '▸ Build my study plan'}
            </RetroButton>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
