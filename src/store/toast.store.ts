import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  action?: ToastAction
  variant?: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: Toast[]
  show: (input: { message: string; action?: ToastAction; variant?: Toast['variant']; durationMs?: number }) => void
  dismiss: (id: string) => void
}

const DEFAULT_DURATION = 4000

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: ({ message, action, variant = 'success', durationMs = DEFAULT_DURATION }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set(s => ({ toasts: [...s.toasts, { id, message, action, variant }] }))
    setTimeout(() => get().dismiss(id), durationMs)
  },

  dismiss: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },
}))
