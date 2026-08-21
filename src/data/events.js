// Shared event model, type metadata, seed data, and date helpers used across
// the review dashboard (calendar + list views).

// Retro color + icon-name per event type. `icon` maps to a lucide-react name
// resolved in the components.
export const EVENT_TYPES = {
  reading: { label: 'Reading', color: 'cyan', hex: '#22e0ff', icon: 'BookOpen' },
  homework: { label: 'Homework', color: 'lime', hex: '#b8ff2e', icon: 'PencilLine' },
  quiz: { label: 'Quiz', color: 'amber', hex: '#ffb020', icon: 'HelpCircle' },
  exam: { label: 'Exam', color: 'magenta', hex: '#ff2e97', icon: 'AlertTriangle' },
  project: { label: 'Project', color: 'grape', hex: '#7b2ff7', icon: 'FolderGit2' },
  study: { label: 'Study', color: 'crt', hex: '#4dffb8', icon: 'Coffee' },
  other: { label: 'Other', color: 'beige', hex: '#e8e0c8', icon: 'Star' },
  // legacy alias
  assignment: { label: 'Homework', color: 'lime', hex: '#b8ff2e', icon: 'PencilLine' },
}

export function typeMeta(type) {
  return EVENT_TYPES[type] || EVENT_TYPES.other
}

// Types offered in the editor dropdown (excludes the legacy alias).
export const EDITABLE_TYPES = ['reading', 'homework', 'quiz', 'exam', 'project', 'study', 'other']

let _id = 0
const uid = () => `evt_${Date.now()}_${_id++}`

// Seed events approximate what Steve's parser would return for a couple of
// courses. `confidence` drives the "double-check me" flag in the UI.
export function seedEvents() {
  const y = 2026
  const mk = (course, title, type, month, day, hh, mm, confidence) => ({
    id: uid(),
    course,
    title,
    type,
    // stored as ISO wall-clock; time optional (allDay when hh is null)
    due: makeDue(y, month, day, hh ?? 0, mm ?? 0),
    allDay: hh == null,
    approved: false,
    confidence,
    source: { snippet: `${title} — extracted from syllabus` },
  })

  return [
    mk('CS 101', 'Read Chapter 1, Sections 1.1–1.4', 'reading', 8, 9, null, null, 0.82),
    mk('CS 101', 'Submit Homework #1', 'homework', 8, 14, 23, 59, 0.96),
    mk('CS 101', 'Quiz 1', 'quiz', 8, 21, 10, 0, 0.9),
    mk('CS 101', 'Study session: Midterm', 'study', 9, 17, null, null, 0.7),
    mk('CS 101', 'Midterm Exam', 'exam', 9, 20, 10, 0, 0.99),
    mk('CS 101', 'Submit Homework #2', 'homework', 9, 5, 23, 59, 0.94),
    mk('MATH 210', 'Submit Homework #1', 'homework', 8, 11, 17, 0, 0.88),
    mk('MATH 210', 'Read Chapter 2, Sections 2.5–2.8', 'reading', 8, 18, null, null, 0.75),
    mk('MATH 210', 'Exam 1', 'exam', 9, 2, 9, 0, 0.97),
    mk('MATH 210', 'Project Proposal', 'project', 9, 16, 23, 59, 0.71),
    mk('HIST 150', 'Essay 1 Draft', 'project', 8, 28, 23, 59, 0.79),
    mk('HIST 150', 'Final Paper', 'project', 9, 30, 23, 59, 0.83),
  ]
}

// --- date helpers -------------------------------------------------

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Due times are treated as fixed WALL-CLOCK moments (a "11:59 PM" deadline is
// 11:59 PM regardless of the viewer's timezone). We store the wall-clock in UTC
// and read it back with getUTC* so it never shifts. Use these helpers + the
// makeDue() builder everywhere; never new Date(y,m,d,...) for due values.

export function makeDue(y, m, d, hh = 0, mm = 0) {
  return new Date(Date.UTC(y, m, d, hh, mm)).toISOString()
}

export function sameDay(iso, y, m, d) {
  const dt = new Date(iso)
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d
}

export function fmtTime(iso, allDay) {
  if (allDay) return 'All day'
  const dt = new Date(iso)
  let h = dt.getUTCHours()
  const m = dt.getUTCMinutes().toString().padStart(2, '0')
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ap}`
}

export function fmtDateLong(iso) {
  const dt = new Date(iso)
  return `${WEEKDAYS[dt.getUTCDay()]} · ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`
}

export function isoDateKey(iso) {
  const dt = new Date(iso)
  return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`
}

// Build a 6-row month grid (array of {day, inMonth, y, m, d}) for a given month.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const cells = []
  // leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ d: daysInPrev - i, m: month - 1, y: month === 0 ? year - 1 : year, inMonth: false })
  }
  // this month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, m: month, y: year, inMonth: true })
  }
  // trailing days to fill 42 cells
  let next = 1
  while (cells.length < 42) {
    cells.push({ d: next++, m: month + 1, y: month === 11 ? year + 1 : year, inMonth: false })
  }
  return cells
}
