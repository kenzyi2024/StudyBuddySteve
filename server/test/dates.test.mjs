import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wallClockDate } from '../lib/dates.js'

test('naive parser times are read as UTC wall-clock, whatever the server timezone', () => {
  assert.equal(wallClockDate('2026-09-14T23:59:00').toISOString(), '2026-09-14T23:59:00.000Z')
  assert.equal(wallClockDate('2026-09-14T23:59').toISOString(), '2026-09-14T23:59:00.000Z')
})

test('explicit offsets and date-only strings are left alone', () => {
  assert.equal(wallClockDate('2026-09-14T23:59:00Z').toISOString(), '2026-09-14T23:59:00.000Z')
  assert.equal(wallClockDate('2026-09-14T23:59:00-04:00').toISOString(), '2026-09-15T03:59:00.000Z')
  assert.equal(wallClockDate('2026-09-14').toISOString(), '2026-09-14T00:00:00.000Z')
})
