import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePlan, DEFAULT_PREFS } from '../lib/studyPlanner.js'

const iso = (y, m, d, h = 0) => new Date(Date.UTC(y, m, d, h, 0)).toISOString()

const events = [
  { id: 'r1', courseId: 'c1', course: 'STAT 344', type: 'reading', title: 'Read Chapter 5', due: iso(2026, 9, 5) },
  { id: 'r2', courseId: 'c1', course: 'STAT 344', type: 'reading', title: 'Read Chapter 6', due: iso(2026, 9, 12) },
  { id: 'e1', courseId: 'c1', course: 'STAT 344', type: 'exam', title: 'Exam 2', due: iso(2026, 9, 20, 10) },
]

test('generates study sessions before an exam, ending with a final review', () => {
  const plan = generatePlan(events, DEFAULT_PREFS)
  assert.ok(plan.length >= 3, 'should produce several sessions')
  assert.ok(plan.every((s) => s.type === 'study'))
  // all sessions fall before the exam
  assert.ok(plan.every((s) => new Date(s.due) < new Date(events[2].due)))
  // last one is a review
  assert.match(plan[plan.length - 1].title, /final review/i)
  // topics from the readings appear
  const titles = plan.map((s) => s.title).join(' ')
  assert.match(titles, /Chapter 5|Chapter 6/)
})

test('respects the preferred time of day (evening = 19:00 UTC wall-clock)', () => {
  const plan = generatePlan(events, { ...DEFAULT_PREFS, bestTime: 'evening', days: 'both' })
  assert.ok(plan.every((s) => new Date(s.due).getUTCHours() === 19))
})

test('startDaysBefore bounds the earliest session', () => {
  const plan = generatePlan(events, { ...DEFAULT_PREFS, startDaysBefore: 3, days: 'both' })
  const earliest = new Date(Math.min(...plan.map((s) => new Date(s.due))))
  const exam = new Date(events[2].due)
  const daysBefore = (exam - earliest) / 86400000
  assert.ok(daysBefore <= 3.5, `earliest session within window (${daysBefore}d)`)
})

test('no exams → no plan', () => {
  const plan = generatePlan(events.filter((e) => e.type !== 'exam'), DEFAULT_PREFS)
  assert.equal(plan.length, 0)
})
