/**
 * SMS reminders via Twilio. Enabled only when Twilio credentials are set:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (an SMS-capable number).
 * No-ops gracefully (returns false) when unconfigured so the app still runs.
 */
let client = null

export function initSms() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (sid && token && process.env.TWILIO_FROM) {
    // Lazy import so the dependency is optional at runtime.
    // eslint-disable-next-line import/no-extraneous-dependencies
    return import('twilio')
      .then((mod) => {
        client = mod.default(sid, token)
        return true
      })
      .catch(() => false)
  }
  return Promise.resolve(false)
}

export const smsEnabled = () => !!client

export async function sendSms(to, body) {
  if (!client) return false
  await client.messages.create({ to, from: process.env.TWILIO_FROM, body })
  return true
}
