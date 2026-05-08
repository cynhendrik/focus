import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const WORDS = ['If', 'we', 'build,', 'we', 'build', 'to', 'lead']

export function IntroScreen({ onEnter }) {
  const [visible, setVisible] = useState(0)
  const [fading, setFading]   = useState(false)

  useEffect(() => {
    if (visible < WORDS.length) {
      const t = setTimeout(() => setVisible(v => v + 1), 220)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setFading(true), 1800)
    return () => clearTimeout(t)
  }, [visible])

  useEffect(() => {
    if (!fading) return
    const t = setTimeout(onEnter, 800)
    return () => clearTimeout(t)
  }, [fading, onEnter])

  return (
    <motion.div
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      style={{
        height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#ffffff', userSelect: 'none',
      }}
    >
      <p style={{ fontSize: 15, fontWeight: 500, color: '#111', letterSpacing: '0.01em', lineHeight: 1.5, textAlign: 'center' }}>
        {WORDS.map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: i < visible ? 1 : 0, y: i < visible ? 0 : 5 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'inline-block', marginRight: 5 }}
          >
            {word}
          </motion.span>
        ))}
      </p>
    </motion.div>
  )
}
