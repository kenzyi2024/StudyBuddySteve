# 🕹️ Study Buddy Steve

> Feed Steve your syllabus. He digests every deadline and builds a calendar that syncs everywhere.

Study Buddy Steve is a semester-planning utility for students. Upload your course
syllabi (PDF, DOCX, or image), and Steve — an 8-bit CRT-monitor mascot — parses out
assignments, exams, and key dates, then generates a personalized academic calendar
that syncs with Google Calendar, Outlook, or any `.ics`-compatible app.

The whole thing wears a **bold retro aesthetic**: 90s arcade meets classic PC UI,
with chunky borders, hard drop-shadows, CRT scanlines, pixel fonts, and satisfying
arcade-button clicks.

## Monorepo layout

```
StudyBuddySteve/
├── index.html            # Vite entry
├── src/                  # React + Tailwind + Framer Motion frontend
│   ├── App.jsx           # Landing / upload page
│   ├── index.css         # Retro design layer (CRT, scanlines, chunky panels)
│   └── components/
│       ├── Steve.jsx        # The animated 8-bit mascot (SVG)
│       ├── UploadZone.jsx   # Drag-drop + "Steve eats & scans" theatre
│       ├── RetroButton.jsx  # Arcade / mechanical-key press button
│       └── PixelWipe.jsx    # Video-game screen-wipe transition
├── server/               # Node.js / Express API gateway  (auth, DB, OAuth, .ics)
├── ai-parser/            # Python FastAPI service (text + date extraction)
└── ARCHITECTURE.md       # Full architecture & data-flow write-up
```

## Quick start (frontend)

```bash
npm install
npm run dev          # http://localhost:5173
```

## Quick start (full stack)

```bash
# 1. Frontend
npm install && npm run dev

# 2. API gateway
cd server && npm install && npm run dev      # http://localhost:4000

# 3. Python parser
cd ai-parser && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000        # http://localhost:8000

# 4. MongoDB
#    Run locally (mongod) or point MONGODB_URI at Atlas.
```

Copy `.env.example` → `.env` and fill in OAuth + DB values.

## Tech stack

| Layer     | Choice                                             |
|-----------|----------------------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS (custom retro theme), Framer Motion |
| Gateway   | Node.js + Express                                  |
| AI parser | Python + FastAPI (pdfplumber, python-docx, OCR, dateparser, LLM) |
| Database  | MongoDB (Mongoose)                                 |
| Sync      | Google Calendar API, Microsoft Graph, `.ics` export |

## Design system cheat-sheet

- **Fonts:** `Press Start 2P` (headings), `VT323` (terminal/labels), `Space Grotesk` (body).
- **Palette:** deep CRT `void` background + neon `magenta`/`cyan`/`lime`/`amber` on chunky `ink` borders.
- **Shadows:** hard-offset `shadow-chunk*` (no blur) for the tactile 3D look.
- **Motion:** buttons collapse into their shadow on press; Steve eats → laser-scans → grins; pixel-block screen wipes between routes.

See `ARCHITECTURE.md` for the full picture.
