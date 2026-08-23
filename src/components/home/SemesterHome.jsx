import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  ListChecks,
  LayoutDashboard,
  UploadCloud,
  Download,
  Bell,
  BellRing,
  Check,
  Clock,
  Flame,
  LogOut,
  Trash2,
  Eraser,
} from 'lucide-react'
import Steve from '../Steve.jsx'
import RetroButton from '../RetroButton.jsx'
import TypeBadge from '../dashboard/TypeBadge.jsx'
import CalendarView from '../dashboard/CalendarView.jsx'
import EventEditor from '../dashboard/EventEditor.jsx'
import { fmtTime, fmtDateLong, typeMeta, courseColors } from '../../data/events.js'
import {
  patchEvent,
  deleteEvent as apiDeleteEvent,
  myCalendarIcsUrl,
  getPushKey,
  subscribePush,
} from '../../lib/api.js'

// Convert a base64url VAPID key to the Uint8Array the Push API expects.
function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Whole-day difference between an event's wall-clock date and today.
function daysUntil(iso) {
  const d = new Date(iso)
  const due = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const n = new Date()
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
  return Math.round((due - today) / 86400000)
}

function countdownLabel(days) {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `in ${days} days`
}

function urgencyColor(days, done) {
  if (done) return 'text-beige/40'
  if (days < 0) return 'text-magenta'
  if (days <= 1) return 'text-amber'
  if (days <= 3) return 'text-lime'
  return 'text-cyan'
}

const NOTIFIED_KEY = 'steve_notified'

export default function SemesterHome({ user, initialEvents = [], onUploadMore, onLogout }) {
  const [events, setEvents] = useState(initialEvents)
  const [view, setView] = useState('overview') // overview | calendar | tasks
  const [editing, setEditing] = useState(null)
  const [courseFilter, setCourseFilter] = useState(null) // null = all courses
  const [notify, setNotify] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )
  const notifiedRef = useRef(new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')))

  useEffect(() => setEvents(initialEvents), [initialEvents])

  // --- persistence helpers ---
  const patch = (id, body) => patchEvent(id, body).catch(() => {})
  const toggleDone = (id) =>
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const done = !e.done
        patch(id, { done })
        return { ...e, done }
      }),
    )
  const saveEvent = (updated) => {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    patch(updated.id, {
      title: updated.title,
      course: updated.course,
      type: updated.type,
      label: updated.label,
      due: updated.due,
      allDay: updated.allDay,
    })
    setEditing(null)
  }
  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    apiDeleteEvent(id).catch(() => {})
    setEditing(null)
  }
  // Bulk delete: removes a set of ids locally and on the server.
  const deleteMany = (ids) => {
    const set = new Set(ids)
    setEvents((prev) => prev.filter((e) => !set.has(e.id)))
    ids.forEach((id) => apiDeleteEvent(id).catch(() => {}))
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
  const reschedule = (id, y, m, d) =>
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const old = new Date(e.due)
        const due = new Date(Date.UTC(y, m, d, old.getUTCHours(), old.getUTCMinutes())).toISOString()
        patch(id, { due })
        return { ...e, due }
      }),
    )

  // --- courses (for the filter + per-course colors), from the shared palette ---
  const courseMap = useMemo(() => courseColors(events), [events])
  const courses = useMemo(
    () => [...courseMap.entries()].map(([name, c]) => ({ name, color: c.name })),
    [courseMap],
  )
  const courseColor = (name) => courseMap.get(name || 'Course')?.name || 'cyan'
  const courseHex = (name) => courseMap.get(name || 'Course')?.hex || '#22e0ff'

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
        .sort((a, b) => new Date(a.due) - new Date(b.due))
        .slice(0, 12),
    [scoped],
  )

  const openTasks = useMemo(
    () => scoped.filter((e) => !e.done).sort((a, b) => new Date(a.due) - new Date(b.due)),
    [scoped],
  )

  // --- reminders: background push (works when the app is closed) with an
  //     in-page notification fallback when push isn't available/configured ---
  const enableReminders = async () => {
    if (typeof Notification === 'undefined') return
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
    setNotify(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      const { key } = await getPushKey()
      if (!key) return // server push not configured; keep in-page reminders
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(key),
      })
      await subscribePush(sub)
    } catch {
      /* push subscribe failed — in-page reminders still work */
    }
  }

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
    if (changed) localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedRef.current]))
  }, [notify, events])

  const TabBtn = ({ id, icon: Icon, label }) => {
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

  const TaskRow = ({ e }) => {
    const days = daysUntil(e.due)
    const meta = typeMeta(e.type)
    return (
      <motion.div
        layout
        className={`retro-panel noise flex items-center gap-3 p-3 pl-2 shadow-chunk overflow-hidden ${e.done ? 'opacity-60' : ''}`}
      >
        {/* per-course color stripe */}
        <span
          aria-hidden
          className="self-stretch w-2 -my-3 -ml-2 mr-1 shrink-0"
          style={{ backgroundColor: courseHex(e.course) }}
        />
        <button
          onClick={() => toggleDone(e.id)}
          aria-label={e.done ? 'Mark not done' : 'Mark done'}
          className={`shrink-0 w-8 h-8 grid place-items-center border-3 border-ink transition-colors
            ${e.done ? 'bg-lime' : 'bg-void hover:bg-dusk'}`}
        >
          {e.done && <Check size={16} className="text-ink" strokeWidth={3} />}
        </button>
        <button onClick={() => setEditing(e)} className="flex-1 min-w-0 text-left">
          <div className={`font-body font-bold text-beige truncate ${e.done ? 'line-through' : ''}`}>
            {e.title}
          </div>
          <div className="flex items-center gap-3 font-mono text-base text-beige/60 mt-0.5">
            {e.course && <span className={`text-${courseColor(e.course)}`}>{e.course}</span>}
            <span className="flex items-center gap-1">
              <Clock size={12} /> {fmtDateLong(e.due).replace(/^.*· /, '')} · {fmtTime(e.due, e.allDay)}
            </span>
          </div>
        </button>
        <span className={`font-mono text-base whitespace-nowrap ${urgencyColor(days, e.done)}`}>
          {e.done ? 'done' : countdownLabel(days)}
        </span>
        <TypeBadge type={e.type} label={e.label} size="sm" />
        <button
          onClick={() => deleteEvent(e.id)}
          aria-label="Delete task"
          className="shrink-0 w-8 h-8 grid place-items-center border-3 border-ink bg-void text-magenta hover:bg-magenta hover:text-ink transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </motion.div>
    )
  }

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
        {/* tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            <TabBtn id="overview" icon={LayoutDashboard} label="Overview" />
            <TabBtn id="calendar" icon={CalendarDays} label="Calendar" />
            <TabBtn id="tasks" icon={ListChecks} label="Tasks" />
          </div>
          <div className="flex gap-2">
            <RetroButton
              color={notify ? 'cyan' : 'amber'}
              size="sm"
              onClick={enableReminders}
              title="Get browser reminders for deadlines due within 24h (while the app is open)"
            >
              {notify ? <BellRing size={15} /> : <Bell size={15} />}
              {notify ? 'Reminders on' : 'Reminders'}
            </RetroButton>
            <RetroButton
              color="lime"
              size="sm"
              onClick={() => {
                const a = document.createElement('a')
                a.href = myCalendarIcsUrl()
                a.download = 'my-semester.ics'
                document.body.appendChild(a)
                a.click()
                a.remove()
              }}
            >
              <Download size={15} /> .ics
            </RetroButton>
          </div>
        </div>

        {/* per-course filter chips */}
        {courses.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-pixel text-[10px] text-beige/50 mr-1">COURSE:</span>
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
                  <div className="font-mono text-base text-beige/50">{c.sub}</div>
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
                <div className="space-y-2">
                  {upcoming.map((e) => (
                    <TaskRow key={e.id} e={e} />
                  ))}
                </div>
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
              openTasks.map((e) => <TaskRow key={e.id} e={e} />)
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
                <div className="space-y-2 mt-2">
                  {scoped.filter((e) => e.done).map((e) => (
                    <TaskRow key={e.id} e={e} />
                  ))}
                </div>
              </details>
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
    </div>
  )
}
