import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.JWT_SECRET = 'test_secret_for_auth'
const {
  hashPassword,
  verifyPassword,
  signPurposeToken,
  verifyPurposeToken,
  verifyPurposeTokenDetails,
  signToken,
  verifySessionToken,
  attachUser,
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

test('session tokens verify and carry the token version', () => {
  assert.deepEqual(verifySessionToken(signToken('user_123', 4)), { uid: 'user_123', tv: 4 })
  assert.equal(verifySessionToken('garbage'), null)
})

test('verify/reset tokens are NOT accepted as login sessions', () => {
  for (const purpose of ['verify', 'reset']) {
    const t = signPurposeToken('user_123', purpose, '1h')
    assert.equal(verifySessionToken(t), null)
    const req = { headers: { authorization: `Bearer ${t}` }, query: {} }
    attachUser(req, {}, () => {})
    assert.equal(req.userId, undefined)
  }
})

test('attachUser sets userId and tokenVersion for a real session', () => {
  const req = { headers: { authorization: `Bearer ${signToken('user_9', 2)}` }, query: {} }
  attachUser(req, {}, () => {})
  assert.equal(req.userId, 'user_9')
  assert.equal(req.tokenVersion, 2)
})

test('reset tokens carry the version they were issued at', () => {
  const t = signPurposeToken('user_123', 'reset', '1h', 3)
  assert.deepEqual(verifyPurposeTokenDetails(t, 'reset'), { uid: 'user_123', tv: 3 })
  assert.equal(verifyPurposeTokenDetails(t, 'verify'), null)
})
