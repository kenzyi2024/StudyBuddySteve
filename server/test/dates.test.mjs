import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wallClockDate, wallClockToInstant, isValidTimeZone } from '../lib/dates.js'

test('naive parser times are read as UTC wall-clock, whatever the server timezone', () => {
  assert.equal(wallClockDate('2026-09-14T23:59:00').toISOString(), '2026-09-14T23:59:00.000Z')
  assert.equal(wallClockDate('2026-09-14T23:59').toISOString(), '2026-09-14T23:59:00.000Z')
})

test('explicit offsets and date-only strings are left alone', () => {
  assert.equal(wallClockDate('2026-09-14T23:59:00Z').toISOString(), '2026-09-14T23:59:00.000Z')
  assert.equal(wallClockDate('2026-09-14T23:59:00-04:00').toISOString(), '2026-09-15T03:59:00.000Z')
  assert.equal(wallClockDate('2026-09-14').toISOString(), '2026-09-14T00:00:00.000Z')
})

const iso = (ms) => new Date(ms).toISOString()

test('wall-clock deadlines convert to the real moment in the student’s timezone', () => {
  // 11:59 PM in New York: EDT (-4) in September, EST (-5) in December.
  assert.equal(iso(wallClockToInstant('2026-09-14T23:59:00.000Z', 'America/New_York')), '2026-09-15T03:59:00.000Z')
  assert.equal(iso(wallClockToInstant('2026-12-14T23:59:00.000Z', 'America/New_York')), '2026-12-15T04:59:00.000Z')
  // Tokyo is ahead of UTC: the real moment is earlier.
  assert.equal(iso(wallClockToInstant('2026-09-14T09:00:00.000Z', 'Asia/Tokyo')), '2026-09-14T00:00:00.000Z')
  // Day after the US fall-back change still uses its own offset.
  assert.equal(iso(wallClockToInstant('2026-11-02T10:00:00.000Z', 'America/Los_Angeles')), '2026-11-02T18:00:00.000Z')
})

test('unknown or missing timezones fall back to UTC', () => {
  assert.equal(iso(wallClockToInstant('2026-09-14T23:59:00.000Z', undefined)), '2026-09-14T23:59:00.000Z')
  assert.equal(iso(wallClockToInstant('2026-09-14T23:59:00.000Z', 'Mars/Olympus')), '2026-09-14T23:59:00.000Z')
  assert.equal(isValidTimeZone('America/Chicago'), true)
  assert.equal(isValidTimeZone('Mars/Olympus'), false)
  assert.equal(isValidTimeZone(''), false)
  assert.equal(isValidTimeZone(42), false)
})
