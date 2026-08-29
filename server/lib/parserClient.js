/**
 * Thin client for the Python parser service. Forwards the uploaded file as
 * multipart/form-data to POST {PARSER_SERVICE_URL}/parse and returns
 * { course, events }.
 *
 * Falls back to an empty result (never throws to the caller's crash path) so a
 * parser outage degrades gracefully into a manual-entry dashboard.
 */
const PARSER_URL = process.env.PARSER_SERVICE_URL || 'http://localhost:8000'
const TIMEOUT_MS = 60_000 // OCR on a big scanned PDF can be slow

export async function parseSyllabus(buffer, filename, mime) {
  const form = new FormData()
  const blob = new Blob([buffer], { type: mime || 'application/octet-stream' })
  form.append('file', blob, filename)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(`${PARSER_URL}/parse`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`parser responded ${resp.status}`)
    const data = await resp.json()
    return { course: data.course || null, events: data.events || [] }
  } finally {
    clearTimeout(timer)
  }
}
