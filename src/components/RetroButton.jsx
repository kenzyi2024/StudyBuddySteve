import { motion } from 'framer-motion'

/**
 * RetroButton — a chunky arcade / mechanical-keyboard style button.
 * It physically "presses in" (offset toward its shadow) on tap, so the
 * hard drop-shadow collapses like a real key bottoming out.
 *
 * Props:
 *   color   — 'magenta' | 'cyan' | 'lime' | 'amber' | 'grape' (default magenta)
 *   as      — render element ('button' | 'a'), default 'button'
 *   size    — 'sm' | 'md' | 'lg'
 */
const COLORS = {
  magenta: 'bg-magenta text-ink',
  cyan: 'bg-cyan text-ink',
  lime: 'bg-lime text-ink',
  amber: 'bg-amber text-ink',
  grape: 'bg-grape text-beige',
  beige: 'bg-beige text-ink',
}

const SIZES = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
}

export default function RetroButton({
  children,
  color = 'magenta',
  size = 'md',
  as = 'button',
  className = '',
  ...props
}) {
  const MotionTag = motion[as] || motion.button

  return (
    <MotionTag
      // Rest state: chunky offset shadow (the "un-pressed" key)
      initial={{ boxShadow: '6px 6px 0 0 #0a0812', x: 0, y: 0 }}
      whileHover={{
        boxShadow: '8px 8px 0 0 #0a0812',
        x: -1,
        y: -1,
      }}
      // Press: collapse into the shadow like a mechanical key bottoming out
      whileTap={{
        boxShadow: '0px 0px 0 0 #0a0812',
        x: 6,
        y: 6,
        transition: { duration: 0.04 },
      }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      className={`inline-flex items-center justify-center gap-2 select-none
        border-3 border-ink font-pixel uppercase tracking-wide
        cursor-pointer active:cursor-progress
        ${COLORS[color]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </MotionTag>
  )
}
