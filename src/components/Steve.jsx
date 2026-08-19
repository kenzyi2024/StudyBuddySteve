import { motion } from 'framer-motion'

/**
 * Steve — the mascot. A chunky 8-bit CRT computer-monitor character drawn
 * as inline SVG "pixels" so he stays crisp and easily animatable.
 *
 * Props:
 *   mood — 'idle' | 'happy' | 'eating' | 'scanning' | 'done'
 *   size — pixel width (height scales)
 */
export default function Steve({ mood = 'idle', size = 220 }) {
  const safeMood = ['idle', 'happy', 'eating', 'scanning', 'done'].includes(mood)
    ? mood
    : 'idle'

  // Eyes change shape with mood. Values are always defined (fixes the SVG
  // "undefined" attribute warnings from animating bare attributes).
  const eyes = {
    idle: { ry: 10, cy: 46 },
    happy: { ry: 4, cy: 48 },
    eating: { ry: 12, cy: 44 },
    scanning: { ry: 2, cy: 48 },
    done: { ry: 4, cy: 48 },
  }[safeMood]

  const mouth = {
    idle: 'M 44 66 Q 60 72 76 66',
    happy: 'M 42 64 Q 60 82 78 64',
    eating: 'M 44 60 Q 60 88 76 60 Q 60 74 44 60', // open, chomping
    scanning: 'M 46 68 L 74 68',
    done: 'M 42 64 Q 60 82 78 64',
  }[safeMood]

  const screenGlow = mood === 'scanning' ? '#22e0ff' : mood === 'done' ? '#b8ff2e' : '#4dffb8'

  return (
    <motion.div
      className="relative inline-block"
      style={{ width: size }}
      animate={mood === 'idle' || mood === 'happy' ? { y: [0, -8, 0] } : { y: 0 }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg
        data-pixel
        viewBox="0 0 120 130"
        width={size}
        className="drop-shadow-[8px_8px_0_#0a0812]"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* legs */}
        <rect x="34" y="112" width="12" height="14" fill="#0a0812" />
        <rect x="74" y="112" width="12" height="14" fill="#0a0812" />

        {/* monitor body */}
        <rect x="10" y="14" width="100" height="100" rx="6" fill="#e8e0c8" stroke="#0a0812" strokeWidth="5" />
        {/* inner screen */}
        <rect x="24" y="30" width="72" height="58" rx="3" fill="#0d0b1f" stroke="#0a0812" strokeWidth="4" />

        {/* animated phosphor screen glow */}
        <motion.rect
          x="24" y="30" width="72" height="58" rx="3"
          fill={screenGlow}
          animate={{ opacity: mood === 'idle' ? [0.06, 0.14, 0.06] : [0.12, 0.28, 0.12] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />

        {/* scanning laser bar */}
        {safeMood === 'scanning' && (
          <motion.rect
            x="24" width="72" height="4" fill="#22e0ff"
            initial={{ y: 30 }}
            animate={{ y: [30, 84, 30] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* face on the screen — static per-mood values with a CSS transition
            for smoothness. (Animating SVG attributes via Framer directly can
            emit "undefined" intermediate values, so we avoid that here.) */}
        <g style={{ transition: 'all 0.25s ease' }}>
          <ellipse
            cx="46" rx="8" ry={eyes.ry} cy={eyes.cy} fill="#4dffb8"
            style={{ transition: 'ry 0.2s ease, cy 0.2s ease' }}
          />
          <ellipse
            cx="74" rx="8" ry={eyes.ry} cy={eyes.cy} fill="#4dffb8"
            style={{ transition: 'ry 0.2s ease, cy 0.2s ease' }}
          />
          <path
            d={mouth}
            fill={safeMood === 'eating' ? '#ff2e97' : 'none'}
            stroke="#4dffb8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* power LED */}
        <motion.circle
          cx="98" cy="104" r="3"
          fill="#ff2e97"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        {/* base / neck */}
        <rect x="46" y="114" width="28" height="6" fill="#0a0812" />
      </svg>
    </motion.div>
  )
}
