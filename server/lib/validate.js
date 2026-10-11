/**
 * Request validation for event edits. Rejects bad input with a 400 instead of
 * letting it reach the store (an invalid date used to 500, and in the memory
 * store it corrupted the user's whole event list).
 */
export const EVENT_TYPES = ['reading', 'homework', 'quiz', 'exam', 'project', 'study', 'other', 'assignment']

const LIMITS = { title: 200, course: 120, label: 60 }

/**
 * validateEventPatch(body) → { patch } on success, { error } on bad input.
 * Only known fields are copied; unknown keys are ignored.
 */
export function validateEventPatch(body = {}) {
  const b = body && typeof body === 'object' ? body : {}
  const patch = {}

  for (const k of ['title', 'course', 'label']) {
    if (!(k in b)) continue
    if (typeof b[k] !== 'string') return { error: `${k} must be text` }
    const v = b[k].trim()
    if (k === 'title' && !v) return { error: 'Title can’t be empty' }
    if (v.length > LIMITS[k]) return { error: `${k} is too long (max ${LIMITS[k]} characters)` }
    patch[k] = v
  }

  if ('type' in b) {
    if (!EVENT_TYPES.includes(b.type)) return { error: `type must be one of: ${EVENT_TYPES.join(', ')}` }
    patch.type = b.type
  }

  if ('due' in b) {
    const d = typeof b.due === 'string' || typeof b.due === 'number' ? new Date(b.due) : null
    if (!d || Number.isNaN(d.getTime())) return { error: 'due must be a valid date' }
    patch.due = d.toISOString()
  }

  for (const k of ['allDay', 'approved', 'done']) {
    if (!(k in b)) continue
    if (typeof b[k] !== 'boolean') return { error: `${k} must be true or false` }
    patch[k] = b[k]
  }

  return { patch }
}
