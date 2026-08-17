# Study Buddy Steve — Architecture

This document describes the recommended architecture, data flow, and the key
technical decisions behind each of the four core features.

## 1. High-level shape

Study Buddy Steve is a three-service system plus a database. The React client
talks only to the Node/Express gateway; the gateway is the single front door that
brokers everything else. Document parsing is isolated in a dedicated Python
service because the text-extraction and date-inference work is CPU-heavy, has a
very different dependency footprint (OCR binaries, PDF libraries, ML clients),
and benefits from being able to scale — or fail — independently of the API.

```
                 ┌──────────────────────────┐
                 │   React SPA (Vite)        │
                 │   retro UI + Framer Motion │
                 └────────────┬──────────────┘
                              │  HTTPS / JSON + multipart
                 ┌────────────▼──────────────┐
                 │  Node.js / Express gateway │
                 │  auth · jobs · OAuth · ics │
                 └───┬─────────────┬──────────┘
                     │             │
      internal HTTP  │             │  Mongoose
                     ▼             ▼
        ┌────────────────────┐  ┌────────────┐
        │ Python FastAPI      │  │  MongoDB   │
        │ parse + extract     │  │  users /   │
        │ (pdf/docx/ocr/llm)  │  │  courses / │
        └────────────────────┘  │  events    │
                                 └────────────┘
```

Why this split rather than one monolith: the frontend stays a pure static bundle
(cheap to host on any CDN), the gateway holds all the stateful/secret concerns
(tokens, sessions, DB), and the parser can be a stateless worker you scale
horizontally or move onto a queue when volume grows.

## 2. Feature → implementation

### Smart Upload Zone
The client accepts PDF, DOCX, and images via drag-and-drop (`UploadZone.jsx`).
On submit it POSTs the file as `multipart/form-data` to `POST /api/uploads`. The
gateway streams the file into object storage (S3 or GridFS), creates a `Course`
document with `parseStatus: "queued"`, and returns a `jobId`. The UI then polls
`GET /api/jobs/:id` (or subscribes over WebSocket/SSE) and maps the returned
status to Steve's animation phases (`eating → scanning → done`).

For larger scale, replace the synchronous forward-to-parser call with a job queue
(BullMQ/Redis or SQS) so uploads never block a request thread.

### AI Parsing Engine
Lives in `ai-parser/`. The pipeline is deliberately two-tier:

1. **Deterministic fast path** — extract text (pdfplumber / python-docx /
   pytesseract OCR), then pull explicit dates with regex + `dateparser`. Cheap,
   fast, and covers well-formatted syllabi.
2. **LLM smart path** — for messy or relative dates ("the Monday after spring
   break"), send the surrounding text to an LLM with a strict JSON schema
   (`{course, title, type, due, confidence}`). Resolve relative dates against the
   term's academic calendar.

Every event carries a `confidence` score and a source `snippet`, which powers the
review step: low-confidence rows get flagged for the user to double-check.

### Interactive Dashboard
After parsing, events are stored (unapproved) and rendered in the client as both a
**calendar view** and a **list view**. Users edit titles/dates/types
(`PATCH /api/events/:id`), delete false positives, and then approve
(`POST /api/courses/:id/approve`), which flips events to `approved: true` and makes
them eligible for sync. Drag-to-reschedule in the calendar maps to the same PATCH.
This "human-in-the-loop" gate is what makes the AI output trustworthy.

### Seamless Calendar Syncing
Three sync paths, all from the gateway:

- **Google Calendar** — OAuth 2.0 (`/api/oauth/google`), store refresh token, push
  approved events via the Calendar API `events.insert`.
- **Outlook** — Microsoft Graph OAuth, `POST /me/events`.
- **Universal `.ics`** — generate an RFC 5545 file at
  `GET /api/courses/:id/calendar.ics`. Serve it both as a one-time download and as
  a **subscription URL** (stable, auth-scoped) so any calendar app can poll it and
  pick up edits automatically.

Store provider tokens encrypted at rest and refresh them lazily on sync.

## 3. Data model (MongoDB)

Three collections (`server/models/index.js`):

- **User** — profile + per-provider OAuth tokens.
- **Course** — one per uploaded syllabus: name, term, stored file reference, and
  `parseStatus`.
- **Event** — the extracted items: `title`, `type` (assignment/exam/quiz/…),
  `due`, `approved`, and `source` provenance (`page`, `snippet`, `confidence`).

Events reference their `Course`, and courses reference their `User`, so a user's
whole semester is a couple of indexed queries.

## 4. Frontend architecture

- **Vite + React 18** for a fast static SPA.
- **Tailwind, heavily customized** — the theme *replaces* the modern SaaS defaults:
  a neon-on-CRT palette, pixel/mono/sans font trio, and hard-offset `shadow-chunk`
  utilities instead of soft blurred shadows. Dynamic color classes are safelisted.
- **Framer Motion** for all motion: the arcade-button press (button collapses into
  its own drop shadow), Steve's mood-driven SVG animation, the drag-hover wiggle,
  and the pixel-block `PixelWipe` route transition. CRT flicker + scanlines are
  pure CSS (`.crt`) so they cost nothing at runtime.
- **Component seams** are already drawn so features slot in: `UploadZone` emits an
  `onComplete(files)` that App turns into a `PixelWipe` toward the (future)
  `/dashboard` route.

## 5. Suggested build order

1. ✅ Landing / upload page + design system (this scaffold).
2. Wire `UploadZone` to the real `POST /api/uploads` + job polling.
3. Build the Python parser fast path (real PDF/DOCX/OCR extraction).
4. Review dashboard (calendar + list, edit/approve).
5. `.ics` export, then Google & Outlook OAuth sync.
6. Add the job queue + auth/sessions once the happy path works.

## 6. Notable trade-offs

- **Separate Python service vs. serverless functions** — the service is simpler to
  develop and keeps heavy native deps (Tesseract, PDF libs) in one container.
  Move to functions only if cold-start cost is acceptable and you want zero idle spend.
- **Polling vs. WebSocket for job status** — polling ships first and is trivially
  reliable; upgrade to SSE/WebSocket for snappier "eating→scanning→done" updates.
- **Regex-first, LLM-second** keeps cost and latency low on clean syllabi while
  still handling the messy long tail — the confidence score is what routes between
  them and what the review UI surfaces.
```
