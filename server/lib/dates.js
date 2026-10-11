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
