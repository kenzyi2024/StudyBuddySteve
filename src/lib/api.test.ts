import { describe, it, expect, beforeEach } from 'vitest'
import { setToken, getToken } from './api'

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
