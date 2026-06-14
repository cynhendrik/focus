import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Accessible focus management for dialogs: moves focus into the dialog on open,
 * traps Tab within it, and restores focus to the previously focused element on
 * close. Returns a ref to attach to the dialog container.
 *
 * Exported so bespoke modals that can't migrate to <Modal> yet (e.g. ones with
 * their own entrance animation) can still get a focus trap by attaching this
 * ref and adding `role="dialog" aria-modal="true"`.
 *
 * Pass `onClose` to also close the dialog on Escape. Omit it if the modal
 * already wires its own Escape handler (avoids closing twice).
 */
export function useDialogFocus(open: boolean, onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const node = ref.current
    const prevFocus = document.activeElement as HTMLElement | null
    const SELECTOR =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    // Move focus into the dialog (first focusable, else the container itself).
    const initial = node?.querySelectorAll<HTMLElement>(SELECTOR)
    ;(initial && initial.length ? initial[0] : node)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) { onClose(); return }
      if (e.key !== 'Tab' || !node) return
      const f = node.querySelectorAll<HTMLElement>(SELECTOR)
      if (f.length === 0) { e.preventDefault(); return }
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocus?.focus?.()
    }
  }, [open, onClose])
  return ref
}

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Max-width of the modal card. Default 460px. */
  width?: number | string
  /** Disable closing via backdrop click. Default false. */
  lockBackdrop?: boolean
  /** Accessible name for the dialog (use when there is no visible title). */
  ariaLabel?: string
  /** ID of the element labelling the dialog (e.g. the heading). */
  labelledBy?: string
}

/**
 * Centered modal rendered into `document.body` via Portal.
 *
 * The portal is essential: any ancestor with a `transform`, `filter`, or
 * `perspective` (like our route-transition wrapper) traps `position: fixed`
 * inside its own bounding box, which makes overlays look like dim rectangles
 * instead of full-screen sheets. Rendering at body level sidesteps that.
 */
export function Modal({ open, onClose, children, width = 460, lockBackdrop = false, ariaLabel, labelledBy }: Props) {
  const cardRef = useDialogFocus(open)

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
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              aria-labelledby={labelledBy}
              tabIndex={-1}
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
  /** Accessible name for the dialog (use when there is no visible title). */
  ariaLabel?: string
  /** ID of the element labelling the dialog (e.g. the heading). */
  labelledBy?: string
}

/**
 * Bottom-sheet variant — slides up from the bottom edge.
 * Same portal mechanism as Modal.
 */
export function BottomSheet({ open, onClose, children, lockBackdrop = false, ariaLabel, labelledBy }: BottomSheetProps) {
  const sheetRef = useDialogFocus(open)

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
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            tabIndex={-1}
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
