/**
 * Study planner — turns a student's assessments (exams, quizzes, projects) plus
 * their readings into a personalized, spaced study/work schedule based on their
 * study-style preferences.
 *
 * For each assessment it gathers the relevant topics (the readings for that
 * course since the previous assessment), then lays out sessions across the
 * student's preferred days/times in the run-up, revisiting topics (spaced
 * repetition) and ending with a review (or, for projects, a finish/polish pass).
 *
 * Pure function → easy to unit-test. Times are UTC wall-clock (the app's
 * convention), so a 7pm session is 7pm for the student regardless of server tz.
 */

// Best-practices default (used when a student skips the quiz).
export const DEFAULT_PREFS = {
  bestTime: 'evening', // morning | afternoon | evening | night
  sessionLength: 45, // minutes (informational; shown in the event)
  startDaysBefore: 7, // begin studying this many days before an assessment
  days: 'both', // weekdays | weekends | both
  style: 'interleaved', // interleaved (mix topics) | single (one topic per day)
  perWeek: 5, // max sessions per week
}

// Assessment types the planner schedules around. Quizzes get a shorter, lighter
// treatment; projects become work sessions rather than topic review.
const ASSESSMENT_TYPES = ['exam', 'quiz', 'project']

const HOUR = { morning: 9, afternoon: 14, evening: 19, night: 21 }
const DOWS = {
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
  both: [0, 1, 2, 3, 4, 5, 6],
}

// Pick `n` roughly-evenly-spaced items from an array (always includes the last).
function pickEven(arr, n) {
  if (n >= arr.length) return arr.slice()
  if (n <= 1) return arr.length ? [arr[arr.length - 1]] : []
  const out = []
  const step = (arr.length - 1) / (n - 1)
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)])
  return [...new Set(out)]
}

function topicFromReading(title) {
  return title.replace(/^read(ing)?:?\s*/i, '').trim().slice(0, 80)
}

function makeSession(assessment, course, title, slot, prefs) {
  return {
    courseId: assessment.courseId,
    course,
    type: 'study',
    title: title.slice(0, 120),
    due: slot.toISOString(),
    allDay: false,
    sessionLength: prefs.sessionLength,
  }
}

/**
 * generatePlan(events, prefs) → [{ courseId, course, type:'study', title, due, allDay:false, sessionLength }]
 * Builds sessions around every exam, quiz, and project found in `events`.
 */
export function generatePlan(events = [], prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) }
  const hour = HOUR[p.bestTime] ?? 19
  const dows = DOWS[p.days] || DOWS.both

  const assessments = events
    .filter((e) => ASSESSMENT_TYPES.includes(e.type) && e.due)
    .sort((a, b) => new Date(a.due) - new Date(b.due))

  const out = []
  const prevByCourse = {} // last assessment due per course (bounds reading topics)

  for (const assessment of assessments) {
    const kind = assessment.type // 'exam' | 'quiz' | 'project'
    const dueD = new Date(assessment.due)
    const course = assessment.course || 'Course'

    // Quizzes need less run-up; exams and projects use the student's full window.
    const windowDays = kind === 'quiz' ? Math.min(p.startDaysBefore, 4) : p.startDaysBefore
    const windowStart = new Date(dueD)
    windowStart.setUTCDate(windowStart.getUTCDate() - windowDays)
    const since = prevByCourse[course] ? new Date(prevByCourse[course]) : new Date(0)

    // Candidate slots: preferred weekdays at the preferred hour, inside the window.
    const slots = []
    const cursor = new Date(windowStart)
    while (cursor < dueD) {
      if (dows.includes(cursor.getUTCDay())) {
        slots.push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), hour, 0)))
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    if (!slots.length) {
      prevByCourse[course] = assessment.due
      continue
    }

    if (kind === 'project') {
      // Project work sessions, ending with a finish/polish pass.
      const name = (assessment.title || '').trim() || `${course} project`
      const budget = Math.min(slots.length, 4)
      const chosen = pickEven(slots, budget)
      chosen.forEach((slot, i) => {
        const isLast = i === chosen.length - 1
        out.push(makeSession(assessment, course, isLast ? `Finish & polish: ${name}` : `Work on: ${name}`, slot, p))
      })
    } else {
      // Exam/quiz: study topics (readings since the previous assessment), spaced,
      // ending with a review session.
      let topics = [
        ...new Set(
          events
            .filter(
              (e) =>
                e.type === 'reading' &&
                (e.course || 'Course') === course &&
                new Date(e.due) > since &&
                new Date(e.due) <= dueD,
            )
            .map((e) => topicFromReading(e.title))
            .filter(Boolean),
        ),
      ]
      if (!topics.length) topics = [`${course} material`]

      const weeks = Math.max(1, Math.ceil(windowDays / 7))
      const hardCap = kind === 'quiz' ? 3 : Math.max(topics.length + 1, 4)
      const maxSessions = Math.min(slots.length, p.perWeek * weeks, hardCap)
      const chosen = pickEven(slots, maxSessions)

      chosen.forEach((slot, i) => {
        const isLast = i === chosen.length - 1
        let title
        if (isLast) {
          title = kind === 'quiz' ? `Review for ${course} quiz` : `Final review: ${course} exam`
        } else if (p.style === 'single') {
          const per = Math.max(1, Math.ceil((chosen.length - 1) / topics.length))
          title = `Study: ${topics[Math.min(Math.floor(i / per), topics.length - 1)]}`
        } else {
          title = `Study: ${topics[i % topics.length]}`
        }
        out.push(makeSession(assessment, course, title, slot, p))
      })
    }

    prevByCourse[course] = assessment.due
  }

  return out
}
