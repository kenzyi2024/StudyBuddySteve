import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import { EVENT_TYPES, EDITABLE_TYPES } from '../../data/events.js'

// Split an ISO string into <input type=date> and <input type=time> values.
function isoToInputs(iso) {
  const dt = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
  return { date, time }
}

/**
 * EventEditor — retro modal for editing a single event.
 * Props: event (or null to close), onSave(updated), onClose, onDelete(id)
 */
export default function EventEditor({ event, onSave, onClose, onDelete }) {
  return (
    <AnimatePresence>
      {event && <Inner key={event.id} event={event} onSave={onSave} onClose={onClose} onDelete={onDelete} />}
    </AnimatePresence>
  )
}

function Inner({ event, onSave, onClose, onDelete }) {
  const init = isoToInputs(event.due)
  const [title, setTitle] = useState(event.title)
  const [course, setCourse] = useState(event.course)
  const [type, setType] = useState(event.type)
  const [date, setDate] = useState(init.date)
  const [time, setTime] = useState(init.time)
  const [allDay, setAllDay] = useState(event.allDay)

  const save = () => {
    const [y, m, d] = date.split('-').map(Number)
    let hh = 0
    let mm = 0
    if (!allDay && time) {
      ;[hh, mm] = time.split(':').map(Number)
    }
    onSave({
      ...event,
      title: title.trim() || 'Untitled',
      course: course.trim() || 'Course',
      type,
      allDay,
      due: new Date(y, m - 1, d, hh, mm).toISOString(),
    })
  }

  const field =
    'w-full bg-void border-3 border-ink text-beige font-mono text-xl px-3 py-2 focus:outline-none focus:border-cyan'

  return (
    <motion.div
      className="fixed inset-0 z-[90] grid place-items-center p-4 bg-ink/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="crt retro-panel noise w-full max-w-md p-6 shadow-chunk-lg"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-pixel text-sm text-beige">EDIT EVENT</h3>
          <button onClick={onClose} className="text-magenta hover:text-lime" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-pixel text-[10px] text-cyan block mb-1">TITLE</label>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-pixel text-[10px] text-cyan block mb-1">COURSE</label>
              <input className={field} value={course} onChange={(e) => setCourse(e.target.value)} />
            </div>
            <div>
              <label className="font-pixel text-[10px] text-cyan block mb-1">TYPE</label>
              <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
                {EDITABLE_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_TYPES[k].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-pixel text-[10px] text-cyan block mb-1">DATE</label>
              <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="font-pixel text-[10px] text-cyan block mb-1">TIME</label>
              <input
                type="time"
                className={`${field} disabled:opacity-40`}
                value={time}
                disabled={allDay}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 font-mono text-lg text-beige cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-5 h-5 accent-magenta"
            />
            All-day event
          </label>
        </div>

        <div className="flex items-center justify-between mt-6">
          <RetroButton color="magenta" size="sm" onClick={() => onDelete(event.id)}>
            Delete
          </RetroButton>
          <div className="flex gap-2">
            <RetroButton color="beige" size="sm" onClick={onClose}>
              Cancel
            </RetroButton>
            <RetroButton color="lime" size="sm" onClick={save}>
              Save
            </RetroButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
