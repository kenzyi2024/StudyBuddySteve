import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Check, AlertCircle, Clock } from 'lucide-react'
import TypeBadge from './TypeBadge.jsx'
import { fmtTime, fmtDateLong, isoDateKey } from '../../data/events.js'

// Group events by day and sort chronologically. Events with an invalid/missing
// due date are bucketed under "Undated" instead of crashing the view.
function groupByDay(events) {
  const map = new Map()
  const valid = (iso) => iso && !Number.isNaN(new Date(iso).getTime())
  const sorted = [...events].sort((a, b) => {
    const ta = valid(a.due) ? new Date(a.due).getTime() : Infinity
    const tb = valid(b.due) ? new Date(b.due).getTime() : Infinity
    return ta - tb
  })
  for (const e of sorted) {
    const key = valid(e.due) ? isoDateKey(e.due) : 'undated'
    const label = valid(e.due) ? fmtDateLong(e.due) : 'Undated'
    if (!map.has(key)) map.set(key, { label, items: [] })
    map.get(key).items.push(e)
  }
  return [...map.values()]
}

/**
 * ListView — grouped, chronological list of extracted events.
 * Each row can be approved, edited, and shows a low-confidence flag.
 */
export default function ListView({ events, onEdit, onToggleApprove }) {
  const groups = groupByDay(events)

  if (!events.length) {
    return (
      <div className="retro-panel noise p-10 text-center">
        <p className="font-pixel text-sm text-beige">NO DATES FOUND</p>
        <p className="font-mono text-xl text-cyan mt-2">
          Steve didn&apos;t spot any deadlines in that file. Try a syllabus with a
          schedule/dates, or add events manually.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-pixel text-[11px] text-amber">{group.label.toUpperCase()}</h3>
            <div className="flex-1 border-t-3 border-dashed border-ink/40" />
          </div>

          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {group.items.map((e) => {
                const lowConf = e.confidence < 0.7
                return (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    className={`retro-panel noise flex items-center gap-3 p-3 sm:p-4 shadow-chunk
                      ${e.approved ? 'ring-3 ring-lime' : ''}`}
                  >
                    {/* approve toggle */}
                    <button
                      onClick={() => onToggleApprove(e.id)}
                      aria-label={e.approved ? 'Un-approve' : 'Approve'}
                      className={`shrink-0 w-9 h-9 grid place-items-center border-3 border-ink
                        transition-colors ${e.approved ? 'bg-lime' : 'bg-void hover:bg-dusk'}`}
                    >
                      {e.approved && <Check size={18} className="text-ink" strokeWidth={3} />}
                    </button>

                    {/* main */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-body font-bold text-beige truncate">{e.title}</span>
                        {lowConf && (
                          <span
                            className="inline-flex items-center gap-1 text-amber font-mono text-base"
                            title={`Low confidence (${Math.round(e.confidence * 100)}%) — double-check this one`}
                          >
                            <AlertCircle size={14} /> check me
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 font-mono text-lg text-beige/60">
                        <span className="text-cyan">{e.course}</span>
                        <span className="flex items-center gap-1">
                          <Clock size={13} /> {fmtTime(e.due, e.allDay)}
                        </span>
                      </div>
                    </div>

                    <TypeBadge type={e.type} label={e.label} size="sm" />

                    <button
                      onClick={() => onEdit(e)}
                      className="shrink-0 w-9 h-9 grid place-items-center border-3 border-ink
                        bg-void hover:bg-cyan hover:text-ink text-cyan transition-colors"
                      aria-label="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  )
}
