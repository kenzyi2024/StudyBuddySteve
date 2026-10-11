import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

  const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

  it('parses every queued file, in order, and hands all results up', async () => {
    mockApi.uploadSyllabus.mockResolvedValueOnce({ jobId: 'c1' }).mockResolvedValueOnce({ jobId: 'c2' })
    mockApi.pollJob
      .mockResolvedValueOnce({ jobId: 'c1', status: 'done', events: [{ id: 'e1' }] })
      .mockResolvedValueOnce({ jobId: 'c2', status: 'done', events: [] })
    const onComplete = vi.fn()
    render(<UploadZone authed onComplete={onComplete} onNeedAuth={vi.fn()} />)
    await userEvent.upload(fileInput(), [pdf('cs101.pdf'), pdf('bio200.pdf')])
    await userEvent.click(screen.getByRole('button', { name: /Parse 2 Files/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce(), { timeout: 2000 })
    expect(mockApi.uploadSyllabus.mock.calls.map((c) => c[0].name)).toEqual(['cs101.pdf', 'bio200.pdf'])
    expect(onComplete).toHaveBeenCalledWith(
      [
        { courseId: 'c1', events: [{ id: 'e1' }], fileName: 'cs101.pdf' },
        { courseId: 'c2', events: [], fileName: 'bio200.pdf' },
      ],
      [],
    )
  })

  it('keeps going when one file fails, and reports it', async () => {
    mockApi.uploadSyllabus.mockResolvedValueOnce({ jobId: 'c1' }).mockResolvedValueOnce({ jobId: 'c2' })
    mockApi.pollJob
      .mockResolvedValueOnce({ jobId: 'c1', status: 'error', events: [] })
      .mockResolvedValueOnce({ jobId: 'c2', status: 'done', events: [] })
    const onComplete = vi.fn()
    render(<UploadZone authed onComplete={onComplete} onNeedAuth={vi.fn()} />)
    await userEvent.upload(fileInput(), [pdf('scan.pdf'), pdf('good.pdf')])
    await userEvent.click(screen.getByRole('button', { name: /Parse 2 Files/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce(), { timeout: 2000 })
    const [results, failures] = onComplete.mock.calls[0]
    expect(results.map((r: { fileName: string }) => r.fileName)).toEqual(['good.pdf'])
    expect(failures).toEqual(['scan.pdf: Steve couldn’t read it'])
  })

  it('shows an error and keeps the failed files queued when nothing parses', async () => {
    mockApi.uploadSyllabus.mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }))
    const onComplete = vi.fn()
    render(<UploadZone authed onComplete={onComplete} onNeedAuth={vi.fn()} />)
    await userEvent.upload(fileInput(), pdf('cs101.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /Parse 1 File/i }))

    expect(await screen.findByText(/cs101\.pdf: Server error/)).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Parse 1 File/i })).toBeInTheDocument() // retry
  })

  it('tells the student which files were skipped and why', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<UploadZone authed onComplete={vi.fn()} onNeedAuth={vi.fn()} />)
    await user.upload(fileInput(), [new File(['x'], 'notes.exe'), pdf('ok.pdf')])
    expect(screen.getByText(/Skipped notes\.exe \(not a PDF, DOCX, or image\)/)).toBeInTheDocument()
    expect(screen.getByText('ok.pdf')).toBeInTheDocument()
  })

  it('shows which file is being parsed', async () => {
    let finishFirst: (v: unknown) => void = () => {}
    mockApi.uploadSyllabus.mockResolvedValue({ jobId: 'c1' })
    mockApi.pollJob.mockReturnValueOnce(new Promise((r) => (finishFirst = r)))
    render(<UploadZone authed onComplete={vi.fn()} onNeedAuth={vi.fn()} />)
    await userEvent.upload(fileInput(), [pdf('cs101.pdf'), pdf('bio200.pdf')])
    await userEvent.click(screen.getByRole('button', { name: /Parse 2 Files/i }))
    expect(await screen.findByText('file 1 of 2 · cs101.pdf')).toBeInTheDocument()
    finishFirst({ jobId: 'c1', status: 'done', events: [] })
  })
})
