/**
 * Push approved events into Google Calendar or Outlook (Microsoft Graph).
 *
 * Each event is created via the provider's REST API using the stored access
 * token. Returns { created, failed } counts.
 */

// --- date formatting per provider ---

function pad(n) {
  return String(n).padStart(2, '0')
}

// Local YYYY-MM-DD for all-day events.
function dateOnly(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// --- Google Calendar ---
// https://developers.google.com/calendar/api/v3/reference/events/insert
function toGoogleEvent(ev) {
  const due = new Date(ev.due)
  const summary = `${ev.course ? `[${ev.course}] ` : ''}${ev.title}`
  const description = `Type: ${ev.type}\nAdded by Study Buddy Steve`

  if (ev.allDay) {
    const end = new Date(due)
    end.setDate(end.getDate() + 1)
    return {
      summary,
      description,
      start: { date: dateOnly(due) },
      end: { date: dateOnly(end) },
    }
  }
  const start = new Date(due.getTime() - 60 * 60 * 1000) // 1h default block
  return {
    summary,
    description,
    start: { dateTime: start.toISOString() },
    end: { dateTime: due.toISOString() },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
  }
}

export async function pushToGoogle(accessToken, events) {
  let created = 0
  let failed = 0
  for (const ev of events) {
    const resp = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toGoogleEvent(ev)),
      },
    )
    resp.ok ? created++ : failed++
  }
  return { created, failed }
}

// --- Microsoft Graph (Outlook) ---
// https://learn.microsoft.com/en-us/graph/api/user-post-events
function toGraphEvent(ev) {
  const due = new Date(ev.due)
  const subject = `${ev.course ? `[${ev.course}] ` : ''}${ev.title}`
  const body = { contentType: 'text', content: `Type: ${ev.type}\nAdded by Study Buddy Steve` }

  if (ev.allDay) {
    const end = new Date(due)
    end.setDate(end.getDate() + 1)
    return {
      subject,
      body,
      isAllDay: true,
      start: { dateTime: `${dateOnly(due)}T00:00:00`, timeZone: 'UTC' },
      end: { dateTime: `${dateOnly(end)}T00:00:00`, timeZone: 'UTC' },
    }
  }
  const start = new Date(due.getTime() - 60 * 60 * 1000)
  return {
    subject,
    body,
    start: { dateTime: start.toISOString().slice(0, 19), timeZone: 'UTC' },
    end: { dateTime: due.toISOString().slice(0, 19), timeZone: 'UTC' },
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
  }
}

export async function pushToOutlook(accessToken, events) {
  let created = 0
  let failed = 0
  for (const ev of events) {
    const resp = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toGraphEvent(ev)),
    })
    resp.ok ? created++ : failed++
  }
  return { created, failed }
}

export function pushEvents(provider, accessToken, events) {
  if (provider === 'google') return pushToGoogle(accessToken, events)
  if (provider === 'outlook') return pushToOutlook(accessToken, events)
  throw new Error(`Unknown provider: ${provider}`)
}
