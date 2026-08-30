/**
 * Email reminders via SMTP (nodemailer). The most reliable channel — reaches
 * every device including iOS, no home-screen install needed.
 *
 * Enabled only when SMTP env vars are set (works with Gmail app passwords,
 * SendGrid/Mailgun/Postmark SMTP, etc.). No-ops gracefully otherwise.
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 */
let transport = null

export async function initEmail() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false
  try {
    const nodemailer = (await import('nodemailer')).default
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    return true
  } catch {
    return false
  }
}

export const emailEnabled = () => !!transport

export async function sendEmail(to, subject, text) {
  if (!transport) return false
  await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  })
  return true
}
