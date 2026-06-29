import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface Props {
  onDone: () => void
}

/**
 * Einmaliger Willkommens-Auftritt beim ersten Start: geschichtete Aurora-Glows
 * in Brand-Palette, Vignette, feines Korn, Titel mit Glanz-Sweep. Enter oder
 * Klick auf „Los geht's" beendet ihn.
 */
export function WelcomeIntro({ onDone }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.1, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500, overflow: 'hidden',
        background: 'radial-gradient(120% 90% at 50% 18%, #0d1322 0%, #07090e 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Aurora-Schichten */}
      <div className="aurora-rot" />
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-blob aurora-blob-c" />
      <div className="aurora-vignette" />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.15, duration: 1.1, ease: [0.2, 0.7, 0.1, 1] }}
        style={{ position: 'relative', zIndex: 4, textAlign: 'center' }}
      >
        <h1 className="aurora-title">Willkommen.</h1>
        <p style={{
          marginTop: 14, fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
          letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(180,200,235,0.62)',
        }}>
          Dein Cultera OS ist bereit
        </p>
        <button
          type="button"
          onClick={onDone}
          style={{
            marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '10px 20px', borderRadius: 99, cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(140,175,255,0.28)',
            color: '#dfe8ff', fontSize: 13, backdropFilter: 'blur(6px)',
          }}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9fb6ff' }}>↵</span>
          Los geht's
        </button>
      </motion.div>
    </motion.div>
  )
}
