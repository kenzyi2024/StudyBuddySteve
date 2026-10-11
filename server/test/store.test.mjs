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

test('changing the password bumps tokenVersion (signs out old sessions)', async () => {
  const u = await store.createUser({ email: 'tv@t.com', name: 'T', passwordHash: 'x' })
  assert.equal((await store.getUserById(u._id)).tokenVersion || 0, 0)
  assert.equal(await store.setPasswordHash(u._id, 'y'), 1)
  assert.equal(await store.setPasswordHash(u._id, 'z'), 2)
  assert.equal((await store.getUserById(u._id)).tokenVersion, 2)
})

test('commit approves what the student kept; pending lists un-added syllabi', async () => {
  const u = await store.createUser({ email: 'pend@t.com', name: 'P', passwordHash: 'x' })
  const a = await store.createCourse(u._id, { name: 'CS 101' })
  const b = await store.createCourse(u._id, { name: 'BIO 200' })
  const due = new Date(Date.UTC(2026, 9, 20, 15)).toISOString()
  await store.addEvents(u._id, a.id, [{ title: 'HW1', type: 'homework', due }, { title: 'HW2', type: 'homework', due }])
  await store.addEvents(u._id, b.id, [{ title: 'Exam', type: 'exam', due }])

  const pending = await store.pendingCourses(u._id)
  assert.deepEqual(
    pending.map((p) => [p.name, p.count]).sort(),
    [['BIO 200', 1], ['CS 101', 2]],
  )

  const committed = await store.commitCourse(u._id, a.id)
  assert.ok(committed.every((e) => e.committed && e.approved))
  assert.deepEqual((await store.pendingCourses(u._id)).map((p) => p.name), ['BIO 200'])
})

test('discarding a pending review removes its events and the empty course', async () => {
  const u = await store.createUser({ email: 'disc@t.com', name: 'D', passwordHash: 'x' })
  const c = await store.createCourse(u._id, { name: 'MATH 221' })
  await store.addEvents(u._id, c.id, [{ title: 'PS1', type: 'homework', due: new Date().toISOString() }])
  assert.equal(await store.discardPending(u._id, c.id), 1)
  assert.deepEqual(await store.pendingCourses(u._id), [])
  assert.equal(await store.getCourse(u._id, c.id), null)
})

test('discard never touches events already in the calendar', async () => {
  const u = await store.createUser({ email: 'keep@t.com', name: 'K', passwordHash: 'x' })
  const c = await store.getOrCreateCourse(u._id, 'Canvas')
  await store.importEvents(u._id, c.id, [{ title: 'Quiz', type: 'quiz', due: new Date().toISOString(), externalUid: 'q1' }])
  assert.equal(await store.discardPending(u._id, c.id), 0)
  assert.equal((await store.allEventsForUser(u._id)).length, 1)
  assert.ok(await store.getCourse(u._id, c.id))
})

test('another user cannot see or discard my pending review', async () => {
  const me = await store.createUser({ email: 'me@t.com', name: 'M', passwordHash: 'x' })
  const other = await store.createUser({ email: 'other@t.com', name: 'O', passwordHash: 'x' })
  const c = await store.createCourse(me._id, { name: 'CHEM 110' })
  await store.addEvents(me._id, c.id, [{ title: 'Lab', type: 'homework', due: new Date().toISOString() }])
  assert.deepEqual(await store.pendingCourses(other._id), [])
  assert.equal(await store.discardPending(other._id, c.id), 0)
  assert.equal((await store.pendingCourses(me._id)).length, 1)
})

test('calendar feed token is stable, resettable, and resolves to its owner', async () => {
  const u = await store.createUser({ email: 'feed@t.com', name: 'F', passwordHash: 'x' })
  const t1 = await store.getFeedToken(u._id)
  assert.match(t1, /^[a-f0-9]{48}$/)
  assert.equal(await store.getFeedToken(u._id), t1) // same link until reset
  assert.equal(await store.findUserIdByFeedToken(t1), u._id)
  const t2 = await store.rotateFeedToken(u._id)
  assert.notEqual(t2, t1)
  assert.equal(await store.findUserIdByFeedToken(t1), null) // old link is dead
  assert.equal(await store.findUserIdByFeedToken(t2), u._id)
})
