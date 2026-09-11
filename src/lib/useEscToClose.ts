import { useEffect } from 'react'

/** Close a dialog on the Escape key. Pass the dialog's onClose. */
export function useEscToClose(onClose) {
  useEffect(() => {
    if (!onClose) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
