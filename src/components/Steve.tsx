import { motion } from 'framer-motion'

/**
 * Steve — the mascot, using the custom pixel-art sprite frames in /public/steve.
 * Each mood maps to a frame. The container bobs gently; a scanline sweeps for
 * the "scanning" mood.
 *
 * Props:
 *   mood — 'idle' | 'happy' | 'eating' | 'scanning' | 'done' | 'reading' | 'think'
 *   size — pixel width (height scales with the art's aspect ratio)
 */
const FRAME = {
  idle: '/steve/5.png', // neutral smile
  happy: '/steve/2.png', // waving hello
  eating: '/steve/7.png', // holding a pencil (working)
  scanning: '/steve/6.png', // focused / surprised
  reading: '/steve/8.png', // reading a book
  think: '/steve/12.png', // arms crossed
  done: '/steve/11.png', // holding a trophy
  celebrate: '/steve/9.png', // cheering
}

const ASPECT = 352 / 334 // native frame height / width

export default function Steve({ mood = 'idle', size = 220 }) {
  const src = FRAME[mood] || FRAME.idle
  const bob = mood === 'idle' || mood === 'happy' || mood === 'done'

  return (
    <motion.div
      className="relative inline-block"
      style={{ width: size, height: size * ASPECT }}
      animate={bob ? { y: [0, -8, 0] } : { y: 0 }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <img
        src={src}
        alt="Steve the study robot"
        data-pixel
        width={size}
        className="block w-full h-full object-contain drop-shadow-[6px_6px_0_#0a0812]"
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />

      {/* laser scanline sweep for the scanning mood */}
      {mood === 'scanning' && (
        <motion.div
          className="pointer-events-none absolute left-0 right-0 h-2"
          style={{
            background:
              'linear-gradient(to bottom, transparent, #22e0ff, transparent)',
            boxShadow: '0 0 12px #22e0ff',
          }}
          initial={{ top: '10%' }}
          animate={{ top: ['10%', '85%', '10%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </motion.div>
  )
}
