import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Upload, Link2, GraduationCap, RefreshCw, Check } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import Steve from '../Steve.jsx'
import {
  importIcsFile,
  importIcsUrl,
  importCanvas,
  canvasStatus,
  syncCanvas,
  disconnectCanvas,
} from '../../lib/api.js'

// "2 minutes ago" style relative time.
function ago(iso) {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * ImportModal — bring events in from another calendar.
 *   • Upload an .ics export (Google / Apple / Outlook)
 *   • Paste any calendar feed URL
 *   • Connect a Canvas calendar feed (assignments + tasks)
 * Calls onImported() so the home can refresh.
 */
export default function ImportModal({ open, onClose, onImported }) {
  return <AnimatePresence>{open && <Inner onClose={onClose} onImported={onImported} />}</AnimatePresence>
}

function Inner({ onClose, onImported }) {
  const fileRef = useRef(null)
  const [url, setUrl] = useState('')
  const [canvas, setCanvas] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [status, setStatus] = useState({ connected: false, lastSync: null })

  useEffect(() => {
    canvasStatus().then(setStatus)
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fn()
      setMsg({
        ok: true,
        text: `Imported ${r.imported} item${r.imported === 1 ? '' : 's'}${
          r.skipped ? ` (${r.skipped} already there)` : ''
        } from ${r.course}.`,
      })
      if (r.source === 'canvas' || r.lastSync) {
        setStatus({ connected: true, lastSync: r.lastSync || new Date().toISOString() })
      }
      onImported?.()
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Import failed. Check the file or URL.' })
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full bg-void border-3 border-ink text-beige font-mono text-lg px-3 py-2 focus:outline-none focus:border-cyan'

  return (
    <motion.div
      className="fixed inset-0 z-[95] grid place-items-center p-4 bg-ink/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="crt retro-panel noise w-full max-w-md p-6 shadow-chunk-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9">
              <Steve mood="eating" size={36} />
            </div>
            <h3 className="font-pixel text-sm text-beige">IMPORT CALENDAR</h3>
          </div>
          <button onClick={onClose} className="text-magenta hover:text-lime" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* Canvas */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap size={18} className="text-magenta" />
            <span className="font-pixel text-[11px] text-beige">CANVAS</span>
          </div>

          {status.connected && (
            <div className="bg-void border-3 border-ink p-2 mb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-base text-lime flex items-center gap-1.5">
                  <Check size={15} /> Connected · synced {ago(status.lastSync)}
                </span>
                <RetroButton color="cyan" size="sm" disabled={busy} onClick={() => run(() => syncCanvas())}>
                  <RefreshCw size={13} /> Sync now
                </RetroButton>
              </div>
              <button
                onClick={async () => {
                  if (!window.confirm('Disconnect Canvas? Auto-sync stops; your imported events stay.')) return
                  setBusy(true)
                  try {
                    await disconnectCanvas()
                    setStatus({ connected: false, lastSync: null })
                    setMsg({ ok: true, text: 'Canvas disconnected. Auto-sync is off.' })
                  } catch (e) {
                    setMsg({ ok: false, text: e.message || 'Could not disconnect.' })
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                className="font-mono text-base text-magenta hover:text-lime underline decoration-dashed underline-offset-4 mt-2"
              >
                Disconnect Canvas
              </button>
            </div>
          )}

          <p className="font-mono text-base text-beige/60 mb-2">
            In Canvas: <span className="text-cyan">Calendar → Calendar Feed</span> (bottom-right),
            copy the URL, and paste it here. Brings in your assignments &amp; due dates.
          </p>
          <input
            className={field}
            value={canvas}
            placeholder="https://canvas.…/feeds/calendars/user_….ics"
            onChange={(e) => setCanvas(e.target.value)}
          />
          <p className="font-mono text-base text-lime/80 mt-2">
            ▸ Once connected, new assignments sync in automatically every day.
          </p>
          <div className="mt-2 flex justify-end">
            <RetroButton color="magenta" size="sm" disabled={busy || !canvas} onClick={() => run(() => importCanvas(canvas))}>
              Connect Canvas
            </RetroButton>
          </div>
        </div>

        {/* URL */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={18} className="text-cyan" />
            <span className="font-pixel text-[11px] text-beige">CALENDAR LINK</span>
          </div>
          <p className="font-mono text-base text-beige/60 mb-2">
            Any calendar’s subscribe/feed URL (Google “secret address in iCal format”, etc.).
          </p>
          <input
            className={field}
            value={url}
            placeholder="https://… .ics  or  webcal://…"
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <RetroButton color="cyan" size="sm" disabled={busy || !url} onClick={() => run(() => importIcsUrl(url))}>
              Import URL
            </RetroButton>
          </div>
        </div>

        {/* File */}
        <div className="border-3 border-ink bg-void p-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={18} className="text-lime" />
            <span className="font-pixel text-[11px] text-beige">.ICS FILE</span>
          </div>
          <p className="font-mono text-base text-beige/60 mb-2">
            Exported a calendar from Google / Apple / Outlook? Upload the file.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) run(() => importIcsFile(f))
            }}
          />
          <div className="flex justify-end">
            <RetroButton color="lime" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              Choose .ics
            </RetroButton>
          </div>
        </div>

        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-4 border-3 border-ink px-3 py-2 font-mono text-lg shadow-chunk ${
                msg.ok ? 'bg-lime text-ink' : 'bg-magenta text-ink'
              }`}
            >
              ▸ {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {busy && <p className="font-mono text-lg text-cyan mt-3 text-center animate-flicker">Steve is importing…</p>}
      </motion.div>
    </motion.div>
  )
}
