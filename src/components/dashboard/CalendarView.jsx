import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import TypeBadge from './TypeBadge.jsx'
import { MONTHS, WEEKDAYS, monthGrid, sameDay, typeMeta, fmtTime } from '../../data/events.js'

/**
 * CalendarView — chunky retro calendar with Year / Month / Week / Day views.
 * Click any day to drill into everything scheduled for it. Month & Week support
 * drag-to-reschedule; click a chip to edit.
 */
export default function CalendarView({ events, onEdit, onReschedule }) {
  // Anchor the calendar on the earliest event (or today) using UTC wall-clock.
  const firstDue = events.length
    ? new Date(Math.min(...events.map((e) => new Date(e.due))))
    : new Date()
  const [cursor, setCursor] = useState(
    () => new Date(Date.UTC(firstDue.getUTCFullYear(), firstDue.getUTCMonth(), firstDue.getUTCDate())),
  )
  const [mode, setMode] = useState('month') // year | month | week | day
  const [dropTarget, setDropTarget] = useState(null)

  const cy = cursor.getUTCFullYear()
  const cm = cursor.getUTCMonth()
  const cd = cursor.getUTCDate()

  const dayEvents = (y, m, d) =>
    events
      .filter((e) => sameDay(e.due, y, m, d))
      .sort((a, b) => new Date(a.due) - new Date(b.due))

  const isToday = (y, m, d) => {
    const n = new Date()
    return n.getFullYear() === y && n.getMonth() === m && n.getDate() === d
  }

  const goToDay = (y, m, d) => {
    setCursor(new Date(Date.UTC(y, m, d)))
    setMode('day')
  }

  // prev/next depends on the mode's period length.
  const step = (dir) => {
    const c = new Date(cursor)
    if (mode === 'year') c.setUTCFullYear(cy + dir)
    else if (mode === 'month') c.setUTCMonth(cm + dir)
    else if (mode === 'week') c.setUTCDate(cd + 7 * dir)
    else c.setUTCDate(cd + dir)
    setCursor(c)
  }

  const handleDrop = (y, m, d) => {
    setDropTarget(null)
    const id = window.__steveDrag
    if (id) onReschedule(id, y, m, d)
  }

  // A draggable, clickable event chip.
  const Chip = ({ e, compact }) => {
    const meta = typeMeta(e.type)
    return (
      <motion.button
        layout
        draggable
        onDragStart={() => (window.__steveDrag = e.id)}
        onDragEnd={() => (window.__steveDrag = null)}
        onClick={(ev) => {
          ev.stopPropagation()
          onEdit(e)
        }}
        whileHover={{ scale: 1.03 }}
        title={`${e.title} · ${fmtTime(e.due, e.allDay)}`}
        style={{ backgroundColor: meta.hex }}
        className={`w-full text-left border-2 border-ink px-1 py-0.5 cursor-grab active:cursor-grabbing
          font-mono leading-tight text-ink truncate ${compact ? 'text-[13px]' : 'text-sm'}
          ${e.done ? 'line-through opacity-70' : ''}`}
      >
        {e.title}
      </motion.button>
    )
  }

  const title = {
    year: `${cy}`,
    month: `${MONTHS[cm].toUpperCase()} ${cy}`,
    week: (() => {
      const w = weekDates(cy, cm, cd)
      const a = w[0]
      const b = w[6]
      return `${MONTHS[a.m].slice(0, 3)} ${a.d} – ${MONTHS[b.m].slice(0, 3)} ${b.d}`
    })(),
    day: `${WEEKDAYS[new Date(Date.UTC(cy, cm, cd)).getUTCDay()]}, ${MONTHS[cm]} ${cd}`,
  }[mode]

  const ModeBtn = ({ id, label }) => (
    <button
      onClick={() => setMode(id)}
      className={`px-3 py-1.5 border-3 border-ink font-pixel text-[10px] uppercase transition-colors
        ${mode === id ? 'bg-cyan text-ink' : 'bg-void text-beige/70 hover:bg-dusk'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="retro-panel noise p-4 sm:p-5 shadow-chunk-lg">
      {/* controls */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex gap-1">
          <ModeBtn id="year" label="Year" />
          <ModeBtn id="month" label="Month" />
          <ModeBtn id="week" label="Week" />
          <ModeBtn id="day" label="Day" />
        </div>
        <div className="flex items-center gap-2">
          <RetroButton color="cyan" size="sm" onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </RetroButton>
          <h3 className="font-pixel text-xs sm:text-sm text-beige text-shadow-chunk text-center min-w-[120px]">
            {title}
          </h3>
          <RetroButton color="cyan" size="sm" onClick={() => step(1)}>
            <ChevronRight size={16} />
          </RetroButton>
        </div>
      </div>

      {/* ---- YEAR ---- */}
      {mode === 'year' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, m) => {
            const count = events.filter((e) => {
              const dt = new Date(e.due)
              return dt.getUTCFullYear() === cy && dt.getUTCMonth() === m
            }).length
            return (
              <button
                key={m}
                onClick={() => {
                  setCursor(new Date(Date.UTC(cy, m, 1)))
                  setMode('month')
                }}
                className="border-3 border-ink bg-void hover:bg-dusk p-2 text-left transition-colors"
              >
                <div className="font-pixel text-[10px] text-amber mb-1">{MONTHS[m].toUpperCase()}</div>
                <MiniMonth y={cy} m={m} events={events} />
                <div className="font-mono text-sm text-cyan mt-1">
                  {count ? `${count} item${count > 1 ? 's' : ''}` : '—'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ---- MONTH ---- */}
      {mode === 'month' && (
        <>
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="font-pixel text-[9px] text-amber text-center py-1">
                {w.toUpperCase()}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {monthGrid(cy, cm).map((cell) => {
              const key = `${cell.y}-${cell.m}-${cell.d}`
              const evs = dayEvents(cell.y, cell.m, cell.d)
              const isTarget = dropTarget === key
              return (
                <div
                  key={key}
                  onClick={() => goToDay(cell.y, cell.m, cell.d)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropTarget(key)
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                  onDrop={() => handleDrop(cell.y, cell.m, cell.d)}
                  className={`min-h-[76px] sm:min-h-[96px] border-3 border-ink p-1 relative cursor-pointer transition-colors
                    ${cell.inMonth ? 'bg-void' : 'bg-dusk/40'}
                    ${isTarget ? 'bg-lime/20 border-lime' : ''}
                    ${isToday(cell.y, cell.m, cell.d) ? 'ring-2 ring-magenta' : ''}`}
                >
                  <div className={`font-mono text-base leading-none mb-1 px-1 ${cell.inMonth ? 'text-beige/70' : 'text-beige/25'}`}>
                    {cell.d}
                  </div>
                  <div className="space-y-1">
                    {evs.slice(0, 3).map((e) => (
                      <Chip key={e.id} e={e} compact />
                    ))}
                    {evs.length > 3 && (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          goToDay(cell.y, cell.m, cell.d)
                        }}
                        className="font-mono text-sm text-cyan px-1 hover:text-lime"
                      >
                        +{evs.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="font-mono text-base text-beige/40 mt-3 text-center">
            ▸ click a day to see everything · drag a chip to reschedule
          </p>
        </>
      )}

      {/* ---- WEEK ---- */}
      {mode === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {weekDates(cy, cm, cd).map((wd) => {
            const key = `${wd.y}-${wd.m}-${wd.d}`
            const evs = dayEvents(wd.y, wd.m, wd.d)
            const isTarget = dropTarget === key
            return (
              <div
                key={key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropTarget(key)
                }}
                onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                onDrop={() => handleDrop(wd.y, wd.m, wd.d)}
                className={`border-3 border-ink p-2 min-h-[110px] transition-colors
                  ${isTarget ? 'bg-lime/20 border-lime' : 'bg-void'}
                  ${isToday(wd.y, wd.m, wd.d) ? 'ring-2 ring-magenta' : ''}`}
              >
                <button
                  onClick={() => goToDay(wd.y, wd.m, wd.d)}
                  className="font-pixel text-[9px] text-amber mb-2 block hover:text-lime"
                >
                  {WEEKDAYS[new Date(Date.UTC(wd.y, wd.m, wd.d)).getUTCDay()].toUpperCase()} {wd.d}
                </button>
                <div className="space-y-1">
                  {evs.length ? (
                    evs.map((e) => <Chip key={e.id} e={e} />)
                  ) : (
                    <span className="font-mono text-sm text-beige/30">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ---- DAY ---- */}
      {mode === 'day' && (
        <div className="space-y-2">
          {dayEvents(cy, cm, cd).length ? (
            dayEvents(cy, cm, cd).map((e) => (
              <button
                key={e.id}
                onClick={() => onEdit(e)}
                className={`w-full retro-panel noise flex items-center gap-3 p-3 shadow-chunk text-left ${e.done ? 'opacity-60' : ''}`}
              >
                <span className="font-mono text-lg text-cyan w-20 shrink-0">{fmtTime(e.due, e.allDay)}</span>
                <span className={`flex-1 font-body font-bold text-beige truncate ${e.done ? 'line-through' : ''}`}>
                  {e.title}
                </span>
                {e.course && <span className="font-mono text-base text-beige/50 hidden sm:block">{e.course}</span>}
                <TypeBadge type={e.type} label={e.label} size="sm" />
              </button>
            ))
          ) : (
            <div className="retro-panel noise p-8 text-center">
              <p className="font-pixel text-sm text-beige">NOTHING DUE</p>
              <p className="font-mono text-lg text-cyan mt-1">Enjoy the free day!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Sunday-anchored 7 dates for the week containing (y,m,d), in UTC wall-clock.
function weekDates(y, m, d) {
  const base = new Date(Date.UTC(y, m, d))
  const start = new Date(base)
  start.setUTCDate(base.getUTCDate() - base.getUTCDay())
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start)
    x.setUTCDate(start.getUTCDate() + i)
    return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() }
  })
}

// Tiny month grid with dots on days that have events (for the Year view).
function MiniMonth({ y, m, events }) {
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const hasEvents = (d) =>
    events.some((e) => {
      const dt = new Date(e.due)
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d
    })
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  return (
    <div className="grid grid-cols-7 gap-[2px]">
      {cells.map((d, i) => (
        <div
          key={i}
          className={`aspect-square rounded-[1px] ${
            d == null ? '' : hasEvents(d) ? 'bg-magenta' : 'bg-dusk'
          }`}
        />
      ))}
    </div>
  )
}
