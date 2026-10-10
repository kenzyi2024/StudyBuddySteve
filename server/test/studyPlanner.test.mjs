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

test('no assessments → no plan (readings alone)', () => {
  const plan = generatePlan(
    events.filter((e) => !['exam', 'quiz', 'project'].includes(e.type)),
    DEFAULT_PREFS,
  )
  assert.equal(plan.length, 0)
})

test('builds sessions around a quiz, even with no exam', () => {
  const quizEvents = [
    { id: 'r1', courseId: 'c1', course: 'BIO 110', type: 'reading', title: 'Read Unit 3', due: iso(2026, 9, 6) },
    { id: 'q1', courseId: 'c1', course: 'BIO 110', type: 'quiz', title: 'Quiz 3', due: iso(2026, 9, 10, 10) },
  ]
  const plan = generatePlan(quizEvents, DEFAULT_PREFS)
  assert.ok(plan.length >= 1, 'should produce at least one session')
  assert.ok(plan.every((s) => s.type === 'study'))
  assert.ok(plan.every((s) => new Date(s.due) < new Date(quizEvents[1].due)))
  assert.match(plan[plan.length - 1].title, /review for .*quiz/i)
})

test('builds work sessions around a project, ending with finish & polish', () => {
  const projectEvents = [
    { id: 'p1', courseId: 'c2', course: 'CS 350', type: 'project', title: 'Term Project', due: iso(2026, 10, 1, 23) },
  ]
  const plan = generatePlan(projectEvents, DEFAULT_PREFS)
  assert.ok(plan.length >= 1, 'should produce work sessions')
  assert.ok(plan.every((s) => s.type === 'study'))
  const titles = plan.map((s) => s.title).join(' | ')
  assert.match(titles, /Work on: Term Project/)
  assert.match(plan[plan.length - 1].title, /Finish & polish: Term Project/)
})
