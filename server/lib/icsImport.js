/**
 * Parse an iCalendar (.ics) feed — from a file or a URL (Google/Apple/Outlook
 * export, or a Canvas calendar feed) — into Study Buddy Steve events.
 *
 * Times are normalized to the student's wall-clock: a UTC ("Z") timestamp is
 * converted into their timezone so an assignment due "11:59 PM" shows as
 * 11:59 PM. All-day (VALUE=DATE) events stay all-day.
 */

// Unfold RFC 5545 folded lines (continuations begin with space/tab).
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

function decode(v) {
  return (v || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

// Wall-clock parts of a UTC instant as seen in `tz` (IANA name).
function partsInTz(date, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const p = Object.fromEntries(
      fmt.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
    )
    return { y: +p.year, m: +p.month - 1, d: +p.day, h: +(p.hour === '24' ? 0 : p.hour), min: +p.minute }
  } catch {
    return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), h: date.getUTCHours(), min: date.getUTCMinutes() }
  }
}

// Turn a DTSTART/DTEND property (name + params + value) into { dueISO, allDay }.
function parseWhen(rawName, value, tz) {
  const isDate = /VALUE=DATE(?!-)/i.test(rawName)
  if (isDate) {
    const m = value.match(/(\d{4})(\d{2})(\d{2})/)
    if (!m) return null
    const [, y, mo, d] = m.map(Number)
    return { dueISO: new Date(Date.UTC(y, mo - 1, d, 0, 0)).toISOString(), allDay: true }
  }
  const m = value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?/)
  if (!m) return null
  const [, y, mo, d, h, min, s, z] = m
  if (z) {
    // UTC instant → convert to the user's wall-clock
    const inst = new Date(Date.UTC(+y, +mo - 1, +d, +h, +min, +(s || 0)))
    const p = partsInTz(inst, tz)
    return { dueISO: new Date(Date.UTC(p.y, p.m, p.d, p.h, p.min)).toISOString(), allDay: false }
  }
  // floating / TZID — treat components as wall-clock
  return { dueISO: new Date(Date.UTC(+y, +mo - 1, +d, +h, +min)).toISOString(), allDay: false }
}

function classify(text, fallback) {
  const s = text.toLowerCase()
  if (/\bquiz\b/.test(s)) return 'quiz'
  if (/project|paper|essay|proposal/.test(s)) return 'project'
  // "exam"/"midterm"/"final exam" (bare "final" alone is too ambiguous)
  if (/\bexam\b|midterm|final exam|finals/.test(s)) return 'exam'
  if (/\bread(ing)?\b|chapter/.test(s)) return 'reading'
  if (/assign|homework|\bhw\b|problem set|pset|\bdue\b/.test(s)) return 'homework'
  return fallback || 'other'
}

// Pull a trailing "[Course Name]" out of a Canvas summary → { title, course }.
function splitCourse(summary) {
  const m = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/)
  if (m) return { title: m[1].trim(), course: m[2].trim() }
  return { title: summary, course: null }
}

/**
 * parseIcs(text, { tz, defaultType, courseName })
 *   → { calendarName, events: [{ title, course, type, due, allDay, externalUid }] }
 */
export function parseIcs(text, { tz = 'UTC', defaultType = 'other', courseName = null } = {}) {
  const lines = unfold(text).split('\n')
  const calNameLine = lines.find((l) => l.startsWith('X-WR-CALNAME'))
  const calendarName = calNameLine ? decode(calNameLine.split(':').slice(1).join(':')) : null

  const events = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {}
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      if (cur && cur.summary && cur.when) {
        const { title, course } = splitCourse(cur.summary)
        events.push({
          title: title.slice(0, 200) || 'Untitled',
          course: course || courseName || calendarName || 'Imported',
          type: classify(`${cur.summary} ${cur.description || ''}`, defaultType),
          due: cur.when.dueISO,
          allDay: cur.when.allDay,
          externalUid: cur.uid || null,
        })
      }
      cur = null
      continue
    }
    if (!cur) continue

    const idx = line.indexOf(':')
    if (idx === -1) continue
    const name = line.slice(0, idx)
    const value = line.slice(idx + 1)
    const base = name.split(';')[0].toUpperCase()

    if (base === 'SUMMARY') cur.summary = decode(value)
    else if (base === 'DESCRIPTION') cur.description = decode(value)
    else if (base === 'UID') cur.uid = value.trim()
    else if (base === 'DTSTART') cur.when = parseWhen(name, value, tz)
  }
  return { calendarName, events }
}
