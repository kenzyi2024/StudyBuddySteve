import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarPlus, Download, Link2, Check } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'

/**
 * SyncBar — the "ship it" strip. Google / Outlook OAuth + universal .ics.
 * Sync is gated on having at least one approved event. The handlers here are
 * stubs that show a confirmation toast; wire them to the gateway endpoints:
 *   POST /api/courses/:id/sync/google
 *   POST /api/courses/:id/sync/outlook
 *   GET  /api/courses/:id/calendar.ics
 */
export default function SyncBar({ approvedCount, totalCount }) {
  const [toast, setToast] = useState(null)
  const ready = approvedCount > 0

  const fire = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  return (
    <div className="crt retro-panel noise p-4 sm:p-5 shadow-chunk-cyan">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
        <div>
          <h3 className="font-pixel text-xs sm:text-sm text-beige">SYNC YOUR SEMESTER</h3>
          <p className="font-mono text-lg text-cyan mt-1">
            {approvedCount} of {totalCount} events approved
            {!ready && ' · approve at least one to sync'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <RetroButton
            color="magenta"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={() => fire('▸ Google OAuth flow would open here')}
          >
            <CalendarPlus size={16} /> Google
          </RetroButton>
          <RetroButton
            color="cyan"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={() => fire('▸ Outlook / Microsoft Graph flow would open here')}
          >
            <CalendarPlus size={16} /> Outlook
          </RetroButton>
          <RetroButton
            color="lime"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={() => fire('▸ calendar.ics downloaded')}
          >
            <Download size={16} /> .ics
          </RetroButton>
          <RetroButton
            color="amber"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={() => fire('▸ subscription URL copied to clipboard')}
          >
            <Link2 size={16} /> Subscribe
          </RetroButton>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center gap-2 bg-lime text-ink border-3 border-ink px-3 py-2 font-mono text-lg shadow-chunk"
          >
            <Check size={18} strokeWidth={3} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
