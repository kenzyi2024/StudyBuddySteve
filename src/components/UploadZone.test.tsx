import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadZone from './UploadZone'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  uploadSyllabus: vi.fn(),
  pollJob: vi.fn(),
}))

const mockApi = api as unknown as {
  uploadSyllabus: ReturnType<typeof vi.fn>
  pollJob: ReturnType<typeof vi.fn>
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

describe('UploadZone', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queues an accepted file and shows a Parse button', async () => {
    render(<UploadZone authed onComplete={vi.fn()} onNeedAuth={vi.fn()} />)
    const file = new File(['%PDF-1.4'], 'syllabus.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput(), file)

    expect(screen.getByText('syllabus.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Parse 1 File/i })).toBeInTheDocument()
  })

  it('prompts for auth (and does not upload) when not signed in', async () => {
    const onNeedAuth = vi.fn()
    render(<UploadZone authed={false} onComplete={vi.fn()} onNeedAuth={onNeedAuth} />)
    const file = new File(['%PDF-1.4'], 'syllabus.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput(), file)
    await userEvent.click(screen.getByRole('button', { name: /Parse 1 File/i }))

    expect(onNeedAuth).toHaveBeenCalledOnce()
    expect(mockApi.uploadSyllabus).not.toHaveBeenCalled()
  })

  it('ignores files with unsupported extensions', async () => {
    render(<UploadZone authed onComplete={vi.fn()} onNeedAuth={vi.fn()} />)
    const file = new File(['x'], 'notes.exe', { type: 'application/octet-stream' })
    await userEvent.upload(fileInput(), file)
    expect(screen.queryByText('notes.exe')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Parse/i })).not.toBeInTheDocument()
  })
})
