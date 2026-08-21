/**
 * Web Push (VAPID) — sends OS-level notifications to a user's browser even when
 * the app/tab is closed (desktop Chrome/Firefox/Edge; Android; iOS 16.4+ when
 * installed to the home screen).
 *
 * Enabled only when VAPID keys are configured. Generate a keypair once with:
 *   npx web-push generate-vapid-keys
 * and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (a mailto:).
 */
import webpush from 'web-push'

let enabled = false

export function initPush() {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:steve@studybuddy.app', pub, priv)
    enabled = true
  }
  return enabled
}

export const pushEnabled = () => enabled
export const publicKey = () => process.env.VAPID_PUBLIC_KEY || null

export function sendPush(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload))
}
