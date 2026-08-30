import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Steve from './Steve.jsx'
import RetroButton from './RetroButton.jsx'
import { resetPassword } from '../lib/api.js'

/**
 * ResetPasswordModal — shown when the app opens with a ?reset=<token> link.
 * Props: token (string | null), onDone(user), onClose
 */
export default function ResetPasswordModal({ token, onDone, onClose }) {
  return (
    <AnimatePresence>
      {token && <Inner token={token} onDone={onDone} onClose={onClose} />}
    </AnimatePresence>
  )
}

function Inner({ token, onDone, onClose }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { user } = await resetPassword(token, password)
      onDone(user)
    } catch (err) {
      setError(err.message || 'This reset link is invalid or expired.')
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full bg-void border-3 border-ink text-beige font-mono text-xl px-3 py-2 focus:outline-none focus:border-cyan'

  return (
    <motion.div
      className="fixed inset-0 z-[97] grid place-items-center p-4 bg-ink/75 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="crt retro-panel noise w-full max-w-md p-6 shadow-chunk-lg"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10">
            <Steve mood="happy" size={40} />
          </div>
          <h3 className="font-pixel text-sm text-beige">NEW PASSWORD</h3>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="font-pixel text-[10px] text-cyan block mb-1">NEW PASSWORD</label>
            <input
              type="password"
              required
              minLength={8}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="font-body text-xs text-beige/50 mt-1">8+ characters</p>
          </div>
          {error && (
            <div className="bg-magenta text-ink border-3 border-ink px-3 py-2 font-mono text-base">
              ▸ {error}
              <button type="button" onClick={onClose} className="underline ml-2">
                close
              </button>
            </div>
          )}
          <RetroButton color="lime" size="lg" as="button" type="submit" className="w-full" disabled={busy}>
            {busy ? 'SAVING…' : '▸ Set password & log in'}
          </RetroButton>
        </form>
      </motion.div>
    </motion.div>
  )
}
