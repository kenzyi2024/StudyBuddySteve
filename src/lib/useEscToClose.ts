import { useEffect } from 'react'

/** Close a dialog on the Escape key. Pass the dialog's onClose. */
export function useEscToClose(onClose?: (() => void) | null): void {
  useEffect(() => {
    if (!onClose) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
