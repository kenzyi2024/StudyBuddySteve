import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandRecurrence, parseIcs } from '../lib/icsImport.js'

test('weekly BYDAY expands to the right weekdays, bounded by UNTIL', () => {
  // starts Mon 2026-09-07; MWF until 2026-09-25 → 3 weeks × 3 days = 9
  const occ = expandRecurrence(
    new Date(Date.UTC(2026, 8, 7, 10, 0)).toISOString(),
    'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260925T000000Z',
  )
  assert.equal(occ.length, 9)
  // all at 10:00, on Mon/Wed/Fri
  for (const iso of occ) {
    const d = new Date(iso)
    assert.equal(d.getUTCHours(), 10)
    assert.ok([1, 3, 5].includes(d.getUTCDay()))
  }
})

test('COUNT bounds the number of occurrences', () => {
  const occ = expandRecurrence(new Date(Date.UTC(2026, 8, 7, 9, 0)).toISOString(), 'FREQ=WEEKLY;COUNT=4')
  assert.equal(occ.length, 4)
})

test('unsupported frequency returns null (kept as single event)', () => {
  assert.equal(expandRecurrence(new Date().toISOString(), 'FREQ=YEARLY'), null)
})

test('parseIcs expands an RRULE VEVENT into multiple deduped events', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:lecture-1',
    'DTSTART:20260907T140000Z',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
    'SUMMARY:CS 101 Lecture [CS 101]',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const { events } = parseIcs(ics, { tz: 'UTC' })
  assert.equal(events.length, 6)
  // unique per-occurrence UIDs (so re-sync dedupes)
  const uids = new Set(events.map((e) => e.externalUid))
  assert.equal(uids.size, 6)
  assert.equal(events[0].course, 'CS 101')
})
