# Calendar Sync — Credential Setup

Study Buddy Steve syncs approved events to **Google Calendar** and **Outlook**
using OAuth 2.0. Both are free to set up. You only need the provider(s) you
actually want; the app hides buttons for providers with no credentials.

Put the values you collect into your `.env` (copy from `.env.example`). After
editing `.env`, restart the gateway (`cd server && npm run dev`).

---

## Google Calendar

**Where:** Google Cloud Console — https://console.cloud.google.com

1. **Create/pick a project** (top bar → project dropdown → *New Project*).
2. **Enable the API:** *APIs & Services → Library* → search **"Google Calendar
   API"** → **Enable**.
3. **Configure the consent screen:** *APIs & Services → OAuth consent screen*.
   - User type **External** (fine for testing).
   - Fill app name, your email for support + developer contact.
   - **Scopes:** add `.../auth/calendar.events`.
   - **Test users:** add the Google account(s) you'll sign in with. (While the
     app is in "Testing" only listed test users can authorize — no review needed.)
4. **Create credentials:** *APIs & Services → Credentials → Create Credentials →
   OAuth client ID*.
   - Application type: **Web application**.
   - **Authorized redirect URI** (must match exactly):
     `http://localhost:4000/api/oauth/google/callback`
   - Create → copy the **Client ID** and **Client secret**.

**.env:**
```
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=http://localhost:4000/api/oauth/google/callback
```

---

## Outlook (Microsoft Graph)

**Where:** Azure Portal — https://portal.azure.com → **Microsoft Entra ID** →
**App registrations** (or go straight to
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).

1. **New registration.**
   - Name it (e.g. "Study Buddy Steve").
   - **Supported account types:** *Accounts in any organizational directory and
     personal Microsoft accounts* (lets personal @outlook.com sign in).
   - **Redirect URI:** platform **Web**, value:
     `http://localhost:4000/api/oauth/outlook/callback`
   - Register.
2. **Copy the Application (client) ID** from the Overview page → `MS_CLIENT_ID`.
3. **Create a client secret:** *Certificates & secrets → New client secret* →
   copy the secret **Value** (not the Secret ID) immediately → `MS_CLIENT_SECRET`.
4. **API permissions:** *API permissions → Add a permission → Microsoft Graph →
   Delegated permissions* → add **Calendars.ReadWrite**, **offline_access**, and
   **User.Read** → Add. (For personal/test accounts you don't need admin consent.)

**.env:**
```
MS_CLIENT_ID=<application (client) id>
MS_CLIENT_SECRET=<client secret VALUE>
MS_REDIRECT_URI=http://localhost:4000/api/oauth/outlook/callback
```

---

## Optional: LLM smart path (relative dates)

To resolve phrases like "the Friday before Thanksgiving", set **one** of these.
Leaving both blank runs the regex-only fast path.

- **Anthropic** — https://console.anthropic.com → *API Keys* → Create Key →
  `ANTHROPIC_API_KEY`. (Takes precedence if both are set.)
- **OpenAI** — https://platform.openai.com/api-keys → Create new secret key →
  `OPENAI_API_KEY`.

Both are usage-billed; a syllabus parse is a single small request.

---

## Also in `.env`

```
JWT_SECRET=<any long random string>        # signs the OAuth state param
FRONTEND_URL=http://localhost:5173         # where callbacks redirect back to
```

## Going to production

- Add your production callback URLs (https://yourdomain/api/oauth/<provider>/callback)
  to each provider's redirect-URI list, and update the `*_REDIRECT_URI` env vars.
- Google: move the consent screen from *Testing* to *In production* (may require
  verification if you request sensitive scopes at scale).
- Store tokens encrypted per-user (the dev build keeps them in memory).
- Never commit `.env` — it's already in `.gitignore`.
