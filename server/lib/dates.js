/**
 * The app stores deadlines as wall-clock time in UTC fields ("11:59 PM" is
 * saved as 23:59Z for every student). The parser returns naive ISO strings
 * like "2026-09-14T23:59:00", which `new Date()` would read in the *server's*
 * local timezone, shifting dates on any non-UTC host. Read them as UTC.
 */
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

export function wallClockDate(value) {
  if (typeof value === 'string' && NAIVE_DATETIME.test(value)) return new Date(`${value}Z`)
  return new Date(value)
}

/** True for a real IANA zone name like "America/New_York". */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// How far `tz`'s wall clock is ahead of UTC at instant `t` (ms).
function tzOffsetMs(t, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t))
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]))
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wall - Math.floor(t / 1000) * 1000
}

/**
 * The real moment (epoch ms) a stored wall-clock deadline happens for a
 * student in `tz`. E.g. 23:59 stored for a New York student → 03:59Z the next
 * day (EDT). Unknown/invalid zones fall back to UTC (the old behaviour).
 */
export function wallClockToInstant(due, tz) {
  const wall = new Date(due).getTime()
  if (!isValidTimeZone(tz)) return wall
  // Two passes so a date on the other side of a DST change uses its own offset.
  const guess = wall - tzOffsetMs(wall, tz)
  return wall - tzOffsetMs(guess, tz)
}
