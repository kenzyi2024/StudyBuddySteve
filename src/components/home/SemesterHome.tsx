import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  ListChecks,
  LayoutDashboard,
  UploadCloud,
  Upload,
  Download,
  Bell,
  BellRing,
  Flame,
  LogOut,
  Trash2,
  Eraser,
  Coffee,
  FileClock,
  RefreshCw,
} from 'lucide-react'
import Steve from '../Steve'
import RetroButton from '../RetroButton'
import CalendarView from '../dashboard/CalendarView'
import EventEditor from '../dashboard/EventEditor'
import RemindersModal from './RemindersModal'
import ImportModal from './ImportModal'
import TaskRow from './TaskRow'
import { courseColors } from '../../data/events'
import { daysUntil, countdownLabel } from '../../lib/schedule'
import {
  patchEvent,
  deleteEvent as apiDeleteEvent,
  downloadMyCalendar,
  getMyEvents,
  getPendingReviews,
  discardPendingReview,
} from '../../lib/api'
import { useToast } from '../../lib/toast'
import type { EventItem, PendingReview, User } from '../../types'

const NOTIFIED_KEY = 'steve_notified'

type View = 'overview' | 'calendar' | 'tasks' | 'plan'

interface SemesterHomeProps {
  user?: User | null
  initialEvents?: EventItem[]
  onUploadMore: () => void
  onOpenQuiz: () => void
  onLogout: () => void
  /** Reopen the review screen for a syllabus that wasn't added yet. */
  onResumeReview: (courseId: string) => void
  /** Set when the semester couldn't be loaded (so it isn't shown as empty). */
  loadError?: string | null
  onRetryLoad?: () => void
}

const errText = (e: unknown) => (e as Error)?.message || 'network error'

function readNotified(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

interface PendingDelete {
  event: EventItem
  timer: ReturnType<typeof setTimeout>
}

export default function SemesterHome({
  user,
  initialEvents = [],
  onUploadMore,
  onOpenQuiz,
  onLogout,
  onResumeReview,
  loadError = null,
  onRetryLoad,
}: SemesterHomeProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents)
  const [view, setView] = useState<View>('overview') // overview | calendar | tasks
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [courseFilter, setCourseFilter] = useState<string | null>(null) // null = all courses
  const [notify, setNotify] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [undo, setUndo] = useState<EventItem | null>(null) // recently-deleted event (undoable)
  const undoRef = useRef<PendingDelete | null>(null)
  const [pending, setPending] = useState<PendingReview[]>([])
  const toast = useToast()

  const refreshEvents = () =>
    getMyEvents()
      .then((r) => setEvents(r.events || []))
      .catch((e) => toast.error(`Couldn’t refresh your calendar: ${errText(e)}`))
  const notifiedRef = useRef<Set<string>>(new Set(readNotified()))

  useEffect(() => setEvents(initialEvents), [initialEvents])

  // Syllabi parsed but never added (review interrupted) — offer to resume.
  useEffect(() => {
    getPendingReviews()
      .then((r) => setPending(r.courses || []))
      .catch(() => {})
  }, [initialEvents])

  const discardPending = async (p: PendingReview) => {
    if (!window.confirm(`Discard “${p.name}”? Its ${p.count} dates won’t be added to your calendar.`)) return
    try {
      await discardPendingReview(p.courseId)
      setPending((list) => list.filter((x) => x.courseId !== p.courseId))
    } catch (e) {
      toast.error(`Couldn’t discard it: ${errText(e)}`)
    }
  }

  // --- persistence helpers: optimistic, rolled back with a visible error ---
  const replace = (ev: EventItem) => setEvents((prev) => prev.map((e) => (e.id === ev.id ? ev : e)))
  const persist = (before: EventItem, body: Record<string, unknown>, verb: string) =>
    patchEvent(before.id, body).catch((e) => {
      replace(before)
      toast.error(`Couldn’t ${verb} “${before.title}”: ${errText(e)}`)
    })

  const toggleDone = (id: string) => {
    const before = events.find((e) => e.id === id)
    if (!before) return
    replace({ ...before, done: !before.done })
    persist(before, { done: !before.done }, 'update')
  }
  const saveEvent = (updated: EventItem) => {
    const before = events.find((e) => e.id === updated.id)
    replace(updated)
    setEditing(null)
    if (before)
      persist(
        before,
        {
          title: updated.title,
          course: updated.course,
          type: updated.type,
          label: updated.label,
          due: updated.due,
          allDay: updated.allDay,
        },
        'save',
      )
  }
  // Server delete; on failure put the event back and say so.
  const removeOnServer = (ev: EventItem) =>
    apiDeleteEvent(ev.id).catch((e) => {
      setEvents((prev) => (prev.some((x) => x.id === ev.id) ? prev : [...prev, ev]))
      toast.error(`Couldn’t delete “${ev.title}”: ${errText(e)}`)
    })
  // Delete with a 5-second undo: remove from the UI immediately, but only tell
  // the server after the window closes (unless the student hits Undo).
  const deleteEvent = (id: string) => {
    setEditing(null)
    const ev = events.find((e) => e.id === id)
    if (!ev) return
    // commit any previous pending delete right away
    if (undoRef.current) {
      clearTimeout(undoRef.current.timer)
      removeOnServer(undoRef.current.event)
    }
    setEvents((prev) => prev.filter((e) => e.id !== id))
    const timer = setTimeout(() => {
      removeOnServer(ev)
      undoRef.current = null
      setUndo(null)
    }, 5000)
    undoRef.current = { event: ev, timer }
    setUndo(ev)
  }
  const undoDelete = () => {
    const pending = undoRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    setEvents((prev) => [...prev, pending.event])
    undoRef.current = null
    setUndo(null)
  }
  // Bulk delete: removes a set of ids locally and on the server.
  const deleteMany = (ids: string[]) => {
    const set = new Set(ids)
    setEvents((prev) => prev.filter((e) => !set.has(e.id)))
    Promise.allSettled(ids.map((id) => apiDeleteEvent(id))).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) {
        toast.error(`${failed} of ${ids.length} couldn’t be deleted — they’re back in your list.`)
        refreshEvents()
      }
    })
  }
  const clearCompleted = () => {
    const ids = scoped.filter((e) => e.done).map((e) => e.id)
    if (ids.length && window.confirm(`Delete ${ids.length} completed task(s)? This can't be undone.`))
      deleteMany(ids)
  }
  const clearAll = () => {
    const ids = scoped.map((e) => e.id)
    if (ids.length && window.confirm(`Delete ALL ${ids.length} task(s) shown? This can't be undone.`))
      deleteMany(ids)
  }
  const reschedule = (id: string, y: number, m: number, d: number) => {
    const before = events.find((e) => e.id === id)
    if (!before) return
    const old = new Date(before.due)
    const due = new Date(Date.UTC(y, m, d, old.getUTCHours(), old.getUTCMinutes())).toISOString()
    replace({ ...before, due })
    persist(before, { due }, 'move')
  }

  // --- courses (for the filter + per-course colors), from the shared palette ---
  const courseMap = useMemo(() => courseColors(events), [events])
  const courses = useMemo(
    () => [...courseMap.entries()].map(([name, c]) => ({ name, color: c.name })),
    [courseMap],
  )
  const courseColor = (name?: string) => courseMap.get(name || 'Course')?.name || 'cyan'
  const courseHex = (name?: string) => courseMap.get(name || 'Course')?.hex || '#22e0ff'

  // Events scoped to the active course filter (drives every view below).
  const scoped = useMemo(
    () => (courseFilter ? events.filter((e) => (e.course || 'Course') === courseFilter) : events),
    [events, courseFilter],
  )

  // --- derived stats ---
  const stats = useMemo(() => {
    const total = scoped.length
    const done = scoped.filter((e) => e.done).length
    const overdue = scoped.filter((e) => !e.done && daysUntil(e.due) < 0).length
    const thisWeek = scoped.filter((e) => {
      const d = daysUntil(e.due)
      return !e.done && d >= 0 && d <= 7
    }).length
    return { total, done, overdue, thisWeek, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [scoped])

  const upcoming = useMemo(
    () =>
      scoped
        .filter((e) => !e.done && daysUntil(e.due) >= -3)
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
        .slice(0, 12),
    [scoped],
  )

  const openTasks = useMemo(
    () => scoped.filter((e) => !e.done).sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()),
    [scoped],
  )

  // Study sessions Steve generated (events of type 'study'), newest-first by due.
  const studyPlan = useMemo(
    () =>
      scoped
        .filter((e) => e.type === 'study')
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()),
    [scoped],
  )
  // Assessments the plan is built around — shown in the empty state so the user
  // knows what to add if they have no plan yet.
  const assessmentCount = useMemo(
    () => events.filter((e) => ['exam', 'quiz', 'project'].includes(e.type)).length,
    [events],
  )
  const planOpen = useMemo(() => studyPlan.filter((e) => !e.done), [studyPlan])
  const planDone = useMemo(() => studyPlan.filter((e) => e.done), [studyPlan])

  // In-page reminders while the app is open (device push, SMS, and calendar
  // sync are all handled by the RemindersModal).
  useEffect(() => {
    if (!notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const soon = events.filter((e) => !e.done && daysUntil(e.due) >= 0 && daysUntil(e.due) <= 1)
    let changed = false
    for (const e of soon) {
      if (notifiedRef.current.has(e.id)) continue
      new Notification('⏰ Study Buddy Steve', {
        body: `${countdownLabel(daysUntil(e.due))}: ${e.title}${e.course ? ` (${e.course})` : ''}`,
      })
      notifiedRef.current.add(e.id)
      changed = true
    }
    if (changed) {
      try {
        localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedRef.current]))
      } catch {
        /* storage full / unavailable — worst case a reminder repeats */
      }
    }
  }, [notify, events])

  const TabBtn = ({ id, icon: Icon, label }: { id: View; icon: typeof CalendarDays; label: string }) => {
    const active = view === id
    return (
      <button
        onClick={() => setView(id)}
        className={`flex items-center gap-2 px-4 py-2 border-3 border-ink font-pixel text-[11px] uppercase transition-colors
          ${active ? 'bg-magenta text-ink shadow-chunk' : 'bg-void text-beige/70 hover:bg-dusk'}`}
      >
        <Icon size={15} /> {label}
      </button>
    )
  }

  // Render a task row (extracted to ./TaskRow) with the course-scoped colors.
  const row = (e: EventItem) => (
    <TaskRow
      key={e.id}
      e={e}
      courseColorName={courseColor(e.course)}
      courseHex={courseHex(e.course)}
      onToggleDone={toggleDone}
      onEdit={setEditing}
      onDelete={deleteEvent}
    />
  )

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="crt relative border-b-5 border-ink bg-dusk/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10">
              <Steve mood="happy" size={40} />
            </div>
            <div>
              <span className="font-pixel text-xs sm:text-sm text-beige block leading-tight">
                MY <span className="text-cyan">SEMESTER</span>
              </span>
              <span className="font-mono text-base text-lime">
                Welcome back, {user?.name || user?.email?.split('@')[0] || 'student'}!
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RetroButton color="grape" size="sm" onClick={() => setView('plan')}>
              <Coffee size={15} /> Study Plan
            </RetroButton>
            <RetroButton color="cyan" size="sm" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> Import
            </RetroButton>
            <RetroButton color="lime" size="sm" onClick={onUploadMore}>
              <UploadCloud size={15} /> Add Syllabus
            </RetroButton>
            <RetroButton color="magenta" size="sm" onClick={onLogout}>
              <LogOut size={14} />
            </RetroButton>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
        {/* couldn't load — say so instead of showing an empty semester */}
        {loadError && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-magenta text-ink border-3 border-ink shadow-chunk px-4 py-3">
            <span className="font-mono text-lg">! Couldn’t load your semester: {loadError}</span>
            {onRetryLoad && (
              <RetroButton color="beige" size="sm" onClick={onRetryLoad}>
                <RefreshCw size={14} /> Retry
              </RetroButton>
            )}
          </div>
        )}

        {/* syllabi that were parsed but never added */}
        {pending.map((p) => (
          <div
            key={p.courseId}
            className="flex flex-wrap items-center justify-between gap-3 bg-amber text-ink border-3 border-ink shadow-chunk px-4 py-3"
          >
            <span className="flex items-center gap-2 font-mono text-lg">
              <FileClock size={18} /> {p.name}: {p.count} date{p.count === 1 ? '' : 's'} waiting for your review
            </span>
            <div className="flex gap-2">
              <RetroButton color="magenta" size="sm" onClick={() => discardPending(p)}>
                Discard
              </RetroButton>
              <RetroButton color="lime" size="sm" onClick={() => onResumeReview(p.courseId)}>
                Review
              </RetroButton>
            </div>
          </div>
        ))}

        {/* tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            <TabBtn id="overview" icon={LayoutDashboard} label="Overview" />
            <TabBtn id="calendar" icon={CalendarDays} label="Calendar" />
            <TabBtn id="tasks" icon={ListChecks} label="Tasks" />
            <TabBtn id="plan" icon={Coffee} label="Study Plan" />
          </div>
          <div className="flex gap-2">
            <RetroButton
              color={notify ? 'cyan' : 'amber'}
              size="sm"
              onClick={() => setRemindersOpen(true)}
              title="Set up reminders: device notifications, texts, and calendar sync"
            >
              {notify ? <BellRing size={15} /> : <Bell size={15} />}
              Reminders
            </RetroButton>
            <RetroButton
              color="lime"
              size="sm"
              onClick={() =>
                downloadMyCalendar().catch((e) => toast.error(`Download failed: ${errText(e)}`))
              }
            >
              <Download size={15} /> .ics
            </RetroButton>
          </div>
        </div>

        {/* per-course filter chips */}
        {courses.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-pixel text-[10px] text-beige/70 mr-1">COURSE:</span>
            <button
              onClick={() => setCourseFilter(null)}
              className={`px-3 py-1.5 border-3 border-ink font-mono text-base transition-colors
                ${!courseFilter ? 'bg-beige text-ink' : 'bg-void text-beige/70 hover:bg-dusk'}`}
            >
              All
            </button>
            {courses.map((c) => (
              <button
                key={c.name}
                onClick={() => setCourseFilter(c.name)}
                className={`px-3 py-1.5 border-3 border-ink font-mono text-base transition-colors
                  ${courseFilter === c.name ? `bg-${c.color} text-ink` : 'bg-void text-beige/70 hover:bg-dusk'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {view === 'overview' && (
          <div className="space-y-6">
            {/* stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Done', value: `${stats.pct}%`, sub: `${stats.done}/${stats.total}`, color: 'lime' },
                { label: 'This week', value: stats.thisWeek, sub: 'due soon', color: 'cyan' },
                { label: 'Overdue', value: stats.overdue, sub: 'catch up', color: 'magenta' },
                { label: 'Total', value: stats.total, sub: 'tasks', color: 'grape' },
              ].map((c) => (
                <div key={c.label} className={`retro-panel noise p-4 shadow-chunk`}>
                  <div className="font-pixel text-[10px] text-beige/60 mb-1 uppercase">{c.label}</div>
                  <div className={`font-pixel text-xl text-${c.color}`}>{c.value}</div>
                  <div className="font-mono text-base text-beige/70">{c.sub}</div>
                </div>
              ))}
            </div>

            {/* progress bar */}
            <div className="retro-panel noise p-4 shadow-chunk">
              <div className="flex items-center justify-between mb-2">
                <span className="font-pixel text-[11px] text-beige">SEMESTER PROGRESS</span>
                <span className="font-mono text-lg text-lime">{stats.pct}%</span>
              </div>
              <div className="h-5 border-3 border-ink bg-void">
                <motion.div
                  className="h-full bg-lime"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.pct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>

            {/* upcoming */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Flame size={18} className="text-amber" />
                <h3 className="font-pixel text-sm text-beige">UPCOMING DEADLINES</h3>
              </div>
              {upcoming.length ? (
                <div className="space-y-2">{upcoming.map((e) => row(e))}</div>
              ) : (
                <div className="retro-panel noise p-8 text-center">
                  <Steve mood="celebrate" size={90} />
                  <p className="font-pixel text-sm text-lime mt-3">ALL CAUGHT UP!</p>
                  <p className="font-mono text-lg text-cyan mt-1">No deadlines on the horizon.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'calendar' && (
          <CalendarView events={scoped} onEdit={setEditing} onReschedule={reschedule} />
        )}

        {view === 'tasks' && (
          <div className="space-y-2">
            {(openTasks.length > 0 || scoped.some((e) => e.done)) && (
              <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
                <span className="font-mono text-lg text-beige/60">
                  {openTasks.length} to do · {scoped.filter((e) => e.done).length} done
                </span>
                <div className="flex gap-2">
                  <RetroButton
                    color="amber"
                    size="sm"
                    onClick={clearCompleted}
                    disabled={!scoped.some((e) => e.done)}
                    style={{ opacity: scoped.some((e) => e.done) ? 1 : 0.4 }}
                  >
                    <Eraser size={14} /> Clear Completed
                  </RetroButton>
                  <RetroButton color="magenta" size="sm" onClick={clearAll}>
                    <Trash2 size={14} /> Clear All
                  </RetroButton>
                </div>
              </div>
            )}
            {openTasks.length ? (
              openTasks.map((e) => row(e))
            ) : (
              <div className="retro-panel noise p-8 text-center">
                <Steve mood="celebrate" size={90} />
                <p className="font-pixel text-sm text-lime mt-3">EVERYTHING&apos;S DONE!</p>
              </div>
            )}
            {scoped.some((e) => e.done) && (
              <details className="mt-4">
                <summary className="font-pixel text-[11px] text-beige/60 cursor-pointer py-2">
                  ✓ COMPLETED ({scoped.filter((e) => e.done).length})
                </summary>
                <div className="space-y-2 mt-2">{scoped.filter((e) => e.done).map((e) => row(e))}</div>
              </details>
            )}
          </div>
        )}

        {view === 'plan' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Coffee size={18} className="text-grape" />
                <h3 className="font-pixel text-sm text-beige">YOUR STUDY PLAN</h3>
              </div>
              <RetroButton color="grape" size="sm" onClick={onOpenQuiz}>
                {studyPlan.length ? 'Rebuild / retake quiz' : 'Set up study plan'}
              </RetroButton>
            </div>

            {studyPlan.length ? (
              <>
                <p className="font-mono text-base text-beige/60">
                  {planOpen.length} to go · {planDone.length} done · spaced around your exams, quizzes
                  &amp; projects. Check one off as you go — edit or delete like any task.
                </p>
                {planOpen.length ? (
                  <div className="space-y-2">{planOpen.map((e) => row(e))}</div>
                ) : (
                  <div className="retro-panel noise p-6 text-center">
                    <Steve mood="celebrate" size={72} />
                    <p className="font-pixel text-sm text-lime mt-3">ALL SESSIONS DONE!</p>
                    <p className="font-mono text-base text-cyan mt-1">Nice work — you studied everything.</p>
                  </div>
                )}
                {planDone.length > 0 && (
                  <details className="mt-4">
                    <summary className="font-pixel text-[11px] text-beige/60 cursor-pointer py-2">
                      ✓ COMPLETED ({planDone.length})
                    </summary>
                    <div className="space-y-2 mt-2">{planDone.map((e) => row(e))}</div>
                  </details>
                )}
              </>
            ) : (
              <div className="retro-panel noise p-8 text-center">
                <Steve mood="reading" size={90} />
                <p className="font-pixel text-sm text-lime mt-3">NO STUDY SESSIONS YET</p>
                <p className="font-mono text-lg text-cyan mt-2 max-w-md mx-auto">
                  Steve builds your plan around <span className="text-magenta">exams</span>,{' '}
                  <span className="text-amber">quizzes</span>, and <span className="text-grape">projects</span>.
                  {assessmentCount === 0
                    ? ' Add a syllabus (or those dates) and your plan appears automatically.'
                    : ' Take the quick quiz and Steve will schedule your sessions.'}
                </p>
                <div className="mt-5 flex gap-2 justify-center">
                  {assessmentCount === 0 ? (
                    <RetroButton color="lime" size="md" onClick={onUploadMore}>
                      <UploadCloud size={15} /> Add Syllabus
                    </RetroButton>
                  ) : (
                    <RetroButton color="grape" size="md" onClick={onOpenQuiz}>
                      <Coffee size={15} /> Build my plan
                    </RetroButton>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <EventEditor
        event={editing}
        onSave={saveEvent}
        onClose={() => setEditing(null)}
        onDelete={deleteEvent}
      />

      <RemindersModal
        open={remindersOpen}
        user={user}
        onClose={() => {
          setRemindersOpen(false)
          if (typeof Notification !== 'undefined') setNotify(Notification.permission === 'granted')
        }}
      />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refreshEvents} />

      {/* undo toast */}
      <AnimatePresence>
        {undo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 bg-dusk border-3 border-ink shadow-chunk-lg px-4 py-3"
          >
            <span className="font-mono text-lg text-beige truncate max-w-[180px]">
              Deleted “{undo.title}”
            </span>
            <RetroButton color="lime" size="sm" onClick={undoDelete}>
              Undo
            </RetroButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
