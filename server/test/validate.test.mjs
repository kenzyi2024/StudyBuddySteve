import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEventPatch } from '../lib/validate.js'

test('accepts a normal edit and normalizes it', () => {
  const { patch, error } = validateEventPatch({
    title: '  HW 1 ',
    course: 'CS 101',
    type: 'homework',
    due: '2026-09-14T23:59:00.000Z',
    allDay: false,
    done: true,
  })
  assert.equal(error, undefined)
  assert.deepEqual(patch, {
    title: 'HW 1',
    course: 'CS 101',
    type: 'homework',
    due: '2026-09-14T23:59:00.000Z',
    allDay: false,
    done: true,
  })
})

test('ignores unknown fields (e.g. ownership / internal flags)', () => {
  const { patch } = validateEventPatch({ user: 'someone-else', committed: false, reminded: true, done: false })
  assert.deepEqual(patch, { done: false })
})

test('rejects bad input with a message', () => {
  const bad = [
    { due: 'not-a-date' },
    { due: null },
    { type: 'banana' },
    { title: '' },
    { title: '   ' },
    { title: 42 },
    { title: 'x'.repeat(201) },
    { done: 'yes' },
    { approved: 1 },
  ]
  for (const body of bad) {
    const r = validateEventPatch(body)
    assert.ok(r.error, `expected an error for ${JSON.stringify(body)}`)
    assert.equal(r.patch, undefined)
  }
})

test('tolerates an empty / missing body', () => {
  assert.deepEqual(validateEventPatch(undefined).patch, {})
  assert.deepEqual(validateEventPatch(null).patch, {})
})
