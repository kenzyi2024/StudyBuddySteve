import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RetroButton from './RetroButton'

describe('RetroButton', () => {
  it('renders its children', () => {
    render(<RetroButton>Feed Steve</RetroButton>)
    expect(screen.getByRole('button', { name: 'Feed Steve' })).toBeInTheDocument()
  })

  it('forwards onClick', async () => {
    const onClick = vi.fn()
    render(<RetroButton onClick={onClick}>Go</RetroButton>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders as an anchor when as="a"', () => {
    render(
      <RetroButton as="a" href="#upload">
        Jump
      </RetroButton>,
    )
    const link = screen.getByRole('link', { name: 'Jump' })
    expect(link).toHaveAttribute('href', '#upload')
  })
})
