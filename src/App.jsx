import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, ScanLine, Sparkles, Github, LogOut } from 'lucide-react'
import Steve from './components/Steve.jsx'
import RetroButton from './components/RetroButton.jsx'
import UploadZone from './components/UploadZone.jsx'
import PixelWipe from './components/PixelWipe.jsx'
import Dashboard from './components/dashboard/Dashboard.jsx'
import AuthModal from './components/AuthModal.jsx'
import { me, logout } from './lib/api.js'

const FEATURES = [
  {
    icon: ScanLine,
    color: 'cyan',
    title: 'SMART SCAN',
    body: 'Steve devours your PDF, DOCX, or photo and laser-extracts every due date, exam, and deadline.',
  },
  {
    icon: Calendar,
    color: 'magenta',
    title: 'REVIEW & EDIT',
    body: 'Eyeball every date on a chunky interactive dashboard. Fix, approve, and lock it in before syncing.',
  },
  {
    icon: Sparkles,
    color: 'lime',
    title: 'ONE-CLICK SYNC',
    body: 'Blast it to Google Calendar or Outlook, or grab a universal .ics you can subscribe to anywhere.',
  },
]

export default function App() {
  const [wipe, setWipe] = useState(false)
  const [screen, setScreen] = useState('upload') // 'upload' | 'dashboard'
  // Result handed up by UploadZone: { courseId, events }. null courseId = demo.
  const [parsed, setParsed] = useState({ courseId: null, events: null })
  const [user, setUser] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)

  // Restore any existing session on load (ignores failure / offline).
  useEffect(() => {
    me()
      .then((r) => setUser(r.user))
      .catch(() => {})
  }, [])

  const transitionTo = (next) => {
    setWipe(true)
    window.setTimeout(() => setScreen(next), 520)
  }

  const handleParsed = (result) => {
    setParsed(result || { courseId: null, events: null })
    transitionTo('dashboard')
  }

  const doLogout = async () => {
    try {
      await logout()
    } catch {
      /* ignore */
    }
    setUser(null)
    if (screen === 'dashboard') transitionTo('upload')
  }

  return (
    <div className="min-h-screen relative">
      {/* Shared screen-wipe overlay (upload ⇄ dashboard) */}
      <AnimatePresence>
        {wipe && <PixelWipe onFinished={() => setWipe(false)} />}
      </AnimatePresence>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={(u) => {
          setUser(u)
          setAuthOpen(false)
        }}
      />

      {screen === 'dashboard' && (
        <Dashboard
          courseId={parsed.courseId}
          initialEvents={parsed.events}
          onBack={() => transitionTo('upload')}
        />
      )}

      {screen === 'upload' && (
        <>

      {/* ---------- TOP BAR ---------- */}
      <header className="crt relative border-b-5 border-ink bg-dusk/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9">
              <Steve mood="happy" size={36} />
            </div>
            <span className="font-pixel text-sm sm:text-base text-beige">
              STUDY BUDDY <span className="text-magenta">STEVE</span>
            </span>
          </div>
          <nav className="hidden sm:flex items-center gap-3">
            {user ? (
              <>
                <span className="font-mono text-lg text-cyan truncate max-w-[180px]">
                  ▸ {user.name || user.email}
                </span>
                <RetroButton color="magenta" size="sm" onClick={doLogout}>
                  <LogOut size={14} /> Log Out
                </RetroButton>
              </>
            ) : (
              <RetroButton color="magenta" size="sm" onClick={() => setAuthOpen(true)}>
                Log In
              </RetroButton>
            )}
          </nav>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <main className="max-w-6xl mx-auto px-5">
        <section className="grid lg:grid-cols-2 gap-10 items-center py-12 lg:py-20">
          {/* Left: copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-block bg-amber text-ink font-pixel text-[10px] px-3 py-2 border-3 border-ink shadow-chunk mb-6"
            >
              ▸ NOW LOADING SEMESTER.EXE
            </motion.div>

            <h1 className="font-pixel text-2xl sm:text-4xl leading-[1.5] text-beige text-shadow-chunk">
              STOP <span className="text-magenta">RETYPING</span>
              <br />
              YOUR <span className="text-cyan">SYLLABUS</span>
            </h1>

            <p className="font-body text-base sm:text-lg text-beige/80 mt-6 max-w-md leading-relaxed">
              Upload your course syllabi and Steve — your friendly 8-bit study
              buddy — chews through the fine print, spits out every deadline,
              and builds a calendar that syncs everywhere. No more copy-paste.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <RetroButton
                color="lime"
                size="lg"
                onClick={() =>
                  document
                    .getElementById('upload')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                ▸ Feed Steve
              </RetroButton>
              <a
                href="#how"
                className="font-mono text-xl text-cyan hover:text-lime transition-colors underline decoration-dashed underline-offset-4"
              >
                see how it works →
              </a>
            </div>

            <div className="flex items-center gap-2 mt-8 font-mono text-lg text-beige/60">
              <span className="text-lime">●</span> 4,096 syllabi digested this week
            </div>
          </div>

          {/* Right: Steve on his pedestal */}
          <div className="flex flex-col items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, delay: 0.2 }}
              className="crt relative retro-panel noise p-8 shadow-chunk-magenta"
            >
              <Steve mood="idle" size={260} />
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="absolute -top-5 -right-4 bg-cyan text-ink font-pixel text-[10px] px-3 py-2 border-3 border-ink -rotate-3"
              >
                HI, I&apos;M STEVE!
              </motion.div>
            </motion.div>
            <p className="font-mono text-lg text-beige/50 mt-4">
              your syllabus-eating study buddy
            </p>
          </div>
        </section>

        {/* ---------- UPLOAD ---------- */}
        <section id="upload" className="py-8 scroll-mt-20">
          <div className="text-center mb-8">
            <h2 className="font-pixel text-xl sm:text-2xl text-beige text-shadow-chunk">
              DROP A <span className="text-lime">SYLLABUS</span>
            </h2>
            <p className="font-mono text-xl text-cyan mt-2">
              watch Steve do his thing ▾
            </p>
          </div>
          <UploadZone
            onComplete={handleParsed}
            authed={!!user}
            onNeedAuth={() => setAuthOpen(true)}
          />
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section id="how" className="py-16 scroll-mt-20">
          <h2 className="font-pixel text-xl sm:text-2xl text-center text-beige text-shadow-chunk mb-12">
            3 CHUNKY STEPS
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.12 }}
                whileHover={{ y: -6 }}
                className={`retro-panel noise p-6 shadow-chunk-lg`}
              >
                <div
                  className={`w-14 h-14 grid place-items-center border-3 border-ink bg-${f.color} mb-5 shadow-chunk`}
                >
                  <f.icon size={28} className="text-ink" strokeWidth={2.5} />
                </div>
                <div className="font-pixel text-[11px] text-beige/50 mb-2">
                  0{i + 1}
                </div>
                <h3 className={`font-pixel text-sm text-${f.color} mb-3`}>
                  {f.title}
                </h3>
                <p className="font-body text-sm text-beige/80 leading-relaxed">
                  {f.body}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------- CTA STRIP ---------- */}
        <section className="py-10">
          <div className="crt retro-panel noise p-8 sm:p-10 text-center shadow-chunk-cyan flex flex-col items-center">
            <Steve mood="happy" size={120} />
            <h2 className="font-pixel text-lg sm:text-xl text-beige mt-6 leading-relaxed">
              READY PLAYER <span className="text-magenta">ONE?</span>
            </h2>
            <p className="font-body text-beige/80 mt-3 max-w-md">
              Free for students. No credit card. Steve just wants to eat your
              deadlines so you don&apos;t have to.
            </p>
            <div className="mt-6">
              <RetroButton
                color="magenta"
                size="lg"
                onClick={() =>
                  document
                    .getElementById('upload')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                ▸ Start Free
              </RetroButton>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- FOOTER ---------- */}
      <footer className="border-t-5 border-ink bg-dusk mt-10">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-mono text-lg text-beige/50">
            © {new Date().getFullYear()} Study Buddy Steve · made with ▮ and CRT glow
          </span>
          <a
            href="#"
            className="flex items-center gap-2 font-mono text-lg text-cyan hover:text-lime transition-colors"
          >
            <Github size={18} /> source
          </a>
        </div>
      </footer>
        </>
      )}
    </div>
  )
}
