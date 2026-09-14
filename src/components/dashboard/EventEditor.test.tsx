import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventEditor from './EventEditor'
import { makeDue } from '../../data/events'
import type { EventItem } from '../../types'

const allDayEvent: EventItem = {
  id: 'evt_1',
  title: 'Read Chapter 1',
  type: 'reading',
  course: 'CS 101',
  due: makeDue(2026, 8, 14, 0, 0),
  allDay: true,
}

describe('EventEditor', () => {
  it('renders nothing when event is null', () => {
    const { container } = render(
      <EventEditor event={null} onSave={vi.fn()} onClose={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('defaults a timed deadline to 11:59 PM when the event had no time', async () => {
    const onSave = vi.fn()
    render(<EventEditor event={allDayEvent} onSave={onSave} onClose={vi.fn()} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledOnce()
    const saved = onSave.mock.calls[0][0] as EventItem
    const d = new Date(saved.due)
    expect(d.getUTCHours()).toBe(23)
    expect(d.getUTCMinutes()).toBe(59)
  })

  it('reveals a custom-label field when type is switched to "other"', async () => {
    render(<EventEditor event={allDayEvent} onSave={vi.fn()} onClose={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/Lab, Discussion/)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'other')
    expect(screen.getByPlaceholderText(/Lab, Discussion/)).toBeInTheDocument()
  })

  it('fires onDelete with the event id', async () => {
    const onDelete = vi.fn()
    render(<EventEditor event={allDayEvent} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('evt_1')
  })
})
