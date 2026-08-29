import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import Steve from '../Steve.jsx'
import { saveStudyPrefs } from '../../lib/api.js'

// The quiz — each question maps to one study preference.
const QUESTIONS = [
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
export default function StudyQuiz({ open, onClose, onDone }) {
  return <AnimatePresence>{open && <Inner onClose={onClose} onDone={onDone} />}</AnimatePresence>
}

function Inner({ onClose, onDone }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const total = QUESTIONS.length
  const done = step >= total

  const choose = (key, val) => {
    setAnswers((a) => ({ ...a, [key]: val }))
    setStep((s) => s + 1)
  }

  const finish = async (prefs) => {
    setBusy(true)
    try {
      await saveStudyPrefs(prefs) // server merges with defaults + builds the plan
      onDone?.()
    } catch {
      onDone?.() // don't block onboarding on a failure
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
        className="crt retro-panel noise w-full max-w-md p-6 shadow-chunk-lg"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10">
              <Steve mood={done ? 'done' : 'reading'} size={40} />
            </div>
            <div>
              <h3 className="font-pixel text-sm text-beige leading-tight">STUDY STYLE</h3>
              <p className="font-mono text-base text-cyan">
                {done ? 'building your plan…' : `question ${step + 1} of ${total}`}
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

        {!done ? (
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
