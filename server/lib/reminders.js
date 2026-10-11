import { wallClockToInstant } from './dates.js'

/**
 * Deadlines are stored as wall-clock time, so "due within N hours" has to be
 * judged in each student's own timezone. Store queries over-fetch by this much
 * on each side (the widest UTC offsets are -12h / +14h); this filter makes the
 * real decision.
 */
export const TZ_SLACK_HOURS = 14

/** Items whose real due moment is between now and now + leadHours. */
export function dueWithinLead(items, { tz, leadHours, now = Date.now() }) {
  return items.filter((i) => {
    const hoursLeft = (wallClockToInstant(i.due, tz) - now) / 3600000
    return hoursLeft >= 0 && hoursLeft <= leadHours
  })
}
