import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ListChecks, ArrowLeft, CheckCheck } from 'lucide-react'
import Steve from '../Steve.jsx'
import RetroButton from '../RetroButton.jsx'
import CalendarView from './CalendarView.jsx'
import ListView from './ListView.jsx'
import EventEditor from './EventEditor.jsx'
import SyncBar from './SyncBar.jsx'
import { seedEvents } from '../../data/events.js'
import {
  patchEvent,
  deleteEvent as apiDeleteEvent,
  approveCourse,
  calendarIcsUrl,
} from '../../lib/api.js'

/**
 * Dashboard — the review screen. Users toggle between a calendar and list
 * view, edit/approve the events Steve extracted, then sync.
 *
 * Props:
 *   courseId      — live course id from the parser (null = offline demo mode)
 *   initialEvents — parsed events (falls back to seed data when none provided)
 *   onBack        — return to the upload screen
 */
export default function Dashboard({ courseId = null, initialEvents, onBack }) {
  const [events, setEvents] = useState(() =>
    initialEvents && initialEvents.length ? initialEvents : seedEvents(),
  )
  const [tab, setTab] = useState('calendar') // 'calendar' | 'list'
  const [editing, setEditing] = useState(null)

  const live = !!courseId // when false, mutations stay local-only

  const approvedCount = useMemo(() => events.filter((e) => e.approved).length, [events])

  // Persist a patch to the gateway when live; ignore failures (UI already
  // updated optimistically, and demo mode has no backend).
  const persist = (id, patch) => {
    if (live) patchEvent(id, patch).catch(() => {})
  }

  // --- mutations (optimistic; synced when live) ---
  const saveEvent = (updated) => {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    persist(updated.id, {
      title: updated.title,
      course: updated.course,
      type: updated.type,
      due: updated.due,
      allDay: updated.allDay,
    })
    setEditing(null)
  }
  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    if (live) apiDeleteEvent(id).catch(() => {})
    setEditing(null)
  }
  const toggleApprove = (id) =>
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, approved: !e.approved }
        persist(id, { approved: next.approved })
        return next
      }),
    )

  const approveAll = () => {
    setEvents((prev) => prev.map((e) => ({ ...e, approved: true })))
    if (live) approveCourse(courseId).catch(() => {})
  }

  // drag-to-reschedule: keep the time, change the day
  const reschedule = (id, y, m, d) =>
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const old = new Date(e.due)
        const due = new Date(y, m, d, old.getHours(), old.getMinutes()).toISOString()
        persist(id, { due })
        return { ...e, due }
      }),
    )

  const TabButton = ({ id, icon: Icon, label }) => {
    const active = tab === id
    return (
      <button
        onClick={() => setTab(id)}
        className={`flex items-center gap-2 px-4 py-2 border-3 border-ink font-pixel text-[11px] uppercase
          transition-colors ${active ? 'bg-magenta text-ink shadow-chunk' : 'bg-void text-beige/70 hover:bg-dusk'}`}
      >
        <Icon size={16} /> {label}
      </button>
    )
  }

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="crt relative border-b-5 border-ink bg-dusk/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9">
              <Steve mood="done" size={36} />
            </div>
            <div>
              <span className="font-pixel text-xs sm:text-sm text-beige block leading-tight">
                REVIEW <span className="text-lime">DASHBOARD</span>
              </span>
              <span className="font-mono text-base text-cyan">
                Steve found {events.length} dates — check his work
              </span>
            </div>
          </div>
          <RetroButton color="beige" size="sm" onClick={onBack}>
            <ArrowLeft size={16} /> Upload
          </RetroButton>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
        {/* controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            <TabButton id="calendar" icon={CalendarDays} label="Calendar" />
            <TabButton id="list" icon={ListChecks} label="List" />
          </div>
          <RetroButton color="lime" size="sm" onClick={approveAll}>
            <CheckCheck size={16} /> Approve All
          </RetroButton>
        </div>

        {/* views */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'calendar' ? (
              <CalendarView events={events} onEdit={setEditing} onReschedule={reschedule} />
            ) : (
              <ListView events={events} onEdit={setEditing} onToggleApprove={toggleApprove} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* sync */}
        <SyncBar
          courseId={courseId}
          approvedCount={approvedCount}
          totalCount={events.length}
          icsUrl={courseId ? calendarIcsUrl(courseId) : null}
        />
      </main>

      {/* edit modal */}
      <EventEditor
        event={editing}
        onSave={saveEvent}
        onClose={() => setEditing(null)}
        onDelete={deleteEvent}
      />
    </div>
  )
}
