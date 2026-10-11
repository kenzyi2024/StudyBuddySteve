import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Dashboard from './Dashboard'
import { ToastProvider } from '../ToastProvider'
import { makeDue } from '../../data/events'
import * as api from '../../lib/api'
import type { EventItem } from '../../types'

vi.mock('../../lib/api', () => ({
  patchEvent: vi.fn(),
  deleteEvent: vi.fn(),
  commitCourse: vi.fn(),
  discardPendingReview: vi.fn(),
}))

const events: EventItem[] = [
  { id: 'e1', title: 'Problem Set 1', type: 'homework', course: 'CS 101', due: makeDue(2026, 8, 14, 23, 59), allDay: false },
  { id: 'e2', title: 'Midterm Exam', type: 'exam', course: 'CS 101', due: makeDue(2026, 9, 20, 10, 0), allDay: false },
]

function setup(initial: EventItem[] = events) {
  const onExit = vi.fn()
  const onUploadAnother = vi.fn()
  render(
    <ToastProvider>
      <Dashboard courseId="c1" initialEvents={initial} onExit={onExit} onUploadAnother={onUploadAnother} />
    </ToastProvider>,
  )
  return { onExit, onUploadAnother }
}

describe('Dashboard (review)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds the reviewed events to the calendar, then leaves', async () => {
    vi.mocked(api.commitCourse).mockResolvedValue({ committed: 2 })
    const { onExit } = setup()
    await userEvent.click(screen.getByRole('button', { name: /add 2 to my calendar/i }))
    expect(api.commitCourse).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(onExit).toHaveBeenCalledOnce())
  })

  it('stays on the review and shows an error when adding fails', async () => {
    vi.mocked(api.commitCourse).mockRejectedValue(new Error('Server unavailable'))
    const { onExit } = setup()
    await userEvent.click(screen.getByRole('button', { name: /add 2 to my calendar/i }))
    expect(await screen.findByText(/couldn’t add these to your calendar/i)).toBeInTheDocument()
    expect(onExit).not.toHaveBeenCalled()
    // the button is usable again so the student can retry
    expect(screen.getByRole('button', { name: /add 2 to my calendar/i })).toBeEnabled()
  })

  it('removes an event, and puts it back with an error if the server refuses', async () => {
    vi.mocked(api.deleteEvent).mockRejectedValue(new Error('Not authenticated'))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Problem Set 1' }))
    expect(api.deleteEvent).toHaveBeenCalledWith('e1')
    expect(await screen.findByText(/couldn’t remove “problem set 1”/i)).toBeInTheDocument()
    expect(screen.getByText('Problem Set 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add 2 to my calendar/i })).toBeInTheDocument()
  })

  it('"Finish later" leaves without adding anything', async () => {
    const { onExit } = setup()
    await userEvent.click(screen.getByRole('button', { name: /finish later/i }))
    expect(onExit).toHaveBeenCalledOnce()
    expect(api.commitCourse).not.toHaveBeenCalled()
  })

  it('offers another upload when nothing was found', async () => {
    const { onUploadAnother } = setup([])
    expect(screen.getByText('NO DATES FOUND')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to my calendar/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /try another file/i }))
    expect(onUploadAnother).toHaveBeenCalledOnce()
  })
})
