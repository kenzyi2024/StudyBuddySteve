import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import * as store from '../lib/store.js'

before(async () => {
  await store.initStore() // in-memory (no MONGODB_URI in tests)
})

test('parsed events are uncommitted until approved', async () => {
  const u = await store.createUser({ email: 'a@t.com', name: 'A', passwordHash: 'x' })
  const c = await store.createCourse(u._id, { name: 'CS 101' })
  await store.addEvents(u._id, c.id, [
    { title: 'HW1', type: 'homework', due: new Date(Date.UTC(2026, 8, 14, 23, 59)).toISOString() },
  ])
  assert.equal((await store.allEventsForUser(u._id)).length, 0) // not in calendar yet
  assert.equal((await store.eventsForCourse(u._id, c.id)).length, 1) // visible in review
  await store.commitCourse(u._id, c.id)
  assert.equal((await store.allEventsForUser(u._id)).length, 1) // now in calendar
})

test('user scoping: one user cannot see another’s data', async () => {
  const a = await store.createUser({ email: 'b@t.com', name: 'B', passwordHash: 'x' })
  const b = await store.createUser({ email: 'c@t.com', name: 'C', passwordHash: 'x' })
  const c = await store.createCourse(a._id, { name: 'MATH 210' })
  await store.addEvents(a._id, c.id, [{ title: 'X', type: 'exam', due: new Date().toISOString() }])
  assert.equal(await store.getCourse(b._id, c.id), null)
  assert.equal((await store.eventsForCourse(b._id, c.id)).length, 0)
})

test('import dedupes by externalUid and commits immediately', async () => {
  const u = await store.createUser({ email: 'd@t.com', name: 'D', passwordHash: 'x' })
  const c = await store.getOrCreateCourse(u._id, 'Canvas')
  const list = [
    { title: 'A', type: 'homework', due: new Date().toISOString(), externalUid: 'uid-1' },
    { title: 'B', type: 'quiz', due: new Date().toISOString(), externalUid: 'uid-2' },
  ]
  const first = await store.importEvents(u._id, c.id, list)
  assert.equal(first.imported, 2)
  const second = await store.importEvents(u._id, c.id, list) // re-sync
  assert.equal(second.imported, 0)
  assert.equal(second.skipped, 2)
  assert.equal((await store.allEventsForUser(u._id)).length, 2) // imports are committed
})

test('disconnecting Canvas removes it from the sync list', async () => {
  const u = await store.createUser({ email: 'e@t.com', name: 'E', passwordHash: 'x' })
  await store.setCanvasFeed(u._id, 'https://canvas.test/f.ics', 'UTC')
  assert.equal((await store.usersWithCanvas()).some((x) => x.userId === u._id), true)
  await store.clearCanvasFeed(u._id)
  assert.equal((await store.usersWithCanvas()).some((x) => x.userId === u._id), false)
})
