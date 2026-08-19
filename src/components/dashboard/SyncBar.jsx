import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarPlus, Download, Link2, Check } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import { oauthStartUrl } from '../../lib/api.js'

/**
 * SyncBar — the "ship it" strip. Google / Outlook OAuth + universal .ics.
 * Sync is gated on having at least one approved event.
 *
 * OAuth is a full-page redirect: clicking Google/Outlook sends the browser to
 * the gateway's /api/oauth/:provider, which bounces to the provider, then back
 * to the frontend with ?synced=<provider>&status=ok&count=N — which we toast.
 */
export default function SyncBar({ courseId, approvedCount, totalCount, icsUrl }) {
  const [toast, setToast] = useState(null)
  const ready = approvedCount > 0

  const fire = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  // On return from an OAuth redirect, surface the outcome and clean the URL.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const synced = q.get('synced')
    if (!synced) return
    const status = q.get('status')
    const count = q.get('count')
    const name = synced === 'google' ? 'Google Calendar' : 'Outlook'
    const messages = {
      ok: `▸ Synced ${count || 0} event${count === '1' ? '' : 's'} to ${name}!`,
      denied: `▸ ${name} access was declined`,
      error: `▸ ${name} sync hit an error — try again`,
      bad_state: `▸ ${name} session expired — try again`,
    }
    fire(messages[status] || `▸ ${name}: ${status}`)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const connect = (provider, label) => {
    if (courseId) {
      window.location.href = oauthStartUrl(provider, courseId)
    } else {
      fire(`▸ ${label} needs the backend running (connect a real syllabus first)`)
    }
  }

  // Download the approved-events .ics from the gateway. When offline (no
  // icsUrl), just show the confirmation toast so the demo still responds.
  const downloadIcs = () => {
    if (icsUrl) {
      const a = document.createElement('a')
      a.href = icsUrl
      a.download = 'calendar.ics'
      document.body.appendChild(a)
      a.click()
      a.remove()
      fire('▸ calendar.ics downloaded')
    } else {
      fire('▸ .ics ready (connect the backend to download)')
    }
  }

  const copySubscribe = async () => {
    if (icsUrl) {
      const url = new URL(icsUrl, window.location.origin).href
      try {
        await navigator.clipboard.writeText(url)
        fire('▸ subscription URL copied')
      } catch {
        fire(`▸ subscribe at ${url}`)
      }
    } else {
      fire('▸ subscription URL copied to clipboard')
    }
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
            onClick={() => connect('google', 'Google')}
          >
            <CalendarPlus size={16} /> Google
          </RetroButton>
          <RetroButton
            color="cyan"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={() => connect('outlook', 'Outlook')}
          >
            <CalendarPlus size={16} /> Outlook
          </RetroButton>
          <RetroButton
            color="lime"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={downloadIcs}
          >
            <Download size={16} /> .ics
          </RetroButton>
          <RetroButton
            color="amber"
            size="sm"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4 }}
            onClick={copySubscribe}
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
