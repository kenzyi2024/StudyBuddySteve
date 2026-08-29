/**
 * SSRF-guarded fetch for user-supplied calendar URLs.
 *
 * A student can paste any URL (Canvas feed, iCal link), and the server fetches
 * it. Without guards, that lets them make the server hit internal addresses —
 * e.g. the cloud metadata server (169.254.169.254) or private ranges. This
 * blocks non-http(s) schemes and private/link-local/loopback destinations,
 * caps the response size, and enforces a timeout.
 */
import dns from 'node:dns/promises'
import net from 'node:net'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const TIMEOUT_MS = 10_000

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) || // link-local (cloud metadata)
      a === 0 ||
      a >= 224 // multicast/reserved
    )
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    return (
      v === '::1' ||
      v.startsWith('fc') ||
      v.startsWith('fd') || // unique-local
      v.startsWith('fe80') || // link-local
      v.startsWith('::ffff:') // IPv4-mapped — re-checked below
    )
  }
  return false
}

async function assertPublicHost(hostname) {
  // If it's already an IP literal, check directly.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Blocked: private address')
    return
  }
  // Resolve and ensure no address is private.
  let addrs
  try {
    addrs = await dns.lookup(hostname, { all: true })
  } catch {
    throw new Error('Could not resolve host')
  }
  for (const { address } of addrs) {
    const v4 = address.startsWith('::ffff:') ? address.slice(7) : address
    if (isPrivateIp(v4) || isPrivateIp(address)) throw new Error('Blocked: private address')
  }
}

/**
 * Fetch text from a user-supplied calendar URL, safely.
 * webcal:// is normalized to https://.
 */
export async function safeFetchText(rawUrl) {
  const url = String(rawUrl || '').replace(/^webcal:/i, 'https:')
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  await assertPublicHost(parsed.hostname)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    // redirect:'manual' — we don't want to follow a redirect to an internal host.
    const resp = await fetch(parsed.href, { redirect: 'manual', signal: controller.signal })
    if (resp.status >= 300 && resp.status < 400) {
      throw new Error('Redirects are not allowed for calendar URLs')
    }
    if (!resp.ok) throw new Error(`Could not fetch calendar (${resp.status})`)

    // Enforce a size cap while streaming.
    const reader = resp.body?.getReader()
    if (!reader) return await resp.text()
    const chunks = []
    let total = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_BYTES) throw new Error('Calendar file is too large')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    clearTimeout(timer)
  }
}
