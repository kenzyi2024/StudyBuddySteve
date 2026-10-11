import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setToken, getToken, login, TZ } from './api'

describe('auth token helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    setToken(null)
  })

  it('persists a token to localStorage and reads it back', () => {
    setToken('abc123')
    expect(getToken()).toBe('abc123')
    expect(localStorage.getItem('steve_token')).toBe('abc123')
  })

  it('clears the token on null', () => {
    setToken('abc123')
    setToken(null)
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('steve_token')).toBeNull()
  })
})

describe('sign-in sends the browser timezone', () => {
  it('includes tz in the login body (for correctly-timed reminders)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1' }, token: 't' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await login({ email: 'a@b.co', password: 'password123' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ email: 'a@b.co', password: 'password123', tz: TZ })
    expect(TZ).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
