// Shared domain types. As the TypeScript migration continues, more modules
// import from here so the event/user shape stays consistent across the app.

export type EventType =
  | 'reading'
  | 'homework'
  | 'quiz'
  | 'exam'
  | 'project'
  | 'study'
  | 'other'
  | 'assignment'

export interface EventItem {
  id: string
  courseId?: string
  title: string
  course?: string
  type: EventType
  label?: string
  due: string // ISO wall-clock
  allDay?: boolean
  approved?: boolean
  committed?: boolean
  done?: boolean
  confidence?: number
  source?: { method?: string; snippet?: string } | null
}

export interface StudyPrefs {
  bestTime: 'morning' | 'afternoon' | 'evening' | 'night'
  sessionLength: number
  startDaysBefore: number
  days: 'weekdays' | 'weekends' | 'both'
  style: 'single' | 'interleaved'
  perWeek: number
}

export interface User {
  id: string
  email: string
  name?: string
  phone?: string
  smsEnabled?: boolean
  emailReminders?: boolean
  reminderLead?: number
  emailVerified?: boolean
  studyPrefs?: StudyPrefs | null
}
