import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, BellRing, Smartphone, CalendarClock, Check, Download } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import Steve from '../Steve.jsx'
import {
  reminderStatus,
  getPushKey,
  subscribePush,
  saveReminderPrefs,
  myCalendarIcsUrl,
} from '../../lib/api.js'

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/**
 * RemindersModal — one place to turn on every reminder channel:
 *   1. Device notifications (Web Push, works when the app is closed)
 *   2. Text messages (SMS, if the app owner configured Twilio)
 *   3. Calendar app (download/subscribe .ics → native reminders)
 */
export default function RemindersModal({ open, onClose, user }) {
  return (
    <AnimatePresence>{open && <Inner onClose={onClose} user={user} />}</AnimatePresence>
  )
}

function Inner({ onClose, user }) {
  const [server, setServer] = useState({ push: false, sms: false })
  const [pushState, setPushState] = useState('unknown') // on | off | denied | unsupported | working
  const [phone, setPhone] = useState(user?.phone || '')
  const [smsOn, setSmsOn] = useState(!!user?.smsEnabled)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    reminderStatus().then(setServer)
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      setPushState('unsupported')
    } else if (Notification.permission === 'granted') {
      setPushState('on')
    } else if (Notification.permission === 'denied') {
      setPushState('denied')
    } else {
      setPushState('off')
    }
  }, [])

  const flash = (t) => {
    setMsg(t)
    setTimeout(() => setMsg(null), 3500)
  }

  const enablePush = async () => {
    if (typeof Notification === 'undefined') return setPushState('unsupported')
    setPushState('working')
    const perm = await Notification.requestPermission()
    if (perm === 'denied') {
      setPushState('denied')
      return flash('Notifications are blocked. Enable them in your browser settings, then try again.')
    }
    if (perm !== 'granted') return setPushState('off')
    // permission granted — try to register for background push
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const { key } = await getPushKey()
        if (key) {
          const reg = await navigator.serviceWorker.register('/sw.js')
          await navigator.serviceWorker.ready
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(key),
          })
          await subscribePush(sub)
          setPushState('on')
          return flash('Device notifications on! You’ll get deadline alerts even when the app is closed.')
        }
      }
      setPushState('on')
      flash('In-app notifications on. (Background push isn’t configured by the app owner yet.)')
    } catch {
      setPushState('on')
      flash('Notifications allowed, but background push failed to register.')
    }
  }

  const saveSms = async () => {
    try {
      await saveReminderPrefs({ phone, smsEnabled: smsOn })
      flash(smsOn ? 'Text reminders saved!' : 'Text reminders turned off.')
    } catch (e) {
      flash(e.message || 'Could not save — check the number format (+15551234567).')
    }
  }

  const downloadIcs = () => {
    const a = document.createElement('a')
    a.href = myCalendarIcsUrl()
    a.download = 'my-semester.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const field =
    'w-full bg-void border-3 border-ink text-beige font-mono text-xl px-3 py-2 focus:outline-none focus:border-cyan'

  const pushLabel = {
    on: '● On',
    off: 'Enable',
    denied: 'Blocked',
    unsupported: 'Not supported',
    working: 'Working…',
    unknown: 'Enable',
  }[pushState]

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
              <Steve mood="happy" size={36} />
            </div>
            <h3 className="font-pixel text-sm text-beige">REMINDERS</h3>
          </div>
          <button onClick={onClose} className="text-magenta hover:text-lime" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* 1. device notifications */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BellRing size={18} className="text-cyan" />
              <span className="font-pixel text-[11px] text-beige">DEVICE ALERTS</span>
            </div>
            <RetroButton
              color={pushState === 'on' ? 'lime' : 'cyan'}
              size="sm"
              disabled={pushState === 'on' || pushState === 'unsupported' || pushState === 'working'}
              onClick={enablePush}
            >
              {pushLabel}
            </RetroButton>
          </div>
          <p className="font-mono text-base text-beige/60 mt-2">
            Pop-up notifications on this device, even when the app is closed.
            {pushState === 'denied' && ' You blocked them — re-enable in browser settings.'}
            {pushState === 'unsupported' && ' This browser doesn’t support it (iOS: Add to Home Screen first).'}
          </p>
        </div>

        {/* 2. text messages */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={18} className="text-magenta" />
            <span className="font-pixel text-[11px] text-beige">TEXT MESSAGES</span>
          </div>
          {server.sms ? (
            <>
              <input
                className={field}
                value={phone}
                placeholder="+1 555 123 4567"
                onChange={(e) => setPhone(e.target.value)}
              />
              <label className="flex items-center gap-2 font-mono text-lg text-beige mt-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={smsOn}
                  onChange={(e) => setSmsOn(e.target.checked)}
                  className="w-5 h-5 accent-magenta"
                />
                Text me deadlines due within a day
              </label>
              <div className="mt-3 flex justify-end">
                <RetroButton color="lime" size="sm" onClick={saveSms}>
                  <Check size={14} /> Save
                </RetroButton>
              </div>
            </>
          ) : (
            <p className="font-mono text-base text-beige/50">
              SMS isn’t set up by the app owner yet (needs a Twilio number). Device
              alerts and calendar reminders below work now.
            </p>
          )}
        </div>

        {/* 3. calendar app */}
        <div className="border-3 border-ink bg-void p-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock size={18} className="text-lime" />
            <span className="font-pixel text-[11px] text-beige">CALENDAR APP</span>
          </div>
          <p className="font-mono text-base text-beige/60 mb-3">
            Add your semester to Apple / Google / Outlook Calendar — they’ll fire
            their own native reminders (each deadline includes an alarm).
          </p>
          <RetroButton color="lime" size="sm" onClick={downloadIcs}>
            <Download size={14} /> Download .ics
          </RetroButton>
        </div>

        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 bg-lime text-ink border-3 border-ink px-3 py-2 font-mono text-lg shadow-chunk"
            >
              ▸ {msg}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
