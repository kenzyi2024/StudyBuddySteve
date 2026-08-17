import { motion } from 'framer-motion'

/**
 * PixelWipe — a classic video-game screen transition made of chunky
 * color blocks that sweep across and then clear, revealing the next screen.
 * Render it (mounted) while `active` is true.
 */
const COLS = 12
const ROWS = 8
const PALETTE = ['#ff2e97', '#22e0ff', '#b8ff2e', '#ffb020', '#7b2ff7']

export default function PixelWipe({ onFinished }) {
  const blocks = Array.from({ length: COLS * ROWS })

  return (
    <motion.div
      className="fixed inset-0 z-[100] pointer-events-none grid"
      style={{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
      onAnimationComplete={onFinished}
    >
      {blocks.map((_, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        // diagonal sweep delay
        const delay = (col + row) * 0.025
        return (
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1, 1, 0] }}
            transition={{
              duration: 1.1,
              delay,
              times: [0, 0.3, 0.6, 1],
              ease: 'steps(1)',
            }}
            style={{ backgroundColor: PALETTE[(col + row) % PALETTE.length] }}
          />
        )
      })}
    </motion.div>
  )
}
