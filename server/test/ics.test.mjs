import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildICS } from '../lib/ics.js'
import { parseIcs } from '../lib/icsImport.js'

test('buildICS: escapes, folds, floating times, alarms', () => {
  const ics = buildICS(
    [
      {
        id: 'e1',
        title: 'Submit Homework #4, part A; details',
        course: 'STAT 344',
        type: 'homework',
        due: new Date(Date.UTC(2026, 9, 23, 23, 59)).toISOString(),
        allDay: false,
        approved: true,
      },
    ],
    { calName: 'STAT 344' },
  )
  assert.match(ics, /BEGIN:VCALENDAR/)
  assert.match(ics, /SUMMARY:\[STAT 344\] Submit Homework #4\\, part A\\; details/)
  assert.match(ics, /DTEND:20261023T235900(?!Z)/) // floating (no Z)
  assert.match(ics, /BEGIN:VALARM/)
  // CRLF line endings
  assert.ok(ics.includes('\r\n'))
})

test('round-trip: build → parseIcs recovers the event', () => {
  const due = new Date(Date.UTC(2026, 9, 23, 23, 59)).toISOString()
  const ics = buildICS(
    [{ id: 'x', title: 'Quiz 2', course: 'STAT 344', type: 'quiz', due, allDay: false }],
    { calName: 'STAT 344' },
  )
  const { events } = parseIcs(ics, { tz: 'UTC' })
  assert.equal(events.length, 1)
  // buildICS prefixes the course ("[STAT 344] Quiz 2"); the title round-trips.
  assert.match(events[0].title, /Quiz 2/)
  assert.equal(events[0].type, 'quiz')
  assert.equal(events[0].due.slice(0, 16), '2026-10-23T23:59')
})

test('parseIcs: UTC time is converted to the viewer timezone', () => {
  // 03:59 UTC on the 24th == 11:59 PM ET on the 23rd
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:u1',
    'DTSTART:20261024T035900Z',
    'SUMMARY:Homework 4 [STAT 344]',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const { events } = parseIcs(ics, { tz: 'America/New_York', defaultType: 'homework' })
  assert.equal(events[0].due.slice(0, 16), '2026-10-23T23:59')
  assert.equal(events[0].course, 'STAT 344') // extracted from [ ... ]
  assert.equal(events[0].type, 'homework')
})

test('parseIcs: all-day (VALUE=DATE) stays all-day', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:u2',
    'DTSTART;VALUE=DATE:20261020',
    'SUMMARY:Reading',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const { events } = parseIcs(ics, { tz: 'America/New_York' })
  assert.equal(events[0].allDay, true)
  assert.equal(events[0].due.slice(0, 10), '2026-10-20')
})
