import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueWithinLead } from '../lib/reminders.js'

// "Now" is 8:00 PM in New York on Sept 14 (00:00Z Sept 15).
const now = Date.parse('2026-09-15T00:00:00.000Z')
const item = (id, due) => ({ id, due })

test('a same-day 11:59 PM deadline is still upcoming for a New York student', () => {
  // Stored wall-clock 23:59 "Z" is already in the past in UTC terms — the old
  // check dropped it. In New York it's ~4 hours away.
  const items = [item('tonight', '2026-09-14T23:59:00.000Z')]
  assert.deepEqual(dueWithinLead(items, { tz: 'America/New_York', leadHours: 24, now }).map((i) => i.id), ['tonight'])
  assert.deepEqual(dueWithinLead(items, { tz: 'UTC', leadHours: 24, now }), [])
})

test('the lead window is measured in the student’s own time', () => {
  const items = [
    item('in-23h', '2026-09-15T19:00:00.000Z'), // 7 PM NY tomorrow → 23h away
    item('in-25h', '2026-09-15T21:00:00.000Z'), // 9 PM NY tomorrow → 25h away
    item('past', '2026-09-14T19:00:00.000Z'), // 7 PM NY today → 1h ago
  ]
  assert.deepEqual(dueWithinLead(items, { tz: 'America/New_York', leadHours: 24, now }).map((i) => i.id), ['in-23h'])
  assert.deepEqual(
    dueWithinLead(items, { tz: 'America/New_York', leadHours: 48, now }).map((i) => i.id),
    ['in-23h', 'in-25h'],
  )
})
