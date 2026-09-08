import { motion } from 'framer-motion'
import { Check, Clock, Trash2 } from 'lucide-react'
import TypeBadge from '../dashboard/TypeBadge.jsx'
import { fmtTime, fmtDateLong } from '../../data/events.js'
import { daysUntil, countdownLabel, urgencyColor } from '../../lib/schedule'
import type { EventItem } from '../../types'

interface TaskRowProps {
  e: EventItem
  courseColorName: string // tailwind color name for the course text
  courseHex: string // hex for the left stripe
  onToggleDone: (id: string) => void
  onEdit: (e: EventItem) => void
  onDelete: (id: string) => void
}

/** A single task row: course stripe, done toggle, title, countdown, delete. */
export default function TaskRow({ e, courseColorName, courseHex, onToggleDone, onEdit, onDelete }: TaskRowProps) {
  const days = daysUntil(e.due)
  return (
    <motion.div
      layout
      className={`retro-panel noise flex items-center gap-3 p-3 pl-2 shadow-chunk overflow-hidden ${e.done ? 'opacity-60' : ''}`}
    >
      <span
        aria-hidden
        className="self-stretch w-2 -my-3 -ml-2 mr-1 shrink-0"
        style={{ backgroundColor: courseHex }}
      />
      <button
        onClick={() => onToggleDone(e.id)}
        aria-label={e.done ? 'Mark not done' : 'Mark done'}
        className={`shrink-0 w-8 h-8 grid place-items-center border-3 border-ink transition-colors
          ${e.done ? 'bg-lime' : 'bg-void hover:bg-dusk'}`}
      >
        {e.done && <Check size={16} className="text-ink" strokeWidth={3} />}
      </button>
      <button onClick={() => onEdit(e)} className="flex-1 min-w-0 text-left">
        <div className={`font-body font-bold text-beige truncate ${e.done ? 'line-through' : ''}`}>
          {e.title}
        </div>
        <div className="flex items-center gap-3 font-mono text-base text-beige/60 mt-0.5">
          {e.course && <span className={`text-${courseColorName}`}>{e.course}</span>}
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
        onClick={() => onDelete(e.id)}
        aria-label="Delete task"
        className="shrink-0 w-8 h-8 grid place-items-center border-3 border-ink bg-void text-magenta hover:bg-magenta hover:text-ink transition-colors"
      >
        <Trash2 size={15} />
      </button>
    </motion.div>
  )
}
