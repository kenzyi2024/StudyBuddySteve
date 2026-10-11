import { motion } from 'framer-motion'

/**
 * PixelWipe — a classic video-game screen transition made of chunky
 * color blocks that sweep across and then clear, revealing the next screen.
 * Render it (mounted) while `active` is true.
 */
const COLS = 12
const ROWS = 8
const PALETTE = ['#ff2e97', '#22e0ff', '#b8ff2e', '#ffb020', '#7b2ff7']

// Hard "pixel" steps between keyframes: hold, then jump at the end of each
// segment. (framer-motion doesn't accept CSS easing strings like 'steps(1)' —
// it throws, which used to crash the app on every screen transition.)
const stepEase = (t: number) => (t >= 1 ? 1 : 0)

export default function PixelWipe({ onFinished }: { onFinished?: () => void }) {
  const blocks = Array.from({ length: COLS * ROWS })

  return (
    <motion.div
      className="fixed inset-0 z-[100] pointer-events-none grid"
      style={{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {blocks.map((_, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        // diagonal sweep delay
        const delay = (col + row) * 0.025
        // The bottom-right block starts last, so its end is the end of the wipe.
        // (The container has no animation of its own, so its
        // onAnimationComplete would never fire.)
        const isLast = i === COLS * ROWS - 1
        return (
          <motion.div
            key={i}
            onAnimationComplete={isLast ? onFinished : undefined}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1, 1, 0] }}
            transition={{
              duration: 1.1,
              delay,
              times: [0, 0.3, 0.6, 1],
              ease: stepEase,
            }}
            style={{ backgroundColor: PALETTE[(col + row) % PALETTE.length] }}
          />
        )
      })}
    </motion.div>
  )
}
