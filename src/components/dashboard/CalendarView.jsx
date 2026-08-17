import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import { MONTHS, WEEKDAYS, monthGrid, sameDay, typeMeta, fmtTime } from '../../data/events.js'

/**
 * CalendarView — chunky retro month grid. Events render as color chips inside
 * day cells and can be dragged onto another day to reschedule (native DnD).
 */
export default function CalendarView({ events, onEdit, onReschedule }) {
  // Default to the month of the earliest event so there's always something visible.
  const firstDue = events.length
    ? new Date(Math.min(...events.map((e) => new Date(e.due))))
    : new Date()
  const [view, setView] = useState({ y: firstDue.getFullYear(), m: firstDue.getMonth() })
  const [dropTarget, setDropTarget] = useState(null) // cell key being hovered

  const cells = monthGrid(view.y, view.m)

  const move = (delta) => {
    setView((v) => {
      const nm = v.m + delta
      if (nm < 0) return { y: v.y - 1, m: 11 }
      if (nm > 11) return { y: v.y + 1, m: 0 }
      return { ...v, m: nm }
    })
  }

  const handleDrop = (cell) => {
    setDropTarget(null)
    const raw = window.__steveDrag
    if (!raw) return
    onReschedule(raw, cell.y, cell.m, cell.d)
  }

  return (
    <div className="retro-panel noise p-4 sm:p-5 shadow-chunk-lg">
      {/* header / month nav */}
      <div className="flex items-center justify-between mb-4">
        <RetroButton color="cyan" size="sm" onClick={() => move(-1)}>
          <ChevronLeft size={16} />
        </RetroButton>
        <h3 className="font-pixel text-sm sm:text-base text-beige text-shadow-chunk">
          {MONTHS[view.m].toUpperCase()} {view.y}
        </h3>
        <RetroButton color="cyan" size="sm" onClick={() => move(1)}>
          <ChevronRight size={16} />
        </RetroButton>
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="font-pixel text-[9px] text-amber text-center py-1">
            {w.toUpperCase()}
          </div>
        ))}
      </div>

      {/* day grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell) => {
          const key = `${cell.y}-${cell.m}-${cell.d}`
          const dayEvents = events.filter((e) => sameDay(e.due, cell.y, cell.m, cell.d))
          const isTarget = dropTarget === key
          return (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault()
                setDropTarget(key)
              }}
              onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
              onDrop={() => handleDrop(cell)}
              className={`min-h-[76px] sm:min-h-[96px] border-3 border-ink p-1 relative transition-colors
                ${cell.inMonth ? 'bg-void' : 'bg-dusk/40'}
                ${isTarget ? 'bg-lime/20 border-lime' : ''}`}
            >
              <div
                className={`font-mono text-base leading-none mb-1 px-1
                  ${cell.inMonth ? 'text-beige/70' : 'text-beige/25'}`}
              >
                {cell.d}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => {
                  const meta = typeMeta(e.type)
                  return (
                    <motion.button
                      key={e.id}
                      layout
                      draggable
                      onDragStart={() => {
                        window.__steveDrag = e.id
                      }}
                      onDragEnd={() => {
                        window.__steveDrag = null
                      }}
                      onClick={() => onEdit(e)}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      title={`${e.title} · ${fmtTime(e.due, e.allDay)} (drag to move)`}
                      style={{ backgroundColor: meta.hex }}
                      className={`w-full text-left border-2 border-ink px-1 py-0.5 cursor-grab active:cursor-grabbing
                        font-mono text-[13px] leading-tight text-ink truncate
                        ${e.approved ? 'ring-2 ring-lime' : ''}`}
                    >
                      {e.title}
                    </motion.button>
                  )
                })}
                {dayEvents.length > 3 && (
                  <div className="font-mono text-sm text-cyan px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="font-mono text-base text-beige/40 mt-3 text-center">
        ▸ drag a chip to another day to reschedule · click to edit
      </p>
    </div>
  )
}
