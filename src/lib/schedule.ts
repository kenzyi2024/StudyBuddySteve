// Scheduling helpers shared across the home + task views.

/** Whole-day difference between an event's wall-clock date and today. */
export function daysUntil(iso: string): number {
  const d = new Date(iso)
  const due = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const n = new Date()
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
  return Math.round((due - today) / 86400000)
}

export function countdownLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `in ${days} days`
}

export function urgencyColor(days: number, done?: boolean): string {
  if (done) return 'text-beige/60'
  if (days < 0) return 'text-magenta'
  if (days <= 1) return 'text-amber'
  if (days <= 3) return 'text-lime'
  return 'text-cyan'
}
