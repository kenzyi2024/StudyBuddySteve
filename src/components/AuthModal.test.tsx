import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthModal from './AuthModal'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
}))

const mockApi = api as unknown as {
  login: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
  forgotPassword: ReturnType<typeof vi.fn>
}

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<AuthModal open={false} onClose={vi.fn()} onAuthed={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('logs in and calls onAuthed with the returned user', async () => {
    const user = { id: 'u1', email: 'a@b.co' }
    mockApi.login.mockResolvedValue({ user, token: 't' })
    const onAuthed = vi.fn()
    render(<AuthModal open onClose={vi.fn()} onAuthed={onAuthed} />)

    await userEvent.type(screen.getByLabelText('EMAIL'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('PASSWORD'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /Log In/i }))

    expect(mockApi.login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password123' })
    expect(onAuthed).toHaveBeenCalledWith(user)
  })

  it('switches to sign-up mode', async () => {
    render(<AuthModal open onClose={vi.fn()} onAuthed={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(screen.getByLabelText('NAME')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign Up/i })).toBeInTheDocument()
  })

  it('switches to forgot-password mode and hides the password field', async () => {
    render(<AuthModal open onClose={vi.fn()} onAuthed={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.queryByLabelText('PASSWORD')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send reset link/i })).toBeInTheDocument()
  })
})
