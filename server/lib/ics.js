/**
 * Dependency-free RFC 5545 (iCalendar) generator.
 *
 * Produces a VCALENDAR with one VEVENT per approved event, each with an
 * optional VALARM reminder. Handles the fiddly parts of the spec:
 *   - text escaping (comma, semicolon, backslash, newline)
 *   - 75-octet line folding
 *   - UTC ("Z") vs floating vs all-day (VALUE=DATE) time formats
 *   - CRLF line endings
 *
 * Usage:
 *   buildICS(events, { calName: 'CS 101', reminderMinutes: 60 })
 */

// --- date formatting ---------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0')
}

// UTC timestamp: 20260914T235900Z
function toUTC(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}

// All-day DATE value: 20260914 (wall-clock/UTC parts)
function toDateValue(date) {
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate())
}

// Floating local date-time (no Z): 20260914T235900. Calendars render this in
// the viewer's own timezone, so a "11:59 PM" deadline shows as 11:59 PM for
// everyone rather than shifting by UTC offset.
function toFloating(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  )
}

// --- text handling -----------------------------------------------------

// RFC 5545 §3.3.11 — escape special chars in TEXT values.
function escapeText(str = '') {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// RFC 5545 §3.1 — fold lines longer than 75 octets. Continuation lines
// begin with a single space. We fold on octet (UTF-8 byte) boundaries.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const chunks = []
  let start = 0
  // first chunk 75 octets, subsequent 74 (leading space counts as 1)
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // don't split a multibyte UTF-8 sequence: back up to a lead byte
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    chunks.push(bytes.slice(start, end).toString('utf8'))
    start = end
    limit = 74
  }
  return chunks.join('\r\n ')
}

function line(name, value) {
  return foldLine(`${name}:${value}`)
}

// --- UID + product id -------------------------------------------------

const PRODID = '-//Study Buddy Steve//Semester Planner//EN'

function eventUID(ev) {
  const base = ev.id || `${ev.title}-${ev.due}`
  return `${base}@studybuddysteve`.replace(/\s+/g, '-')
}

// --- VEVENT ------------------------------------------------------------

function buildVEvent(ev, { reminderMinutes, stamp }) {
  const due = new Date(ev.due)
  const lines = ['BEGIN:VEVENT']
  lines.push(line('UID', eventUID(ev)))
  lines.push(line('DTSTAMP', toUTC(stamp)))

  if (ev.allDay) {
    // All-day: DATE value; DTEND is next day per spec convention.
    const next = new Date(due)
    next.setDate(next.getDate() + 1)
    lines.push(line('DTSTART;VALUE=DATE', toDateValue(due)))
    lines.push(line('DTEND;VALUE=DATE', toDateValue(next)))
  } else {
    // Timed: default 1-hour duration ending at the due time. Floating so the
    // deadline displays at the same wall-clock time in any calendar/timezone.
    const start = new Date(due.getTime() - 60 * 60 * 1000)
    lines.push(line('DTSTART', toFloating(start)))
    lines.push(line('DTEND', toFloating(due)))
  }

  const courseTag = ev.course ? `[${ev.course}] ` : ''
  lines.push(line('SUMMARY', escapeText(courseTag + ev.title)))

  const descParts = []
  if (ev.type) descParts.push(`Type: ${ev.type}`)
  if (ev.course) descParts.push(`Course: ${ev.course}`)
  descParts.push('Added by Study Buddy Steve')
  lines.push(line('DESCRIPTION', escapeText(descParts.join('\n'))))

  if (ev.type) lines.push(line('CATEGORIES', escapeText(String(ev.type).toUpperCase())))
  lines.push(line('STATUS', 'CONFIRMED'))
  lines.push(line('TRANSP', 'OPAQUE'))

  // Reminder alarm so the connected calendar (Apple/Google/Outlook) notifies
  // natively. Timed events: N minutes before. All-day events: 6pm the evening
  // before (a sensible "due tomorrow" nudge).
  lines.push('BEGIN:VALARM')
  lines.push(line('ACTION', 'DISPLAY'))
  lines.push(line('DESCRIPTION', escapeText(`Reminder: ${ev.title}`)))
  lines.push(line('TRIGGER', ev.allDay ? '-PT6H' : `-PT${reminderMinutes}M`))
  lines.push('END:VALARM')

  lines.push('END:VEVENT')
  return lines
}

// --- VCALENDAR ---------------------------------------------------------

export function buildICS(events = [], opts = {}) {
  const { calName = 'Study Buddy Steve', reminderMinutes = 60 } = opts
  const stamp = new Date()

  const out = [
    'BEGIN:VCALENDAR',
    line('VERSION', '2.0'),
    line('PRODID', PRODID),
    line('CALSCALE', 'GREGORIAN'),
    line('METHOD', 'PUBLISH'),
    line('X-WR-CALNAME', escapeText(calName)),
    line('X-WR-TIMEZONE', 'UTC'),
  ]

  for (const ev of events) {
    out.push(...buildVEvent(ev, { reminderMinutes, stamp }))
  }

  out.push('END:VCALENDAR')
  // RFC 5545 requires CRLF line breaks, and a trailing CRLF.
  return out.join('\r\n') + '\r\n'
}

export default buildICS
