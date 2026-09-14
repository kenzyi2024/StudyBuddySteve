import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { daysUntil, countdownLabel, urgencyColor } from './schedule'
import { makeDue } from '../data/events'

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Freeze "now" at 2026-09-13 (local). daysUntil compares wall-clock dates.
    vi.setSystemTime(new Date(2026, 8, 13, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('is 0 for something due later today', () => {
    expect(daysUntil(makeDue(2026, 8, 13, 23, 59))).toBe(0)
  })

  it('is 1 for tomorrow and negative for the past', () => {
    expect(daysUntil(makeDue(2026, 8, 14, 9, 0))).toBe(1)
    expect(daysUntil(makeDue(2026, 8, 10, 9, 0))).toBe(-3)
  })

  it('counts whole days across a week', () => {
    expect(daysUntil(makeDue(2026, 8, 20, 0, 0))).toBe(7)
  })
})

describe('countdownLabel', () => {
  it('labels each bucket', () => {
    expect(countdownLabel(-2)).toBe('2d overdue')
    expect(countdownLabel(0)).toBe('Due today')
    expect(countdownLabel(1)).toBe('Due tomorrow')
    expect(countdownLabel(5)).toBe('in 5 days')
  })
})

describe('urgencyColor', () => {
  it('greys out done items regardless of date', () => {
    expect(urgencyColor(-5, true)).toBe('text-beige/60')
  })

  it('escalates color as the deadline nears', () => {
    expect(urgencyColor(-1)).toBe('text-magenta') // overdue
    expect(urgencyColor(1)).toBe('text-amber') // due soon
    expect(urgencyColor(3)).toBe('text-lime') // this week
    expect(urgencyColor(10)).toBe('text-cyan') // far out
  })
})
