import {
  BookOpen,
  PencilLine,
  HelpCircle,
  AlertTriangle,
  FolderGit2,
  Coffee,
  Star,
} from 'lucide-react'
import { typeMeta } from '../../data/events'
import type { EventType } from '../../types'

const ICONS: Record<string, typeof Star> = {
  BookOpen,
  PencilLine,
  HelpCircle,
  AlertTriangle,
  FolderGit2,
  Coffee,
  Star,
}

/** Small chunky pill showing an event's type with its retro color + icon.
 *  For the "other" type, a custom `label` (if provided) replaces "Other".
 *  `compact`: on phones show just the colored icon (the label stays readable
 *  by screen readers); full pill from `sm` up. */
export default function TypeBadge({
  type,
  label,
  size = 'md',
  compact = false,
}: {
  type: EventType
  label?: string
  size?: 'sm' | 'md'
  compact?: boolean
}) {
  const meta = typeMeta(type)
  const Icon = ICONS[meta.icon] || Star
  const pad = size === 'sm' ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1.5 text-[10px]'
  const iconSize = size === 'sm' ? 12 : 14
  const text = type === 'other' && label ? label : meta.label
  return (
    <span
      className={`inline-flex items-center gap-1 border-3 border-ink font-pixel
        uppercase text-ink bg-${meta.color} ${pad}`}
      title={text}
    >
      <Icon size={iconSize} strokeWidth={2.5} />
      <span className={compact ? 'sr-only sm:not-sr-only' : undefined}>{text}</span>
    </span>
  )
}
