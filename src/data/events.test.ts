import { describe, it, expect } from 'vitest'
import {
  makeDue,
  sameDay,
  fmtTime,
  fmtDateLong,
  isoDateKey,
  monthGrid,
  courseColors,
  typeMeta,
  EVENT_TYPES,
  COURSE_PALETTE,
  seedEvents,
} from './events'
import type { EventItem } from '../types'

describe('makeDue / wall-clock storage', () => {
  it('stores the given hour:minute as UTC so it never shifts by timezone', () => {
    // 11:59 PM on 2026-09-14 — the deadline default that must stay 11:59 PM.
    const iso = makeDue(2026, 8, 14, 23, 59)
    const d = new Date(iso)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(8)
    expect(d.getUTCDate()).toBe(14)
    expect(d.getUTCHours()).toBe(23)
    expect(d.getUTCMinutes()).toBe(59)
    expect(iso.endsWith('Z')).toBe(true)
  })

  it('defaults hour/minute to 0 (all-day)', () => {
    const d = new Date(makeDue(2026, 0, 1))
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
  })
})

describe('fmtTime', () => {
  it('renders a 11:59 PM deadline as "11:59 PM" (regression: was showing 7:59)', () => {
    expect(fmtTime(makeDue(2026, 8, 14, 23, 59))).toBe('11:59 PM')
  })

  it('handles noon and midnight boundaries', () => {
    expect(fmtTime(makeDue(2026, 0, 1, 12, 0))).toBe('12:00 PM')
    expect(fmtTime(makeDue(2026, 0, 1, 0, 0))).toBe('12:00 AM')
  })

  it('pads minutes and converts to 12-hour', () => {
    expect(fmtTime(makeDue(2026, 0, 1, 9, 5))).toBe('9:05 AM')
    expect(fmtTime(makeDue(2026, 0, 1, 17, 30))).toBe('5:30 PM')
  })

  it('returns "All day" when allDay is set', () => {
    expect(fmtTime(makeDue(2026, 0, 1, 23, 59), true)).toBe('All day')
  })
})

describe('sameDay', () => {
  it('matches on the wall-clock Y/M/D', () => {
    const iso = makeDue(2026, 8, 14, 23, 59)
    expect(sameDay(iso, 2026, 8, 14)).toBe(true)
    expect(sameDay(iso, 2026, 8, 15)).toBe(false)
  })
})

describe('fmtDateLong / isoDateKey', () => {
  it('formats a long date with weekday', () => {
    // 2026-09-14 is a Monday (UTC).
    expect(fmtDateLong(makeDue(2026, 8, 14, 0, 0))).toBe('Mon · September 14')
  })

  it('builds a stable per-day key', () => {
    expect(isoDateKey(makeDue(2026, 8, 14, 23, 59))).toBe('2026-8-14')
  })
})

describe('monthGrid', () => {
  it('always returns 42 cells (6 weeks)', () => {
    expect(monthGrid(2026, 8)).toHaveLength(42)
  })

  it('marks in-month days and includes leading/trailing padding', () => {
    const cells = monthGrid(2026, 8) // September 2026
    const inMonth = cells.filter((c) => c.inMonth)
    expect(inMonth).toHaveLength(30) // September has 30 days
    expect(cells[0].inMonth).toBe(false) // Sept 1 2026 is a Tuesday → leading pad
    expect(cells[cells.length - 1].inMonth).toBe(false) // trailing pad
  })
})

describe('typeMeta', () => {
  it('returns metadata for a known type', () => {
    expect(typeMeta('exam')).toEqual(EVENT_TYPES.exam)
  })

  it('falls back to "other" for an unknown type', () => {
    expect(typeMeta('nonsense')).toEqual(EVENT_TYPES.other)
  })
})

describe('courseColors', () => {
  it('assigns a stable palette entry per course in first-seen order', () => {
    const events = [
      { id: '1', title: 'a', type: 'exam', due: makeDue(2026, 0, 1), course: 'CS 101' },
      { id: '2', title: 'b', type: 'quiz', due: makeDue(2026, 0, 2), course: 'MATH 210' },
      { id: '3', title: 'c', type: 'reading', due: makeDue(2026, 0, 3), course: 'CS 101' },
    ] as EventItem[]
    const map = courseColors(events)
    expect(map.size).toBe(2)
    expect(map.get('CS 101')).toBe(COURSE_PALETTE[0])
    expect(map.get('MATH 210')).toBe(COURSE_PALETTE[1])
  })
})

describe('seedEvents', () => {
  it('produces unique ids', () => {
    const ids = seedEvents().map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
