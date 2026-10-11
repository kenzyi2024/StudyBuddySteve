import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, ListChecks, ArrowLeft, Trash2, UploadCloud } from 'lucide-react'
import Steve from '../Steve'
import RetroButton from '../RetroButton'
import CalendarView from './CalendarView'
import ListView from './ListView'
import EventEditor from './EventEditor'
import {
  patchEvent,
  deleteEvent as apiDeleteEvent,
  commitCourse,
  discardPendingReview,
} from '../../lib/api'
import { useToast } from '../../lib/toast'
import type { EventItem } from '../../types'

interface DashboardProps {
  courseId: string
  initialEvents?: EventItem[] | null
  /** Leave the review (to My Semester). Un-added events stay pending there. */
  onExit: () => void
  /** Go back to the upload screen (used when nothing was found). */
  onUploadAnother: () => void
}

const errText = (e: unknown) => (e as Error)?.message || 'network error'

/**
 * Dashboard — the review screen for one parsed syllabus. The student fixes or
 * removes what Steve got wrong, then adds everything that's left to their
 * calendar. Leaving early is safe: the events stay pending and My Semester
 * offers to resume the review.
 */
export default function Dashboard({ courseId, initialEvents, onExit, onUploadAnother }: DashboardProps) {
  const [events, setEvents] = useState<EventItem[]>(() => initialEvents ?? [])
  const [tab, setTab] = useState<'calendar' | 'list'>('list')
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  // --- mutations: optimistic, rolled back (with a visible error) on failure ---
  const replace = (ev: EventItem) => setEvents((prev) => prev.map((e) => (e.id === ev.id ? ev : e)))

  const saveEvent = (updated: EventItem) => {
    const before = events.find((e) => e.id === updated.id)
    replace(updated)
    setEditing(null)
    patchEvent(updated.id, {
      title: updated.title,
      course: updated.course,
      type: updated.type,
      due: updated.due,
      allDay: updated.allDay,
    }).catch((e) => {
      if (before) replace(before)
      toast.error(`Couldn’t save “${updated.title}”: ${errText(e)}`)
    })
  }

  const deleteEvent = (id: string) => {
    const removed = events.find((e) => e.id === id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setEditing(null)
    apiDeleteEvent(id).catch((e) => {
      if (removed) setEvents((prev) => [...prev, removed])
      toast.error(`Couldn’t remove “${removed?.title || 'event'}”: ${errText(e)}`)
    })
  }

  // drag-to-reschedule: keep the wall-clock time, change the day
  const reschedule = (id: string, y: number, m: number, d: number) => {
    const before = events.find((e) => e.id === id)
    if (!before) return
    const old = new Date(before.due)
    const due = new Date(Date.UTC(y, m, d, old.getUTCHours(), old.getUTCMinutes())).toISOString()
    replace({ ...before, due })
    patchEvent(id, { due }).catch((e) => {
      replace(before)
      toast.error(`Couldn’t move “${before.title}”: ${errText(e)}`)
    })
  }

  const addToCalendar = async () => {
    setBusy(true)
    try {
      await commitCourse(courseId)
      toast.ok(`Added ${events.length} event${events.length === 1 ? '' : 's'} to your calendar`)
      onExit()
    } catch (e) {
      // Stay here — nothing is lost, the student can simply retry.
      toast.error(`Couldn’t add these to your calendar (${errText(e)}). Nothing was lost — try again.`)
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!window.confirm('Discard this syllabus? None of its dates will be added to your calendar.')) return
    setBusy(true)
    try {
      await discardPendingReview(courseId)
      onExit()
    } catch (e) {
      toast.error(`Couldn’t discard it: ${errText(e)}`)
      setBusy(false)
    }
  }

  const finishLater = () => {
    if (events.length) toast.ok('Saved for later — resume this review from My Semester.')
    onExit()
  }

  const lowConfidence = events.filter((e) => (e.confidence ?? 1) < 0.7).length

  const TabButton = ({ id, icon: Icon, label }: { id: 'calendar' | 'list'; icon: typeof CalendarDays; label: string }) => {
    const active = tab === id
    return (
      <button
        onClick={() => setTab(id)}
        aria-pressed={active}
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
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0">
              <Steve mood="done" size={36} />
            </div>
            <div className="min-w-0">
              <span className="font-pixel text-xs sm:text-sm text-beige block leading-tight">
                REVIEW <span className="text-lime">DATES</span>
              </span>
              <span className="font-mono text-base text-cyan">
                Steve found {events.length} date{events.length === 1 ? '' : 's'} — check his work
              </span>
            </div>
          </div>
          <RetroButton color="beige" size="sm" onClick={finishLater} disabled={busy} aria-label="Finish later">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Finish later</span>
          </RetroButton>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
        {events.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2">
                <TabButton id="list" icon={ListChecks} label="List" />
                <TabButton id="calendar" icon={CalendarDays} label="Calendar" />
              </div>
              {lowConfidence > 0 && (
                <span className="font-mono text-lg text-amber">
                  ▸ Steve isn&apos;t sure about {lowConfidence} — they&apos;re outlined in amber
                </span>
              )}
            </div>

            {/* keyed so React remounts on tab change */}
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {tab === 'calendar' ? (
                <CalendarView events={events} onEdit={setEditing} onReschedule={reschedule} />
              ) : (
                <ListView events={events} onEdit={setEditing} onDelete={deleteEvent} />
              )}
            </motion.div>
          </>
        )}

        {/* the one decision on this screen */}
        {events.length > 0 ? (
          <div className="retro-panel noise p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-chunk-lg">
            <div>
              <p className="font-pixel text-xs text-amber">REVIEW BEFORE ADDING</p>
              <p className="font-mono text-lg text-beige/70 mt-1">
                Fix or remove anything wrong above. Nothing is in your calendar until you add it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <RetroButton color="magenta" size="sm" onClick={discard} disabled={busy}>
                <Trash2 size={14} /> Discard
              </RetroButton>
              <RetroButton color="lime" size="lg" onClick={addToCalendar} disabled={busy}>
                {busy ? 'ADDING…' : `✓ Add ${events.length} to my calendar`}
              </RetroButton>
            </div>
          </div>
        ) : (
          <div className="retro-panel noise p-10 text-center flex flex-col items-center">
            <Steve mood="idle" size={100} />
            <p className="font-pixel text-sm text-beige mt-4">NO DATES FOUND</p>
            <p className="font-mono text-xl text-cyan mt-2 max-w-md">
              Steve didn&apos;t spot any deadlines in that file. Try a syllabus with a schedule or dated
              deadlines.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <RetroButton color="lime" size="md" onClick={onUploadAnother}>
                <UploadCloud size={16} /> Try another file
              </RetroButton>
              <RetroButton color="beige" size="md" onClick={onExit}>
                My Semester
              </RetroButton>
            </div>
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
