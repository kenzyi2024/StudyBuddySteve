import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, BellRing, Smartphone, CalendarClock, Check, Download, ExternalLink, Copy, Mail, Clock } from 'lucide-react'
import RetroButton from '../RetroButton.jsx'
import Steve from '../Steve.jsx'
import {
  reminderStatus,
  getPushKey,
  subscribePush,
  unsubscribePush,
  saveReminderPrefs,
  myCalendarIcsUrl,
} from '../../lib/api.js'

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Turn the (possibly relative) ics path into an absolute URL a calendar service
// can fetch.
function absoluteIcs() {
  return new URL(myCalendarIcsUrl(), window.location.origin).href
}

// Retro on/off switch.
function Toggle({ on, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`w-16 h-8 border-3 border-ink relative transition-colors shrink-0
        ${on ? 'bg-lime' : 'bg-void'} ${disabled ? 'opacity-40' : ''}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={`absolute top-0.5 w-6 h-6 border-2 border-ink ${on ? 'right-0.5 bg-ink' : 'left-0.5 bg-beige'}`}
      />
    </button>
  )
}

/**
 * RemindersModal — every reminder channel in one place:
 *   1. Device notifications (Web Push) — toggle on/off
 *   2. Text messages (SMS) — set up your number + opt-in here
 *   3. Calendar app — one-tap Google, or subscribe/download for Apple/Outlook
 */
export default function RemindersModal({ open, onClose, user }) {
  return <AnimatePresence>{open && <Inner onClose={onClose} user={user} />}</AnimatePresence>
}

function Inner({ onClose, user }) {
  const [server, setServer] = useState({ push: false, sms: false })
  const [pushState, setPushState] = useState('off') // on | off | denied | unsupported | working
  const [phone, setPhone] = useState(user?.phone || '')
  const [smsOn, setSmsOn] = useState(!!user?.smsEnabled)
  const [emailOn, setEmailOn] = useState(!!user?.emailReminders)
  const [lead, setLead] = useState(user?.reminderLead || 24)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    reminderStatus().then(setServer)
    ;(async () => {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return setPushState('unsupported')
      if (Notification.permission === 'denied') return setPushState('denied')
      if (Notification.permission !== 'granted') return setPushState('off')
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = reg ? await reg.pushManager.getSubscription() : null
        setPushState(sub ? 'on' : 'off')
      } catch {
        setPushState('off')
      }
    })()
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
      return flash('Notifications are blocked. Turn them on in your browser settings, then try again.')
    }
    if (perm !== 'granted') return setPushState('off')
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
          return flash('Device alerts on! Deadline pop-ups even when the app is closed.')
        }
      }
      setPushState('on')
      flash('In-app alerts on. (Background push isn’t configured by the app owner yet.)')
    } catch {
      setPushState('on')
      flash('Notifications allowed, but background push couldn’t register.')
    }
  }

  const disablePush = async () => {
    setPushState('working')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await unsubscribePush(sub.endpoint)
        await sub.unsubscribe()
      }
    } catch {
      /* ignore */
    }
    setPushState('off')
    flash('Device alerts off for this device.')
  }

  const togglePush = () => {
    if (pushState === 'working' || pushState === 'unsupported') return
    if (pushState === 'denied') return flash('Notifications are blocked in your browser settings — enable them there first.')
    pushState === 'on' ? disablePush() : enablePush()
  }

  // Persist all reminder prefs together (channels + lead time). `over` lets a
  // control pass its new value without waiting for state to settle.
  const persist = async (over = {}) => {
    try {
      await saveReminderPrefs({
        phone,
        smsEnabled: smsOn,
        emailReminders: emailOn,
        reminderLead: lead,
        ...over,
      })
      return true
    } catch (e) {
      flash(e.message || 'Could not save — check the phone format (+15551234567).')
      return false
    }
  }

  const saveSms = async () => {
    if (await persist()) flash(smsOn ? 'Text reminders saved!' : 'Text reminders turned off.')
  }

  const chooseLead = async (v) => {
    setLead(v)
    if (await persist({ reminderLead: v })) flash('Reminder timing updated.')
  }

  const toggleEmail = async (v) => {
    setEmailOn(v)
    if (await persist({ emailReminders: v })) flash(v ? 'Email reminders on.' : 'Email reminders off.')
  }

  const LEADS = [
    [24, '1 day'],
    [48, '2 days'],
    [72, '3 days'],
    [168, '1 week'],
  ]

  const downloadIcs = () => {
    const a = document.createElement('a')
    a.href = myCalendarIcsUrl()
    a.download = 'my-semester.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const addToGoogle = () => {
    const url = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(absoluteIcs())}`
    window.open(url, '_blank', 'noopener')
  }
  const copySubscribe = async () => {
    const webcal = absoluteIcs().replace(/^https?:/, 'webcal:')
    try {
      await navigator.clipboard.writeText(webcal)
      flash('Subscribe link copied — paste into Apple/Outlook “Add calendar → From URL”.')
    } catch {
      flash(webcal)
    }
  }

  const field =
    'w-full bg-void border-3 border-ink text-beige font-mono text-xl px-3 py-2 focus:outline-none focus:border-cyan'

  const pushHint = {
    denied: ' You blocked notifications — re-enable them in your browser settings.',
    unsupported: ' This browser doesn’t support it (on iPhone: Share → Add to Home Screen first).',
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

        {/* lead time — applies to every channel */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={18} className="text-amber" />
            <span className="font-pixel text-[11px] text-beige">REMIND ME</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {LEADS.map(([v, label]) => (
              <button
                key={v}
                onClick={() => chooseLead(v)}
                className={`px-3 py-1.5 border-3 border-ink font-mono text-base transition-colors
                  ${lead === v ? 'bg-amber text-ink' : 'bg-void text-beige/70 hover:bg-dusk'}`}
              >
                {label} before
              </button>
            ))}
          </div>
        </div>

        {/* 1. device notifications — toggle */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BellRing size={18} className="text-cyan" />
              <span className="font-pixel text-[11px] text-beige">DEVICE ALERTS</span>
            </div>
            <Toggle
              on={pushState === 'on'}
              disabled={pushState === 'unsupported' || pushState === 'working'}
              onClick={togglePush}
            />
          </div>
          <p className="font-mono text-base text-beige/60 mt-2">
            Pop-up notifications on this device, even when the app is closed.{pushHint}
          </p>
        </div>

        {/* 2. email — reliable everywhere, incl. iOS */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-lime" />
              <span className="font-pixel text-[11px] text-beige">EMAIL</span>
            </div>
            <Toggle on={emailOn} disabled={!server.email} onClick={() => toggleEmail(!emailOn)} />
          </div>
          <p className="font-mono text-base text-beige/60 mt-2">
            {server.email
              ? `Deadline digests to ${user?.email || 'your inbox'} — works on any device.`
              : 'Email isn’t set up by the app owner yet (needs an SMTP sender).'}
          </p>
        </div>

        {/* 3. text messages — always set up here */}
        <div className="border-3 border-ink bg-void p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={18} className="text-magenta" />
            <span className="font-pixel text-[11px] text-beige">TEXT MESSAGES</span>
          </div>
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
          {!server.sms && (
            <p className="font-mono text-base text-amber/80 mt-2">
              Save your number now — texts start once SMS is switched on for the app.
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <RetroButton color="lime" size="sm" onClick={saveSms}>
              <Check size={14} /> Save
            </RetroButton>
          </div>
        </div>

        {/* 3. calendar app — one-tap Google + subscribe/download */}
        <div className="border-3 border-ink bg-void p-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock size={18} className="text-lime" />
            <span className="font-pixel text-[11px] text-beige">CALENDAR APP</span>
          </div>
          <p className="font-mono text-base text-beige/60 mb-3">
            Sync your semester so your calendar fires its own native reminders
            (every deadline has an alarm).
          </p>
          <div className="flex flex-wrap gap-2">
            <RetroButton color="cyan" size="sm" onClick={addToGoogle}>
              <ExternalLink size={14} /> Add to Google
            </RetroButton>
            <RetroButton color="amber" size="sm" onClick={copySubscribe}>
              <Copy size={14} /> Apple / Outlook link
            </RetroButton>
            <RetroButton color="lime" size="sm" onClick={downloadIcs}>
              <Download size={14} /> .ics
            </RetroButton>
          </div>
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
