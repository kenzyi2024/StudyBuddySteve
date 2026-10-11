import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productionConfigErrors } from '../lib/config.js'

test('dev / test never blocks startup', () => {
  assert.deepEqual(productionConfigErrors({}), [])
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'development' }), [])
})

test('production requires JWT_SECRET and MONGODB_URI', () => {
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'production' }), [
    'JWT_SECRET is not set',
    'MONGODB_URI is not set',
  ])
  assert.deepEqual(
    productionConfigErrors({ NODE_ENV: 'production', JWT_SECRET: 's', MONGODB_URI: 'mongodb://x' }),
    [],
  )
})
