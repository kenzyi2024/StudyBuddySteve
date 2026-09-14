import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TypeBadge from './TypeBadge'

describe('TypeBadge', () => {
  it('shows the type label', () => {
    render(<TypeBadge type="exam" />)
    expect(screen.getByText('Exam')).toBeInTheDocument()
  })

  it('uses a custom label for the "other" type', () => {
    render(<TypeBadge type="other" label="Office Hours" />)
    expect(screen.getByText('Office Hours')).toBeInTheDocument()
  })

  it('ignores a custom label for non-other types', () => {
    render(<TypeBadge type="quiz" label="ignored" />)
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.queryByText('ignored')).not.toBeInTheDocument()
  })
})
