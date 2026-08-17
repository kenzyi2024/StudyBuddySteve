import { FileText, AlertTriangle, HelpCircle, BookOpen, Star } from 'lucide-react'
import { typeMeta } from '../../data/events.js'

const ICONS = { FileText, AlertTriangle, HelpCircle, BookOpen, Star }

/** Small chunky pill showing an event's type with its retro color + icon. */
export default function TypeBadge({ type, size = 'md' }) {
  const meta = typeMeta(type)
  const Icon = ICONS[meta.icon] || Star
  const pad = size === 'sm' ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1.5 text-[10px]'
  const iconSize = size === 'sm' ? 12 : 14
  return (
    <span
      className={`inline-flex items-center gap-1 border-3 border-ink font-pixel
        uppercase text-ink bg-${meta.color} ${pad}`}
    >
      <Icon size={iconSize} strokeWidth={2.5} />
      {meta.label}
    </span>
  )
}
