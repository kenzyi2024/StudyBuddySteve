import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ToastContext } from '../lib/toast'
import type { ToastApi } from '../lib/toast'

/**
 * App-wide toasts, so saves/deletes that fail on the server are visible
 * instead of silently diverging from what the UI shows.
 *
 *   const toast = useToast()
 *   toast.error('Couldn’t save that change')
 *   toast.ok('Added 12 events')
 */
type Kind = 'ok' | 'error'
interface Toast {
  id: number
  kind: Kind
  text: string
}

const DURATION_MS = { ok: 3200, error: 6000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = nextId.current++
      // Drop an identical message already on screen (e.g. several failed saves).
      setToasts((t) => [...t.filter((x) => x.text !== text), { id, kind, text }].slice(-3))
      setTimeout(() => dismiss(id), DURATION_MS[kind])
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({ ok: (t) => push('ok', t), error: (t) => push('error', t) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed top-4 inset-x-0 z-[120] flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`pointer-events-auto max-w-md w-full flex items-start gap-3 border-3 border-ink shadow-chunk px-4 py-2
                font-mono text-lg text-ink ${t.kind === 'error' ? 'bg-magenta' : 'bg-lime'}`}
            >
              <span className="flex-1">
                {t.kind === 'error' ? '! ' : '▸ '}
                {t.text}
              </span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="font-pixel text-xs mt-1">
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
