import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.JWT_SECRET = 'test_secret_for_auth'
const {
  hashPassword,
  verifyPassword,
  signPurposeToken,
  verifyPurposeToken,
} = await import('../lib/auth.js')

test('password hashing round-trips and rejects wrong password', async () => {
  const h = await hashPassword('correct horse battery')
  assert.notEqual(h, 'correct horse battery')
  assert.equal(await verifyPassword('correct horse battery', h), true)
  assert.equal(await verifyPassword('nope', h), false)
})

test('purpose tokens only verify for the matching purpose', () => {
  const t = signPurposeToken('user_123', 'reset', '1h')
  assert.equal(verifyPurposeToken(t, 'reset'), 'user_123')
  assert.equal(verifyPurposeToken(t, 'verify'), null) // wrong purpose
  assert.equal(verifyPurposeToken('garbage', 'reset'), null)
})

test('expired purpose tokens are rejected', () => {
  const t = signPurposeToken('user_123', 'reset', '-1s') // already expired
  assert.equal(verifyPurposeToken(t, 'reset'), null)
})
