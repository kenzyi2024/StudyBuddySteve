/**
 * Study planner — turns a student's exams + readings into a personalized,
 * spaced study schedule based on their study-style preferences.
 *
 * For each exam it gathers the topics covered (the readings for that course
 * since the previous exam), then lays out study sessions across the student's
 * preferred days/times in the run-up, revisiting topics (spaced repetition) and
 * ending with a full review the day before.
 *
 * Pure function → easy to unit-test. Times are UTC wall-clock (the app's
 * convention), so a 7pm session is 7pm for the student regardless of server tz.
 */

// Best-practices default (used when a student skips the quiz).
export const DEFAULT_PREFS = {
  bestTime: 'evening', // morning | afternoon | evening | night
  sessionLength: 45, // minutes (informational; shown in the event)
  startDaysBefore: 7, // begin studying this many days before an exam
  days: 'both', // weekdays | weekends | both
  style: 'interleaved', // interleaved (mix topics) | single (one topic per day)
  perWeek: 5, // max sessions per week
}

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

/**
 * generatePlan(events, prefs) → [{ courseId, course, type:'study', title, due, allDay:false, sessionLength }]
 */
export function generatePlan(events = [], prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) }
  const hour = HOUR[p.bestTime] ?? 19
  const dows = DOWS[p.days] || DOWS.both

  const exams = events
    .filter((e) => e.type === 'exam' && e.due)
    .sort((a, b) => new Date(a.due) - new Date(b.due))

  const out = []
  const prevExamByCourse = {}

  for (const exam of exams) {
    const examD = new Date(exam.due)
    const course = exam.course || 'Course'
    const windowStart = new Date(examD)
    windowStart.setUTCDate(windowStart.getUTCDate() - p.startDaysBefore)
    const since = prevExamByCourse[course] ? new Date(prevExamByCourse[course]) : new Date(0)

    // topics = readings for this course covered since the previous exam
    let topics = [
      ...new Set(
        events
          .filter(
            (e) =>
              e.type === 'reading' &&
              (e.course || 'Course') === course &&
              new Date(e.due) > since &&
              new Date(e.due) <= examD,
          )
          .map((e) => topicFromReading(e.title))
          .filter(Boolean),
      ),
    ]
    if (!topics.length) topics = [`${course} material`]

    // candidate slots: preferred weekday at the preferred hour, in the window
    const slots = []
    const cursor = new Date(windowStart)
    while (cursor < examD) {
      if (dows.includes(cursor.getUTCDay())) {
        slots.push(
          new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), hour, 0)),
        )
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    if (!slots.length) continue

    const weeks = Math.max(1, Math.ceil(p.startDaysBefore / 7))
    const maxSessions = Math.min(slots.length, p.perWeek * weeks, Math.max(topics.length + 1, 4))
    const chosen = pickEven(slots, maxSessions)

    chosen.forEach((slot, i) => {
      const isLast = i === chosen.length - 1
      let title
      if (isLast) {
        title = `Final review: ${course} exam`
      } else if (p.style === 'single') {
        const per = Math.max(1, Math.ceil((chosen.length - 1) / topics.length))
        title = `Study: ${topics[Math.min(Math.floor(i / per), topics.length - 1)]}`
      } else {
        title = `Study: ${topics[i % topics.length]}`
      }
      out.push({
        courseId: exam.courseId,
        course,
        type: 'study',
        title: title.slice(0, 120),
        due: slot.toISOString(),
        allDay: false,
        sessionLength: p.sessionLength,
      })
    })

    prevExamByCourse[course] = exam.due
  }

  return out
}
