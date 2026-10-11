# Study Buddy Steve: Audit Report (Phases 1–7)

**Date:** 2026-10-11 · **Commit audited:** `251f2d7` (main, clean tree) · **No code was changed.**

## How this was verified

| Method | What was covered |
|---|---|
| Code reading | Every gateway file (`server/`), the parser entry, routes and date logic (`ai-parser/`), and all main frontend screens and components |
| Automated checks | Lint ✅, typecheck ✅, frontend tests **45/45** ✅, prod build ✅ (in a clean `npm ci` copy, see note), gateway tests **24/24** ✅, parser tests **3/4** ❌ |
| Runtime: API | Gateway run locally with the **in-memory store** (no `.env`, no access to your Atlas DB or API keys); bugs reproduced with curl |
| Runtime: UI | Vite dev server against that gateway; logged in with a throwaway local account; checked desktop and a 375px mobile viewport |
| **Not** verified | Real MongoDB behaviour, the real parser on PDFs/OCR/LLM, Google/Outlook OAuth, push/SMS/email delivery, Cloud Run behaviour. These are marked *Suspected* where relevant. |

> **Local env note:** in your checkout, `npm test` and `npm run build` fail with `Cannot find module @rollup/rollup-darwin-arm64`. This is the known npm optional-dependency bug, and your `node_modules` is broken. CI is unaffected. Fix: `rm -rf node_modules && npm install`.

---

## 1. Executive summary

Study Buddy Steve has an unusually complete feature set for a personal project. It covers syllabus parsing, a review step, an account calendar, Canvas/ICS import, a study planner, multi-channel reminders, OAuth sync and `.ics` export, all with a distinctive and consistent retro identity. The codebase is tidy: there are per-user data scopes, an SSRF guard (verified to block `127.0.0.1`), rate limits, accessible modals, a working CI pipeline and decent unit tests on the pure logic.

**The biggest weaknesses are in four areas:**

1. **Auth tokens.** Email-verification and password-reset links double as full login sessions (confirmed). The calendar "subscribe" URL embeds your 7-day login token, which leaks account access to Google and others and silently breaks after a week.
2. **The review → commit flow can lose a whole parsed syllabus.** Leaving the review screen in any way except the final button orphans the events. That includes Back, refresh, a failed commit, or clicking Google sync, which redirects away. After that they are invisible and unrecoverable from the UI.
3. **Date correctness.** The parser puts already-passed syllabus dates into **next year** (confirmed; this is why the parser test fails today). Google/Outlook sync shifts every timed deadline by the user's UTC offset (code-confirmed).
4. **Silent failures.** Nearly every save, delete and commit call swallows errors (`.catch(() => {})`). The UI shows success while the server may have rejected the change. One failing load makes a logged-in user with data see the empty marketing page.

**Biggest opportunity:** fix the four areas above before adding anything from `CLASS_WORKSPACES_SPEC.md`. Making the core loop trustworthy (*upload → review → calendar → reminders*) will matter more to students than per-class AI tutors.

---

## 2. Feature inventory

| Feature | Status | Evidence / limitation |
|---|---|---|
| Register / login / logout | ✅ Working (verified) | Runtime. Logout doesn't revoke JWTs (stateless design). |
| Email verification | ⚠️ Partial | Works, but the token is also a valid session (**BUG-01**). |
| Password reset | ⚠️ Partial | Works, but the link is a session token, is reusable for 1 h, and old sessions survive the reset. |
| Syllabus upload → parse | ⚠️ Partial | Only the first of multiple files is parsed (**BUG-06**). Past dates go to the wrong year (**BUG-04**). Error path verified. |
| Review dashboard (edit / approve / commit) | ❌ Defective flow | Orphaned events (**BUG-05**). The approve toggle doesn't control what gets committed (**BUG-08**). |
| Semester home (overview / calendar / tasks) | ✅ Working (verified) | Mobile overflow (**BUG-12**). Stats include study sessions (**UX-04**). |
| Edit / delete / undo delete | ⚠️ Partial | Works; failures are invisible (**BUG-09**). |
| ICS file / URL import | ✅ Working (verified) | Re-syncs never update changed due dates (**BUG-14**). |
| Canvas connect / auto-sync | ⚠️ Unverified at runtime | Same update limitation. Cron depends on `CRON_SECRET`, which the deploy script doesn't set. |
| Study planner + quiz | ⚠️ Partial | Rebuilding wipes completed/edited sessions (**BUG-07**, confirmed). |
| Reminders: in-page, push, SMS, email | ⚠️ Unverified | Push/SMS/email are off locally. The deploy script doesn't pass VAPID/Twilio/Bird/CRON env vars. |
| Google / Outlook push sync | ⚠️ Code-reviewed only | Times are shifted by the UTC offset (**BUG-10**). Every sync creates duplicates (**BUG-11**). |
| `.ics` download / subscribe | ⚠️ Partial | Works, but the URL carries the session token and dies after 7 days (**BUG-02**). |
| Class Workspaces / AI tutor | ⬜ Not implemented | Spec only (`CLASS_WORKSPACES_SPEC.md`). |
| Course management (rename / delete course, delete account) | ⬜ Missing | No endpoints or UI exist. |

---

## 3. Bug report

Severity: Critical / High / Medium / Low. Confidence: **Confirmed** (reproduced at runtime, or a failing test) or **Code-confirmed** (the logic clearly leads to the bug; not run end-to-end) or **Suspected**.

### P0-class

**BUG-01: Email-verify and password-reset tokens work as login sessions**
- **Where:** `server/lib/auth.js` (`attachUser` and `signPurposeToken` share one secret, and `attachUser` never checks `purpose`)
- **Repro:** Sign a `verify` token for a user and send it as `Authorization: Bearer …` to `/api/auth/me`. The user is returned. *Ran this.*
- **Expected:** Rejected. **Actual:** A 3-day (verify) or 1-hour (reset) login. These tokens travel in email bodies, URLs, browser history and email-provider logs.
- **Severity:** Critical · **Confidence:** Confirmed
- **Fix:** In `attachUser`, reject any token that has a `purpose` claim (or require `typ: 'session'`). Ideally also use a separate signing secret for purpose tokens. Add a test.
- **Regression risk:** Low. Existing sessions have no `purpose` claim and keep working.

**BUG-02: The calendar subscription URL contains the user's full login token**
- **Where:** `src/lib/api.ts` (`myCalendarIcsUrl`, `calendarIcsUrl`, `oauthStartUrl` all append `?token=`), `RemindersModal.tsx:209` (passes it to `calendar.google.com/…?cid=`), `server/lib/auth.js` (accepts `?token=` on every route)
- **Impact:**
  - Anyone holding the URL has full API access as that user for 7 days. That includes Google's fetcher, anyone the calendar is shared with, and proxy or server logs.
  - The token expires after 7 days, so the subscription **silently stops updating** after a week. This defeats the feature's purpose.
- **Severity:** Critical · **Confidence:** Code-confirmed
- **Fix:** Add a dedicated, revocable, **read-only feed token** per user (a random string stored on the user, e.g. `/api/feed/<token>.ics`) with a "reset link" button. Accept `?token=` only on that feed route. For the OAuth start, use a short-lived (≈60 s) single-purpose token instead of the session.
- **Dependencies:** Pairs with BUG-01. Existing subscribers have to re-subscribe once.

**BUG-03: The gateway silently falls back to an in-memory database in production**
- **Where:** `server/lib/store.js` `initStore()`. If Mongo is unreachable at boot, even with `NODE_ENV=production`, it serves from memory.
- **Impact:** During an Atlas blip at deploy or cold start, new registrations and edits go into RAM. They vanish on restart and differ between Cloud Run instances. Users see "data loss". The README says the gateway *refuses* to start; it doesn't.
- **Severity:** High · **Confidence:** Code-confirmed
- **Fix:** In production, exit non-zero if Mongo is unavailable (Cloud Run will retry). Also refuse to boot in production when `JWT_SECRET` is unset; it currently falls back to the public string `dev_insecure_secret_change_me`.

**BUG-04: The parser assigns already-passed dates to next year**
- **Where:** `ai-parser/parser.py` `_parse()` uses `PREFER_DATES_FROM: 'future'`, and `_clamp_year` only corrects years that are *too low*.
- **Repro:** Run `parse_text(SAMPLE)` today. "Problem Set 1 due September 14" in a **Fall 2026** syllabus becomes `2027-09-14`, and "Quiz 1 … 9/21" becomes `2027-09-21`. The test `test_finds_dated_events` fails for this reason (it passed before Sept 14 2026; it's a time bomb).
- **Impact:** Every student uploading mid-semester gets wrong-year past events. The study planner then also schedules around them.
- **Severity:** High · **Confidence:** Confirmed (failing test plus direct output)
- **Fix:** When the syllabus term/year is known, parse yearless dates relative to that term (`RELATIVE_BASE` = term start, or `PREFER_DATES_FROM: 'current_period'`) and clamp the year *down* to `base_year` as well as up. Handle Fall terms that run into January. Freeze "now" in tests.

**BUG-05: Parsed events get orphaned if the student leaves the review screen without the final button**
- **Where:** `Dashboard.tsx`, `App.tsx`, `SyncBar.tsx`. Parsed events are stored with `committed:false`; only the "Approve & Add" button commits them. Nothing in the UI lists uncommitted courses.
- **Triggers (any one):**
  - The header's **"My Semester"** back button.
  - Page refresh (the screen state isn't in the URL).
  - **Clicking Google/Outlook sync** on the review screen. It redirects to OAuth and returns to `/`, not the dashboard. The SyncBar's success toast also never shows, because SyncBar isn't mounted on return.
  - `commitCourse` failing. The error is swallowed and the user is sent home anyway.
- **Impact:** The whole syllabus disappears from the user's view, with no way to recover it short of re-uploading.
- **Severity:** High · **Confidence:** Code-confirmed (each path traced; not clicked through end-to-end because the local parser wasn't running)
- **Fix:**
  1. Add `GET /api/me/pending-courses` and show a "1 syllabus waiting for review" banner on home that reopens the dashboard.
  2. Await the commit, show an error and stay on the page if it fails.
  3. Either hide OAuth sync on the review screen (sync from home after commit) or return to the dashboard after OAuth.
  4. Optionally, `?review=<courseId>` in the URL.

### P1-class

**BUG-06: "Parse 3 Files" only parses the first file**
- **Where:** `UploadZone.tsx:80` uploads `files[0]` only.
- **Severity:** High (it silently drops user input) · **Confidence:** Code-confirmed
- **Fix:** Upload sequentially and show "File 2 of 3". Alternatively, restrict the picker to one file and change the button label. Sequential upload is preferred, with one review screen per course or a merged one.

**BUG-07: Rebuilding the study plan erases completed and edited sessions**
- **Where:** `server/index.js` `rebuildStudyPlan()` calls `clearPlanEvents`, which deletes every `source.method:'plan'` event. It runs on every commit and every quiz retake.
- **Repro:** Generate a plan, mark one session done, call `/me/study-plan`. The done count goes from 1 to 0. *Ran this.*
- **Severity:** High (it destroys user progress) · **Confidence:** Confirmed
- **Fix:** Keep past and done sessions. Only replace *future, not-done, unedited* plan sessions. Mark user-edited sessions (`source.method: 'plan-edited'`) so they're preserved. Make clear-and-insert atomic so concurrent rebuilds don't duplicate.

**BUG-08: The per-event "Approve" toggle doesn't decide what goes into the calendar**
- **Where:** `commitCourse` sets `committed:true` on **all** of a course's events. `approved` only affects Google/Outlook/course `.ics` sync.
- **Impact:** A student who un-approves a false positive still gets it in their calendar and reminders. "Approved" and "committed" are two overlapping concepts that the UI presents as one.
- **Severity:** Medium-High · **Confidence:** Code-confirmed
- **Fix:** Commit only approved events and default parsed events to approved, or remove the per-event approve toggle and rely on delete. Pick one model and use it everywhere.

**BUG-09: Save, delete and commit failures are silent; one load failure looks like "no data"**
- **Where:** `Dashboard.tsx:48,65,80,189`, `SemesterHome.tsx:72,103,107,126`, `App.tsx:89`
- **Repro:** A bad PATCH made `/api/me/events` return 500 (in the memory store; see BUG-13). The logged-in user with data was then shown the **empty landing page**. *Seen in the browser.*
- **Severity:** High · **Confidence:** Confirmed
- **Fix:** Add a small toast or error system. Roll back optimistic changes on failure. Distinguish "failed to load" (show a retry) from "no events".

**BUG-10: Google/Outlook sync shifts timed deadlines by the user's timezone offset**
- **Where:** `server/lib/calendarSync.js`. The app stores wall-clock-as-UTC (its own documented convention, and `.ics` export correctly uses floating times). Google gets `dateTime: …Z` and Outlook gets `timeZone:'UTC'`.
- **Impact:** "Due 11:59 PM" appears at 7:59 PM for a US-Eastern student.
- **Severity:** High · **Confidence:** Code-confirmed
- **Fix:** Send the wall-clock time without `Z`, plus the user's IANA `timeZone` (already captured as `user.tz` for Canvas; capture it at registration too).

**BUG-11: Every Google/Outlook sync re-creates every event (duplicates)**
- **Where:** `pushToGoogle` / `pushToOutlook` always `POST`. No external IDs are stored.
- **Severity:** Medium · **Confidence:** Code-confirmed
- **Fix:** Store `{provider, externalId}` per event and update instead of inserting. Alternatively, steer users to the subscription feed (once BUG-02 is fixed) as the primary sync method.

**BUG-12: Semester home overflows horizontally on phones**
- **Where:** `SemesterHome.tsx` header (4 buttons) and the tab row (4 tabs + 2 buttons), which have no wrap or scroll.
- **Repro:** At a 375px viewport, the document width is **672px**. "Import", "Add Syllabus", "Log out", "Tasks" and "Study Plan" are pushed off-screen. *Measured.*
- **Severity:** Medium-High (students are mostly on phones) · **Confidence:** Confirmed
- **Fix:** Collapse the header actions into a menu below `sm`. Make the tab row `overflow-x-auto` or icon-only on mobile. Remove the duplicate "Study Plan" header button (it's already a tab).

### P2-class

| ID | Issue | Sev | Conf. | Fix |
|---|---|---|---|---|
| BUG-13 | `PATCH /events/:id` doesn't validate. An invalid `due` returns 500; in the memory store it **bricks the user's whole event list** (every later read 500s). In Mongo the bad date is likely rejected, but `type:"banana"` and `title:""` persist because `findOneAndUpdate` skips validators. Non-ObjectId IDs → 500 (suspected). | Medium | Confirmed (memory) / Suspected (Mongo) | Validate in the route (date parse, enum, non-empty title) and return 400; use `runValidators: true`. Return 404 for invalid IDs. |
| BUG-14 | Canvas/ICS re-sync skips any UID already seen, so **changed due dates and deleted assignments are never updated**. | Medium | Code-confirmed | Upsert by `externalUid` (update `due` and `title` unless the user edited it). Optionally remove events whose UID has disappeared from the feed. |
| BUG-15 | The parser service is deployed `--allow-unauthenticated` with the Anthropic/OpenAI key. Anyone who finds the URL can burn your LLM credits without limit. | High (cost) | Code-confirmed | Deploy with `--no-allow-unauthenticated` and call it with a Cloud Run ID token, or add a shared-secret header plus size limits. |
| BUG-16 | Upload responds `202` and then parses in the same request. On Cloud Run with default CPU throttling, CPU is cut after the response, so parsing may crawl or stall. The 60 s client poll then shows a misleading "Can't reach Steve's server". | Medium | Suspected | `--no-cpu-throttling` on the gateway (small cost), or parse before responding (simplest), or a job queue. Show a real timeout message. |
| BUG-17 | Malformed OAuth `state` → JSON 500 instead of a redirect (`timingSafeEqual` throws on a length mismatch outside `try`). | Low | Confirmed | Length check plus try/catch in `decodeState`. |
| BUG-18 | The reminder cron compares wall-clock-as-UTC `due` against real `now`. Same-day deadlines drop out of the window hours early for US users, and reminders fire off by the UTC offset. | Medium | Code-confirmed | Convert using the stored `user.tz` in the cron. |
| BUG-19 | Password reset doesn't invalidate existing sessions or the reset link (reusable for 1 h). | Medium | Code-confirmed | Add `tokenVersion` / `passwordChangedAt` to the user and check it in `attachUser`. |
| BUG-20 | No React error boundary. Any render error blanks the whole app. | Medium | Code-confirmed | Wrap `<App/>` in a boundary with a friendly reset screen (Sentry is already wired). |
| BUG-21 | `EventEditor` with the date input cleared → `Invalid Date.toISOString()` throws; Save silently does nothing. | Low | Code-confirmed | Disable Save without a date. |
| BUG-22 | Unsupported files are silently ignored by the drop zone. Over-20 MB uploads hit the multer error and return a generic 500. The file input doesn't reset (re-selecting the same file does nothing). The "can't read" copy says "not a photo/scan" while the UI advertises PNG/JPG. | Low | Code-confirmed | Show inline rejections and a 413 message, reset `input.value`, and align the copy. |
| BUG-23 | A failed upload leaves an "Untitled Course" record behind (verified). Failed or abandoned courses accumulate forever. | Low | Confirmed | Delete the course on parse error, or show and clean up pending courses (ties into BUG-05). |
| BUG-24 | Undo-delete: if the tab closes within 5 s the delete never reaches the server (the event "comes back"). Unmounting doesn't flush the pending delete. | Low | Code-confirmed | Flush on `pagehide` and unmount, or delete immediately and undo by re-creating. |
| BUG-25 | `localStorage` `steve_notified` is parsed without try/catch and grows forever. | Low | Code-confirmed | Wrap it and prune past IDs. |

---

## 4. User journey and flow analysis

**J1. First visit → first calendar (the core loop)**
Landing → "Feed Steve" → drop file → *forced login modal* → (quiz modal pops up) → user must re-click Parse → animation → review → approve → home.

- **Friction 1: login interrupts after the file is chosen, and the file action doesn't resume.** *Change:* after successful auth from the upload prompt, automatically continue parsing the queued file. *Why:* it removes a click and keeps momentum.
- **Friction 2: the study quiz opens on top of the first-run flow** (it opens in `onAuthed` for every user without prefs, even mid-upload). *Change:* defer the quiz until after the first commit, as a card on the Study Plan tab ("Build my plan, 30 s"). *Why:* the user came to get dates out of a syllabus, so the quiz should wait until that's done.
- **Friction 3: the review screen has three overlapping "approve" concepts** (per-row approve, "Approve All", "Approve & Add to Calendar") plus a sync bar that only works on approved items. *Change:* one primary action, **"Add N events to my calendar"**. Rows are kept by default, with delete/edit. Low-confidence rows are highlighted ("Steve isn't sure about these 3"); the parser already returns `confidence`. Move sync to home.
- **Friction 4: no manual "Add event"** anywhere. When Steve misses a date, the student can't add it. *Change:* an "+ Add" button on review and home that opens the existing `EventEditor` with a blank event.

**J2. Returning student (daily use)**
Login → home overview → check off tasks.
- Works well. The overview is a good landing.
- Stats ("9 tasks, 0% done") count auto-generated study sessions as tasks, which inflates the to-do count and deflates progress. *Change:* report assignments and study sessions separately.
- There's no "Today" focus. *Change (optional):* make the first block in Overview "Due today / tomorrow".

**J3. Fixing a wrong date** — edit modal and drag-to-reschedule both work. Drag doesn't work on touch devices, but the editor covers that. Keep both.

**J4. Connecting Canvas / calendar** — Import modal and Reminders modal both contain "calendar" actions (import *from* vs subscribe *to*). The two directions are easy to confuse. *Change:* rename them "Import from Canvas / another calendar" and "Send to my calendar app", and put "Send to calendar" in one place (Reminders → or its own "Sync" button).

**J5. Recovery** — Delete undo is good. "Clear All" uses `window.confirm` with no undo, and deletes imported Canvas events that will *not* come back on re-sync (dedupe skips them). *Change:* scope "Clear All" to completed items or add undo. Note that BUG-14's upsert fix would let Canvas events be restored.

---

## 5. UI/UX and accessibility findings

**What works and should be kept:** the retro identity is consistent: pixel/mono/body font trio, chunky shadows, mascot moods tied to state. Modals have focus traps and Esc (`useModalA11y`), icon buttons have `aria-label`s, and tests exist for these.

| ID | Finding | Impact | Recommendation |
|---|---|---|---|
| UX-01 | Mobile overflow (BUG-12) | Core actions are unreachable on phones | Responsive header and scrollable tabs |
| UX-02 | Fake social proof "4,096 syllabi digested this week" and a footer "source" link to `#` | Erodes trust for a tool that asks for school data | Remove, or replace with real copy |
| UX-03 | No toasts or error surface for mutations (BUG-09) | Users can't tell if changes saved | One shared toast component (one already exists inline in SyncBar; extract it) |
| UX-04 | Study sessions mixed into task stats and lists | Inflated numbers; the progress bar feels hopeless | Separate counts; a filter toggle in Tasks |
| UX-05 | Body copy in `VT323`/`Press Start 2P` at small sizes (`text-[10px]` pixel labels) and `text-beige/60` on dark | Readability and contrast for long sessions | Keep pixel font for headings only; check `/60` opacity text against WCAG AA (likely below 4.5:1 for small text) |
| UX-06 | Disabled buttons styled with `style={{opacity:0.4}}` instead of a proper disabled state in `RetroButton` | Inconsistent; easy to forget | Handle `disabled` styling inside `RetroButton` |
| UX-07 | Calendar event chips are drag-only for rescheduling, and page state (tab, screen) isn't in the URL, so Back leaves the app | Back button exits the app; no deep links | Minimal URL state (`?view=tasks`, `?review=id`); a router isn't required |
| UX-08 | Animations (CRT flicker, wipes, infinite flicker on the processing label) don't respect `prefers-reduced-motion` | Accessibility / vestibular | `useReducedMotion()` from framer-motion, plus a CSS media query for `.animate-flicker` and `.crt` |
| UX-09 | Pixel-wipe transition adds ~520 ms before every screen change, including "back" | Feels slow in repeated use | Keep it for upload → review only |

---

## 6. Performance findings

**Measured**
- Production build: main JS **365 KB (111 KB gzip)**, CSS 40 KB (8 KB gzip), plus a separate **360 KB (121 KB gzip)** chunk that only loads when `VITE_SENTRY_DSN` is set. This is reasonable for this app.
- Three Google font families block first paint (`display=swap` is set, so text shows with fallbacks first).
- Steve mascot PNGs are 334 px wide and load fine. `public/steve/` has 14 PNGs; sizes weren't audited individually.

**Hypotheses (code evidence, not measured)**
- `GET /api/me/events` returns *all* events ever (no date window). This is fine for one semester and grows linearly over years. Add a date window or archive later; not urgent.
- `/api/auth/me` is called twice on load (React StrictMode in dev only; not a prod issue). `me()` is also called again after quiz and verify flows; this is minor.
- Upload parsing on a throttled Cloud Run instance (BUG-16) is the most likely *user-visible* slowness.
- Repo hygiene: 60+ `vite.config.js.timestamp-*.mjs` files, a 211 KB `redesign-editorial.patch`, `src/__rmtest.tmp`, `server/__*.mjs`, a stale `dist/` and an unused `render.yaml`. They're gitignored, so not shipped, but they clutter the workspace. Note that `src/__rmtest.tmp` sits inside `src/`.

---

## 7. Product improvement opportunities (existing features first)

1. **Make the review step trustworthy**: confidence highlighting, manual add, a single commit action, a pending-review banner (BUG-05/08). This is the product's core promise.
2. **Make sync "set and forget"**: a revocable feed URL (BUG-02), then promote "Subscribe" as the default and demote one-shot Google/Outlook pushes.
3. **Make Canvas sync actually sync**: upsert changed dates (BUG-14). Students will trust this more than syllabus parsing.
4. **Study plan that respects progress** (BUG-07) and shows the reason for each session ("for BIO 200 midterm, Oct 20").
5. **Course management**: rename, recolor or delete a course, plus delete account and export data. These are basic trust and privacy features for a student tool.
6. *(Later)* Class Workspaces / AI tutor per the spec. Worth doing only once 1–5 are solid.

---

## 8. Prioritized implementation roadmap

| # | Item | Benefit | Effort | Depends on | Verified by |
|---|---|---|---|---|---|
| **P0** | | | | | |
| 1 | BUG-01 reject purpose tokens as sessions, plus BUG-19 session invalidation on reset | Closes account-takeover vectors | S | — | New `auth.test.mjs` cases; curl repro returns 401 |
| 2 | BUG-02 dedicated revocable read-only feed token; drop `?token=` elsewhere; short-lived OAuth start token | Stops token leakage; subscriptions stop dying at 7 days | M | 1 | Tests: feed token can't hit `/api/me/events`; session token can't hit the feed; manual Google subscribe |
| 3 | BUG-03 fail fast in prod without Mongo or `JWT_SECRET` | Prevents silent data loss | S | — | Unit test on boot guard; local `NODE_ENV=production` run exits |
| 4 | BUG-15 lock down the parser service | Stops LLM credit abuse | S | — | Unauthenticated `curl /parse` → 403 |
| **P1** | | | | | |
| 5 | BUG-04 parser year resolution plus frozen-clock tests | Correct dates mid-semester | M | — | Parser tests green regardless of today's date; add Fall→Jan case |
| 6 | BUG-05 + BUG-08 + BUG-23 review-flow rework (pending banner, awaited commit, one approval model, cleanup) | No more vanished syllabi | M | — | Component tests for commit failure; manual: back/refresh then recover |
| 7 | BUG-09 toast/error surface plus load-error vs empty state | Users know when things fail | M | — | Tests: failed PATCH shows error and rolls back |
| 8 | BUG-07 preserve done/edited plan sessions | Keeps progress | S–M | — | Gateway test reproducing today's runtime repro |
| 9 | BUG-06 multi-file upload | Matches what the UI promises | S–M | 6 | UploadZone test with 2 files → 2 uploads |
| 10 | BUG-13 PATCH validation | Prevents corrupt data and 500s | S | — | Gateway tests for bad date, type, title |
| 11 | BUG-12 mobile layout of home | Phone usability | S | — | No horizontal overflow at 375px (scripted check) |
| **P2** | | | | | |
| 12 | BUG-10/18 timezone-correct OAuth sync and reminder cron | Correct times outside UTC | M | capture `tz` at registration | Unit tests with `America/New_York` |
| 13 | BUG-14 Canvas upsert | Real re-sync | M | — | `icsImport`/store tests with a changed due date |
| 14 | BUG-11 idempotent Google/Outlook sync | No duplicates | M | 12 | Manual with a test Google account |
| 15 | BUG-16 Cloud Run CPU / parse timing | Reliable parsing in prod | S | — | Deploy and time a real upload |
| 16 | BUG-20 error boundary, UX-08 reduced motion, UX-05 contrast pass | Resilience and a11y | S each | — | Tests, Lighthouse/axe |
| 17 | J1 flow: resume upload after login, defer quiz, manual "+ Add" | Faster first success | M | 6 | Walkthrough |
| **P3** | | | | | |
| 18 | UX-02 remove fake stats and dead link; repo cleanup (timestamp files, patch, tmp, `render.yaml`, stale README paths `.jsx`) | Trust and hygiene | S | — | Visual check |
| 19 | Course management, account deletion and export | Trust and privacy | M–L | 6 | Tests |
| 20 | Class Workspaces / AI tutor | New value | L | 1–14 | Per spec |

---

## 9. Recommended next steps

1. **First (one focused batch, about half a day):** P0 items 1, 3 and 4, plus item 10. They're small, low-risk and server-side, have tests to add alongside, and close the security and data-loss holes. Item 2 (feed token) follows right after because it changes a user-facing URL.
2. **Then:** item 5 (parser dates; also turns CI green again) and items 6–8 (the review-flow rework and visible errors). This is where students feel the difference.
3. **Then:** mobile layout (11), multi-file (9), timezone work (12–14).
4. **Can safely wait:** visual polish, course management, and the Class Workspaces spec.

**Before any production push:** run `rm -rf node_modules && npm install` locally; confirm the deploy script sets `CRON_SECRET` and the reminder provider vars you intend to use (it currently doesn't); confirm `GOOGLE_REDIRECT_URI`/`MS_REDIRECT_URI` are set on the gateway.

---

## Change log: Batch 1 (branch `fix/audit-p0-batch`, uncommitted)

| Fix | What changed | Files |
|---|---|---|
| **BUG-01** verify/reset tokens as sessions | Session verification rejects any token with a `purpose` claim | `server/lib/auth.js` |
| **BUG-19** sessions survive password reset | New `tokenVersion` on the user, embedded in sessions and reset links. A password change bumps it, so old sessions get 401 and a used reset link is void. Checked by a middleware in the gateway (one user lookup per authed request). | `auth.js`, `index.js`, `models/index.js`, `store.mongo.js`, `store.memory.js` |
| **BUG-03** silent in-memory fallback / public JWT fallback | In production: refuse to boot without `JWT_SECRET`/`MONGODB_URI`; exit if Mongo is unreachable; `secret()` throws instead of using the dev string | `lib/config.js` (new), `store.js`, `auth.js`, `index.js` |
| **BUG-15** public parser burns LLM credits | Parser requires `X-Parser-Key` when `PARSER_SHARED_SECRET` is set, plus a 20 MB cap (413). The gateway sends the key; the deploy script generates one secret and sets it on both services. | `ai-parser/security.py` (new), `ai-parser/main.py`, `server/lib/parserClient.js`, `deploy-gcloud.sh`, `.env.example`, `DEPLOYMENT.md` |
| **BUG-13** unvalidated event edits | `PATCH /events/:id` validates title/course/label/type/due/booleans → 400 with a message. Mongo store: non-ObjectId ids → 404, `runValidators` on update. | `lib/validate.js` (new), `index.js`, `store.mongo.js` |

**Tests added:** `auth.test.mjs` (+4), `store.test.mjs` (+1), `validate.test.mjs` (4), `config.test.mjs` (2), `ai-parser/test_security.py` (2).

**Checks run:**
- Lint ✅, typecheck ✅.
- Gateway tests 35/35 ✅. Frontend tests 45/45 ✅ (clean copy; the frontend is unchanged).
- Parser tests 5/6: the 1 failure is the pre-existing BUG-04, not touched in this batch.

**Runtime verification** (local gateway, memory store; local uvicorn parser):
- A verify token gets `user:null`, and a real session still works.
- After a reset, the old session gets 401, reusing the reset link gets 400, and the new login works.
- Bad date/type edits get 400 and the event list stays healthy.
- A production boot without secrets exits 1, and with Mongo down exits 1. Dev without Mongo still runs on memory.
- Parser: no key or wrong key gets 401, the right key gets 200, a 21 MB file gets 413. Gateway → parser with a matching key parses; with a mismatched key the job errors.

**Not verified:** behaviour against real MongoDB Atlas (the `$inc tokenVersion` update and `runValidators`) and a real Cloud Run deploy.

**Rollout notes:**
- **Existing sessions keep working.** Old tokens have no `tv`, which is treated as 0, matching existing users' default.
- **Deploy parser and gateway together** (the script does this). A gateway with a secret calling an old parser still works. A parser with a secret behind an old gateway rejects every upload.
- **Existing prod is still open until you redeploy.** The current parser stays publicly callable until then.

---

## Change log: Batch 2 (branch `fix/audit-p0-batch`, uncommitted)

| Fix | What changed | Files |
|---|---|---|
| **BUG-02** login token in calendar URLs | New per-user **read-only feed token** (`/api/feed/<token>.ics`, 48 hex chars) with a "Reset link" button. `?token=` is no longer accepted anywhere. `.ics` downloads use an authenticated fetch. The OAuth start is a `POST` returning the provider URL. | `server/lib/auth.js`, `index.js`, `models/index.js`, stores, `src/lib/api.ts`, `RemindersModal.tsx`, `SemesterHome.tsx` |
| **BUG-04** past dates → next year | Year-less dates use the syllabus term's year (Fall terms roll Jan/Feb into the next year). Explicit years are kept, and stray earlier years still snap up. If the year is unknown, the old behaviour applies. The fallback parser handles `9/21` and `Oct 20, 2026`. | `ai-parser/parser.py` |
| *(new)* parser times shifted by the server's timezone | Naive parser times (`2026-09-14T23:59:00`) are read as UTC wall-clock (they were read in the host's local zone). Found during the end-to-end test. | `server/lib/dates.js` (new), stores, `validate.js` |
| **BUG-05 / 08 / 23** syllabus vanishes after review | `GET /api/me/pending` plus a "N dates waiting for your review" banner with Review/Discard. "Finish later" is safe. Commit is awaited, and on failure it stays with an error. Commit sets `approved` too (one model). The per-row approve toggle became a one-click **Remove**. A Discard action exists. An empty result offers "Try another file". Google/Outlook buttons were removed from review (see note). | `server/index.js`, stores, `Dashboard.tsx`, `ListView.tsx`, `SemesterHome.tsx`, `App.tsx`; `SyncBar.tsx` deleted |
| **BUG-09** silent failures | `ToastProvider` + `useToast`. Edits, moves, done toggles and deletes roll back with a visible error. A failed semester load shows an error with Retry instead of the empty landing page. | `components/ToastProvider.tsx`, `lib/toast.ts` (new), `Dashboard.tsx`, `SemesterHome.tsx`, `App.tsx`, `main.tsx` |
| *(new)* **app crashed on every screen transition** | `PixelWipe` used `ease: 'steps(1)'`, which framer-motion 11 rejects by throwing from its frame loop. That froze all animations, then React unmounted the app. Replaced it with a step easing function. Also, the wipe's `onFinished` never fired (it was attached to a container with no animation), so the overlay never unmounted; it now fires from the last block. | `components/PixelWipe.tsx` |
| **BUG-20** no error boundary | `ErrorBoundary` with a "Reload" recovery screen (reports to Sentry when configured) | `components/ErrorBoundary.tsx` (new), `main.tsx` |
| UX-06 | `RetroButton` handles `disabled` (dimmed, no hover/press) | `RetroButton.tsx` |

**Note on Google/Outlook push:** clicking it on the review screen redirected away before commit, which was the main way syllabi vanished. It also has wrong times (BUG-10) and duplicates (BUG-11). Students now sync with the subscription feed (Reminders → Calendar app: "Add to Google", "Apple / Outlook link"). The OAuth server routes remain for a future fixed version.

**Tests added:**
- Gateway (+8): pending/discard/ownership, the feed token, commit approves, the query token is rejected, `wallClockDate`.
- Frontend (+10): Dashboard ×5, PixelWipe ×2, ErrorBoundary ×2, RetroButton disabled.
- Parser (+4): year resolution, with no dependence on today's date.

**Checks run:**
- Lint ✅, typecheck ✅.
- Gateway 43/43 ✅ (also with `TZ=Asia/Tokyo`).
- Parser 10/10 ✅ (CI's failing test is fixed).
- Frontend 55/55 ✅. Prod build ✅.

**Runtime verification** (local gateway, parser and Vite):
- Feed URL serves `.ics`; the feed token can't call the API (401); a bogus feed gets 404; `?token=` gets 401.
- Upload → banner shows "CS 101: 4 dates waiting" → Review → Finish later (banner stays, toast) → Review → Remove one → Add 3 → toast, banner gone, events on home.
- Dates: Fall 2026 dates stay in 2026 at exact times; Spring 2027 "2/3" becomes 2027-02-03.
- The PixelWipe crash was reproduced, then confirmed gone, with no uncaught errors.

**Not verified:**
- Real MongoDB (feed-token unique index, `pendingCourses` query) and production deploy.
- Google actually polling the feed URL (needs a public URL).
- Animation smoothness: the browser pane throttles animations while hidden.

**Rollout notes:**
- **Existing calendar subscriptions break, and that's intended.** Old URLs carried login tokens that expired within 7 days anyway; students re-subscribe once from Reminders.
- **The feed token's unique index** is created by Mongoose on boot (`autoIndex`). If autoIndex is off in production, create `{ feedToken: 1 }` unique and sparse.

---

## Change log: Batch 3 (branch `fix/audit-p0-batch`, uncommitted)

| Fix | What changed | Files |
|---|---|---|
| **BUG-18** reminders off by the UTC offset | The browser's IANA timezone is saved on register/login, and refreshed on session restore (`POST /api/me/timezone`). The cron converts each wall-clock deadline to the real moment in the student's zone (`wallClockToInstant`, DST-aware) before applying their lead time. The store query over-fetches ±14 h. Students with no zone saved keep the old UTC behaviour. | `server/lib/dates.js`, `lib/reminders.js` (new), `index.js`, stores, `src/lib/api.ts`, `App.tsx`, `types.ts` |
| **BUG-06** only the first file parsed | Every queued file is parsed in turn, with "file 2 of 3 · name" shown. One failure doesn't stop the rest. Failed files stay queued for retry. One success opens its review; several go to My Semester, where each waits in the review banner. Failures show as a toast. | `UploadZone.tsx`, `App.tsx` |
| **BUG-22** silent file rejections | The drop zone says which files were skipped and why (wrong type / over 20 MB). Re-picking the same file works. | `UploadZone.tsx` |
| **BUG-12** home overflowed on phones (672px at 375px) | Header actions are icon-only on phones (with `aria-label`s), and the duplicate "Study Plan" header button is removed. Tabs are a 4-up grid. The calendar toolbar title shrinks. Review rows move the type badge under the title. Task rows stack the countdown and an icon-only badge, and titles wrap to 2 lines. | `SemesterHome.tsx`, `CalendarView.tsx`, `ListView.tsx`, `TaskRow.tsx`, `TypeBadge.tsx` |

**Tests added:**
- Gateway (+4): New York EDT/EST, Tokyo, DST, invalid-zone fallback; same-day 11:59 PM reminder; lead window in local time.
- Frontend (+6): UploadZone multi-file/partial failure/total failure/skipped notice/progress label; login sends `tz`.

**Checks run:**
- Lint ✅, typecheck ✅.
- Gateway 47/47 ✅ (also with `TZ=Pacific/Auckland` and `America/Los_Angeles`).
- Parser 10/10 ✅. Frontend 61/61 ✅. Prod build ✅.

**Runtime verification** (local stack):
- At 375px, every home tab, all 4 calendar modes, the Reminders/Import/editor modals and the review screen measure exactly 375px wide (was 672). Desktop layout is unchanged.
- Uploading 2 real DOCX syllabi plus 1 corrupt PDF gave 2 review banners and a "broken.pdf: Steve couldn't read it" toast.
- Register with `tz` stores it.

**Not verified:**
- An actual reminder delivery: push, SMS and email aren't configured locally, so the cron path is covered by unit tests only.
