import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import PixelWipe from './PixelWipe'

describe('PixelWipe', () => {
  // Regression: an invalid easing ('steps(1)') made framer-motion throw from its
  // frame loop, which blanked the app on every screen transition.
  it('animates without throwing', async () => {
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => errors.push(e.error)
    window.addEventListener('error', onError)
    const { container } = render(<PixelWipe />)
    await new Promise((r) => setTimeout(r, 300))
    window.removeEventListener('error', onError)
    expect(container.firstElementChild?.children.length).toBe(12 * 8)
    expect(errors).toEqual([])
  })

  it('reports when the wipe has finished (so the overlay unmounts)', async () => {
    const onFinished = vi.fn()
    render(<PixelWipe onFinished={onFinished} />)
    await waitFor(() => expect(onFinished).toHaveBeenCalledOnce(), { timeout: 4000 })
  })
})
