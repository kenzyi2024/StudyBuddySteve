import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import Steve from './Steve.jsx'
import RetroButton from './RetroButton.jsx'
import { login, register } from '../lib/api.js'

/**
 * AuthModal — retro login / register dialog.
 * Props: open (bool), onClose, onAuthed(user)
 */
export default function AuthModal({ open, onClose, onAuthed }) {
  return (
    <AnimatePresence>{open && <Inner onClose={onClose} onAuthed={onAuthed} />}</AnimatePresence>
  )
}

function Inner({ onClose, onAuthed }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { user } =
        mode === 'login'
          ? await login({ email, password })
          : await register({ email, password, name })
      onAuthed(user)
    } catch (err) {
      // Network failure (backend offline) vs. a real auth error.
      const msg =
        err.status == null
          ? 'Can’t reach the server. Is the gateway running on :4000?'
          : err.message || 'Something went wrong'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full bg-void border-3 border-ink text-beige font-mono text-xl px-3 py-2 focus:outline-none focus:border-cyan'

  return (
    <motion.div
      className="fixed inset-0 z-[95] grid place-items-center p-4 bg-ink/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="crt retro-panel noise w-full max-w-md p-6 shadow-chunk-lg"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10">
              <Steve mood="happy" size={40} />
            </div>
            <div>
              <h3 className="font-pixel text-sm text-beige leading-tight">
                {mode === 'login' ? 'WELCOME BACK' : 'JOIN STEVE'}
              </h3>
              <p className="font-mono text-base text-cyan">
                {mode === 'login' ? 'log in to sync your semester' : 'create a free account'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-magenta hover:text-lime" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="font-pixel text-[10px] text-cyan block mb-1">NAME</label>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div>
            <label className="font-pixel text-[10px] text-cyan block mb-1">EMAIL</label>
            <input
              type="email"
              required
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="font-pixel text-[10px] text-cyan block mb-1">PASSWORD</label>
            <input
              type="password"
              required
              minLength={8}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && (
              <p className="font-body text-xs text-beige/50 mt-1">8+ characters</p>
            )}
          </div>

          {error && (
            <div className="bg-magenta text-ink border-3 border-ink px-3 py-2 font-mono text-base">
              ▸ {error}
            </div>
          )}

          <RetroButton color="lime" size="lg" as="button" type="submit" className="w-full" disabled={busy}>
            {busy ? 'LOADING…' : mode === 'login' ? '▸ Log In' : '▸ Sign Up'}
          </RetroButton>
        </form>

        <div className="mt-5 text-center font-mono text-lg text-beige/70">
          {mode === 'login' ? "No account yet?" : 'Already have one?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
            }}
            className="text-cyan hover:text-lime underline decoration-dashed underline-offset-4"
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
