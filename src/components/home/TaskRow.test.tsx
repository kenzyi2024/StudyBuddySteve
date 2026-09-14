import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskRow from './TaskRow'
import { makeDue } from '../../data/events'
import type { EventItem } from '../../types'

const baseEvent: EventItem = {
  id: 'evt_1',
  title: 'Submit Homework #1',
  type: 'homework',
  course: 'CS 101',
  due: makeDue(2026, 8, 14, 23, 59),
  allDay: false,
  done: false,
}

function renderRow(overrides: Partial<EventItem> = {}, handlers = {}) {
  const props = {
    e: { ...baseEvent, ...overrides },
    courseColorName: 'cyan',
    courseHex: '#22e0ff',
    onToggleDone: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...handlers,
  }
  render(<TaskRow {...props} />)
  return props
}

describe('TaskRow', () => {
  it('shows the title and course', () => {
    renderRow()
    expect(screen.getByText('Submit Homework #1')).toBeInTheDocument()
    expect(screen.getByText('CS 101')).toBeInTheDocument()
  })

  it('fires onToggleDone with the event id', async () => {
    const props = renderRow()
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(props.onToggleDone).toHaveBeenCalledWith('evt_1')
  })

  it('fires onEdit when the title is clicked', async () => {
    const props = renderRow()
    await userEvent.click(screen.getByText('Submit Homework #1'))
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_1' }))
  })

  it('fires onDelete with the event id', async () => {
    const props = renderRow()
    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(props.onDelete).toHaveBeenCalledWith('evt_1')
  })

  it('shows a "done" label and the un-check control when completed', () => {
    renderRow({ done: true })
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark not done' })).toBeInTheDocument()
  })
})
