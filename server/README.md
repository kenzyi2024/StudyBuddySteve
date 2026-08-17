# Server — Node.js / Express API Gateway

This is the main API gateway. It owns auth, persistence (MongoDB), OAuth calendar
sync, and `.ics` generation. It delegates the heavy document parsing to the
Python service in `../ai-parser`.

## Responsibilities
- **Upload intake** — receives files from the frontend, stores them (S3/GridFS),
  and creates a parsing job.
- **Parse orchestration** — forwards the document to the Python parser service and
  persists the extracted events.
- **Review & edit** — CRUD endpoints for the dashboard to adjust events before sync.
- **Calendar sync** — Google & Outlook OAuth, plus `.ics` export/subscription.

## Suggested routes
```
POST   /api/uploads                 # multipart file -> creates a parse job
GET    /api/jobs/:id                 # poll parse status (eating|scanning|done|error)
GET    /api/courses/:id/events       # list extracted events
PATCH  /api/events/:id               # edit a single event
POST   /api/courses/:id/approve      # lock in the reviewed calendar
GET    /api/oauth/google             # begin Google OAuth
GET    /api/oauth/google/callback
POST   /api/courses/:id/sync/google  # push approved events to Google Calendar
GET    /api/courses/:id/calendar.ics # universal subscription / download
```

## Run
```bash
cd server
npm install
npm run dev        # nodemon index.js on PORT (default 4000)
```

> This folder ships a minimal `index.js` stub so the scaffold boots. Flesh out
> the routes above as you build each feature.
