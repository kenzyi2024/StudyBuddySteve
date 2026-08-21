# Deploying Study Buddy Steve

Target: a live app usable from any device. Topology — **frontend on Vercel**,
**backend on Google Cloud Run** (two containers: Node gateway + Python parser),
**data in MongoDB Atlas**. One GitHub repo drives everything; you do **not** need
a separate backend repository.

```
   Browser (any device)
        │
        ▼
   Vercel  ──HTTPS──►  Cloud Run: steve-gateway (Node)  ──►  MongoDB Atlas
 (frontend)                    │
                               └──►  Cloud Run: steve-parser (Python)
```

Cloud Run is the right Google Cloud service here: it runs your existing
Dockerfiles, gives each service an HTTPS URL, scales to zero (you pay ~nothing
when idle), and injects `PORT` — which both apps already read. Auth uses a
**bearer token** so sessions work across these different domains, where browsers
block third-party cookies.

---

## 1. Database — MongoDB Atlas (free)

1. Create a free **M0** cluster at https://www.mongodb.com/atlas. (Pick a
   **Google Cloud** region near your Cloud Run region for low latency.)
2. **Database Access** → add a user (username + password).
3. **Network Access** → Add IP → **Allow access from anywhere** (`0.0.0.0/0`)
   so Cloud Run can connect.
4. **Connect → Drivers** → copy the SRV string, add the db name:
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/study_buddy_steve`

## 2. Backend — Google Cloud Run

**One-time setup.** The easiest environment is **Cloud Shell** (Console → the
`>_` icon) — gcloud is preinstalled and you're already authenticated. Use an
**existing project** (creating new ones can hit a quota); note its ID.

**Get the code into Cloud Shell.** Cloud Shell is a fresh VM without your files,
so `--source ./server` only works after you pull the repo in. Push the repo to
GitHub, then:
```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>          # run all deploy commands from the repo root
```

**Deploy both services** — a script does it in order (parser first, then the
gateway wired to it):
```bash
export PROJECT_ID=your-existing-project-id            # e.g. syllabi-calendar-app
export MONGODB_URI='mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/study_buddy_steve?retryWrites=true'
export JWT_SECRET="$(openssl rand -hex 32)"
export FRONTEND_URL='https://example.vercel.app'      # NO trailing slash; update after step 3
# optional: GOOGLE_CLIENT_ID/SECRET, MS_CLIENT_ID/SECRET, ANTHROPIC_API_KEY …
bash deploy-gcloud.sh
```

> Include the db name (`/study_buddy_steve`) in `MONGODB_URI` before the `?`,
> otherwise data lands in the default `test` database. `FRONTEND_URL` must have
> **no trailing slash** — it has to match the browser's Origin header exactly.

The script enables the needed APIs, deploys `steve-parser`, captures its URL,
then deploys `steve-gateway` with `PARSER_SERVICE_URL` pointed at it. It prints
both URLs at the end.

**Or deploy manually:**
```bash
gcloud run deploy steve-parser  --source ./ai-parser --region us-central1 \
  --allow-unauthenticated --memory 1Gi

PARSER_URL=$(gcloud run services describe steve-parser --region us-central1 \
  --format 'value(status.url)')

gcloud run deploy steve-gateway --source ./server --region us-central1 \
  --allow-unauthenticated --memory 512Mi \
  --set-env-vars NODE_ENV=production,MONGODB_URI="$MONGODB_URI",\
JWT_SECRET="$JWT_SECRET",FRONTEND_URL="$FRONTEND_URL",PARSER_SERVICE_URL="$PARSER_URL"
```

`gcloud run deploy --source` builds the image from the Dockerfile in each folder
using Cloud Build — no local Docker needed. Note the gateway URL, e.g.
`https://steve-gateway-abc123-uc.a.run.app`. Check `<gateway>/api/health` — you
want `"store":"mongo"`.

> **Secrets:** the commands above pass secrets as env vars for simplicity. For a
> tighter setup, store `MONGODB_URI` / `JWT_SECRET` in **Secret Manager** and
> reference them with `--set-secrets MONGODB_URI=steve-mongo-uri:latest`.

> **Parser access:** deploying the parser with `--allow-unauthenticated` keeps
> it simple. To lock it down, deploy it with `--no-allow-unauthenticated` and
> give the gateway's service account the `roles/run.invoker` role on it (the
> gateway then calls it with an identity token).

## 3. Frontend — Vercel

1. Vercel → New Project → import the repo (auto-detects Vite via `vercel.json`).
2. **Environment Variables** → add:
   `VITE_API_BASE = https://steve-gateway-abc123-uc.a.run.app/api`
   (your gateway URL + `/api`; baked in at build time).
3. Deploy; note the URL, e.g. `https://study-buddy-steve.vercel.app`.
4. Update the gateway's `FRONTEND_URL` to that Vercel URL and redeploy — either
   rerun `./deploy-gcloud.sh` with the new `FRONTEND_URL`, or:
   ```bash
   gcloud run services update steve-gateway --region us-central1 \
     --update-env-vars FRONTEND_URL=https://study-buddy-steve.vercel.app
   ```

Open the Vercel URL on your phone and laptop — accounts and events are shared
because they live in Atlas.

## 4. Background reminders (push when the app is closed)

Deadlines can notify students even when the tab/app is closed, via Web Push +
a scheduled sender. Three steps:

**a) Generate VAPID keys** (once) and set them on the gateway:
```bash
npx web-push generate-vapid-keys
# then, on steve-gateway:
gcloud run services update steve-gateway --region us-central1 --update-env-vars \
  VAPID_PUBLIC_KEY=<public>,VAPID_PRIVATE_KEY=<private>,VAPID_SUBJECT=mailto:you@example.com,CRON_SECRET=<random-string>
```

**b) Schedule the reminder sender** with Cloud Scheduler — it POSTs the
protected cron endpoint every morning (08:00) to push that day's deadlines:
```bash
gcloud services enable cloudscheduler.googleapis.com
gcloud scheduler jobs create http steve-reminders \
  --location us-central1 \
  --schedule "0 8 * * *" \
  --uri "https://<your-gateway>.run.app/api/cron/send-reminders" \
  --http-method POST \
  --headers "x-cron-key=<the same CRON_SECRET>"
```
(Use `--schedule "0 * * * *"` for hourly if you prefer.)

**c) Students opt in** by clicking **Reminders** on their My Semester page and
allowing notifications. That registers the service worker (`/sw.js`) and stores
a push subscription. From then on they get an OS notification for anything due
within 24 hours — no app needed open.

Platform notes: works on desktop Chrome/Firefox/Edge and Android. On iOS the
student must **Add to Home Screen** first (Apple only allows web push for
installed PWAs). The `.ics` subscription (step 3's `.ics` file added to Apple/
Google Calendar) is the universal fallback — those apps fire native reminders
everywhere.

## 5. Calendar OAuth (optional)

Update each provider's redirect URI to the **public gateway URL** and set the
matching env vars on `steve-gateway`:
```
https://steve-gateway-abc123-uc.a.run.app/api/oauth/google/callback
https://steve-gateway-abc123-uc.a.run.app/api/oauth/outlook/callback
```
Provider setup steps are in `OAUTH_SETUP.md`.

---

## Environment variable summary

| Where           | Variable             | Value                                              |
|-----------------|----------------------|----------------------------------------------------|
| Vercel          | `VITE_API_BASE`      | `https://<gateway>.run.app/api`                    |
| Cloud Run (gw)  | `MONGODB_URI`        | Atlas SRV string                                   |
| Cloud Run (gw)  | `JWT_SECRET`         | long random string                                 |
| Cloud Run (gw)  | `FRONTEND_URL`       | your Vercel URL (comma-list for previews)          |
| Cloud Run (gw)  | `NODE_ENV`           | `production` (enables SameSite=None;Secure cookie) |
| Cloud Run (gw)  | `PARSER_SERVICE_URL` | the parser service's Cloud Run URL                 |
| Cloud Run (parser) | `ANTHROPIC_API_KEY` | optional — LLM smart path                        |

## Troubleshooting

- **Login fails / CORS error:** `FRONTEND_URL` on the gateway must exactly equal
  the Vercel origin (scheme + host, no trailing slash).
- **`/api/...` 404 from the deployed app:** `VITE_API_BASE` wasn't set at build
  time — set it in Vercel and redeploy (env changes require a rebuild).
- **Health shows `"store":"memory"`:** the gateway couldn't reach Atlas — check
  `MONGODB_URI` and that Atlas Network Access allows `0.0.0.0/0`.
- **Cloud Run "PORT" / container failed to start:** both apps read `process.env`
  `PORT`; don't hard-code a port. The Dockerfiles are already correct.
- **Parser 500s on scanned PDFs:** OCR needs Tesseract + Poppler — these are in
  the parser Dockerfile; make sure you deployed `./ai-parser` (not source-only).
- **OAuth "redirect_uri_mismatch":** provider redirect URI must match the public
  gateway callback URL character-for-character.
