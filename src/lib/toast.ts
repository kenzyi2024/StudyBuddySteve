import { createContext, useContext } from 'react'

/** Show a short message; errors stay up longer. See components/ToastProvider. */
export interface ToastApi {
  ok: (text: string) => void
  error: (text: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

// Outside a provider (e.g. isolated component tests) toasts are no-ops.
const NOOP: ToastApi = { ok: () => {}, error: () => {} }
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP
}
