// Shared event model, type metadata, seed data, and date helpers used across
// the review dashboard (calendar + list views).

// Retro color + icon-name per event type. `icon` maps to a lucide-react name
// resolved in the components.
export const EVENT_TYPES = {
  assignment: { label: 'Assignment', color: 'cyan', hex: '#22e0ff', icon: 'FileText' },
  exam: { label: 'Exam', color: 'magenta', hex: '#ff2e97', icon: 'AlertTriangle' },
  quiz: { label: 'Quiz', color: 'amber', hex: '#ffb020', icon: 'HelpCircle' },
  reading: { label: 'Reading', color: 'lime', hex: '#b8ff2e', icon: 'BookOpen' },
  other: { label: 'Other', color: 'grape', hex: '#7b2ff7', icon: 'Star' },
}

export function typeMeta(type) {
  return EVENT_TYPES[type] || EVENT_TYPES.other
}

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
    // stored as ISO; time optional (allDay when hh is null)
    due: new Date(y, month, day, hh ?? 0, mm ?? 0).toISOString(),
    allDay: hh == null,
    approved: false,
    confidence,
    source: { snippet: `${title} — extracted from syllabus` },
  })

  return [
    mk('CS 101', 'Problem Set 1', 'assignment', 8, 14, 23, 59, 0.96),
    mk('CS 101', 'Reading: Ch. 1–3', 'reading', 8, 9, null, null, 0.72),
    mk('CS 101', 'Quiz 1', 'quiz', 8, 21, 10, 0, 0.9),
    mk('CS 101', 'Midterm Exam', 'exam', 9, 20, 10, 0, 0.99),
    mk('CS 101', 'Problem Set 2', 'assignment', 9, 5, 23, 59, 0.94),
    mk('MATH 210', 'Homework 1', 'assignment', 8, 11, 17, 0, 0.88),
    mk('MATH 210', 'Homework 2', 'assignment', 8, 25, 17, 0, 0.85),
    mk('MATH 210', 'Exam 1', 'exam', 9, 2, 9, 0, 0.97),
    mk('MATH 210', 'Project Proposal', 'other', 9, 16, 23, 59, 0.61),
    mk('HIST 150', 'Essay 1 Draft', 'assignment', 8, 28, 23, 59, 0.79),
    mk('HIST 150', 'Reading Response', 'reading', 8, 18, null, null, 0.55),
    mk('HIST 150', 'Final Paper', 'other', 9, 30, 23, 59, 0.83),
  ]
}

// --- date helpers -------------------------------------------------

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function sameDay(iso, y, m, d) {
  const dt = new Date(iso)
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d
}

export function fmtTime(iso, allDay) {
  if (allDay) return 'All day'
  const dt = new Date(iso)
  let h = dt.getHours()
  const m = dt.getMinutes().toString().padStart(2, '0')
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ap}`
}

export function fmtDateLong(iso) {
  const dt = new Date(iso)
  return `${WEEKDAYS[dt.getDay()]} · ${MONTHS[dt.getMonth()]} ${dt.getDate()}`
}

export function isoDateKey(iso) {
  const dt = new Date(iso)
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
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
