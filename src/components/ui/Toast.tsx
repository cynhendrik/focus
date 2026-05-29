// src/components/ui/Toast.tsx
import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore, type Toast as ToastT } from '@/store/toast.store'
import { X } from 'lucide-react'

const VARIANT_BG: Record<NonNullable<ToastT['variant']>, string> = {
  success: 'var(--accent)',
  error:   'oklch(65% 0.22 25)',
  info:    'var(--surface-2)',
}

const VARIANT_FG: Record<NonNullable<ToastT['variant']>, string> = {
  success: 'var(--accent-ink)',
  error:   '#fff',
  info:    'var(--fg)',
}

export function ToastViewport() {
  const toasts  = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map(t => {
          const variant = t.variant ?? 'success'
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: VARIANT_BG[variant],
                color: VARIANT_FG[variant],
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                fontSize: 13, fontWeight: 500,
                pointerEvents: 'auto',
                minWidth: 240, maxWidth: 380,
              }}
            >
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                  style={{
                    background: 'rgba(0,0,0,0.12)', border: 'none',
                    padding: '4px 10px', borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    color: VARIANT_FG[variant],
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                title="Schließen"
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: 'pointer', color: VARIANT_FG[variant], opacity: 0.7,
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
