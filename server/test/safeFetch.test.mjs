import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeFetchText } from '../lib/safeFetch.js'

test('rejects non-http(s) schemes', async () => {
  await assert.rejects(() => safeFetchText('file:///etc/passwd'), /http\(s\)/)
  await assert.rejects(() => safeFetchText('ftp://example.com/x'), /http\(s\)/)
})

test('blocks cloud metadata + private/loopback addresses', async () => {
  await assert.rejects(() => safeFetchText('http://169.254.169.254/latest/meta-data'), /private/i)
  await assert.rejects(() => safeFetchText('http://127.0.0.1:4000/'), /private/i)
  await assert.rejects(() => safeFetchText('http://10.0.0.5/feed.ics'), /private/i)
  await assert.rejects(() => safeFetchText('http://192.168.1.10/feed.ics'), /private/i)
  await assert.rejects(() => safeFetchText('http://localhost/feed.ics'), /private/i)
})

test('rejects garbage URLs', async () => {
  await assert.rejects(() => safeFetchText('not a url'), /Invalid URL/)
})
