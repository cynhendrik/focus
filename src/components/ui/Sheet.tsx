import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Max-width of the modal card. Default 460px. */
  width?: number | string
  /** Disable closing via backdrop click. Default false. */
  lockBackdrop?: boolean
}

/**
 * Centered modal rendered into `document.body` via Portal.
 *
 * The portal is essential: any ancestor with a `transform`, `filter`, or
 * `perspective` (like our route-transition wrapper) traps `position: fixed`
 * inside its own bounding box, which makes overlays look like dim rectangles
 * instead of full-screen sheets. Rendering at body level sidesteps that.
 */
export function Modal({ open, onClose, children, width = 460, lockBackdrop = false }: Props) {
  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // ESC closes.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => { if (!lockBackdrop) onClose() }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'oklch(0% 0 0 / 0.45)',
              backdropFilter: 'blur(8px) saturate(140%)',
              WebkitBackdropFilter: 'blur(8px) saturate(140%)',
            }}
          />
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 1001,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16, pointerEvents: 'none',
            }}
          >
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit   ={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.2, 0.7, 0.1, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: width,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-2)',
                pointerEvents: 'auto',
                maxHeight: 'calc(100vh - 48px)',
                overflowY: 'auto',
              }}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  lockBackdrop?: boolean
}

/**
 * Bottom-sheet variant — slides up from the bottom edge.
 * Same portal mechanism as Modal.
 */
export function BottomSheet({ open, onClose, children, lockBackdrop = false }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => { if (!lockBackdrop) onClose() }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'oklch(0% 0 0 / 0.35)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit   ={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.7 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1001,
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              boxShadow: 'var(--shadow-2)',
              maxHeight: '82vh', overflowY: 'auto',
              willChange: 'transform',
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
