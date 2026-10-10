/**
 * Email (verification + reminders).
 *
 * Primary provider: **Bird** (https://bird.com) email API — set BIRD_API_KEY.
 *   - Region host is derived from the key prefix (bk_us1_… → us1.platform.bird.com).
 *   - Auth is a bearer token; endpoint is POST /v1/email/messages.
 *   - `from` must be on a verified sending domain for real recipients. Until you
 *     verify a domain, Bird's shared `onboarding@messagebird.dev` sender only
 *     delivers to verified members of your workspace (good for your own testing).
 *
 * Fallback provider: **SMTP** via nodemailer — set SMTP_HOST / SMTP_USER / SMTP_PASS.
 *
 * No-ops gracefully (returns false) when neither is configured, so the app runs
 * without email.
 */
let provider = null // 'bird' | 'smtp' | null
let smtpTransport = null
let birdCfg = null

// bk_us1_… keys are valid only against us1.platform.bird.com (eu1 likewise).
function birdHostFromKey(key) {
  const region = (String(key).split('_')[1] || 'us1').toLowerCase()
  return `https://${region}.platform.bird.com`
}

export async function initEmail() {
  const { BIRD_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env

  if (BIRD_API_KEY) {
    birdCfg = {
      key: BIRD_API_KEY,
      host: process.env.BIRD_API_HOST || birdHostFromKey(BIRD_API_KEY),
      fromEmail: process.env.BIRD_FROM_EMAIL || 'onboarding@messagebird.dev',
      fromName: process.env.BIRD_FROM_NAME || 'Study Buddy Steve',
    }
    provider = 'bird'
    return true
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const nodemailer = (await import('nodemailer')).default
      smtpTransport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
      provider = 'smtp'
      return true
    } catch {
      return false
    }
  }

  return false
}

export const emailEnabled = () => provider !== null

// Our message bodies are plain text; Bird wants an HTML part too. Wrap + linkify
// bare URLs (so verify/reset links are clickable) and preserve line breaks.
function textToHtml(text) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${linked}</div>`
}

async function sendViaBird(to, subject, text) {
  const res = await fetch(`${birdCfg.host}/v1/email/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${birdCfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: birdCfg.fromEmail, name: birdCfg.fromName },
      to: [to],
      subject,
      html: textToHtml(text),
      text: String(text),
    }),
  })
  // Bird accepts with 202 (async delivery); any 2xx is success.
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Bird email ${res.status}: ${body.slice(0, 300)}`)
  }
  return true
}

export async function sendEmail(to, subject, text) {
  try {
    if (provider === 'bird') return await sendViaBird(to, subject, text)
    if (provider === 'smtp') {
      await smtpTransport.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
      })
      return true
    }
  } catch (e) {
    // Callers are fire-and-forget; log so failures are diagnosable in Cloud Run logs.
    console.error('sendEmail failed:', e?.message || e)
    return false
  }
  return false
}
