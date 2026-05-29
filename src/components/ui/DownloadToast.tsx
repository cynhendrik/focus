import { useEffect, useRef } from 'react'
import { useDownloadToastStore } from '@/store/download-toast.store'
import { FileDown, CheckCircle2, AlertCircle } from 'lucide-react'

export function DownloadToast() {
  const { phase, filename, savedTo, progress, isBatch, reset } = useDownloadToastStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (phase === 'done' || phase === 'error') {
      timerRef.current = setTimeout(() => reset(), 3400)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, reset])

  if (!phase) return null

  const visible = phase !== null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        animation: visible ? 'toast-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both' : undefined,
      }}
    >
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes spin-smooth {
          to { transform: rotate(360deg); }
        }
        @keyframes pop-check {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>

      <div style={{
        minWidth: 300,
        maxWidth: 360,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px oklch(0% 0 0 / 0.35), 0 0 0 1px oklch(100% 0 0 / 0.08)',
        background: 'oklch(16% 0 0 / 0.95)',
        backdropFilter: 'blur(20px)',
      }}>

        {/* Main row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>

          {/* Icon area */}
          <div style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: iconBg(phase) }}>
            {(phase === 'generating' || phase === 'saving') && (
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '2.5px solid oklch(92% 0.2 125 / 0.25)',
                borderTopColor: 'oklch(92% 0.2 125)',
                animation: 'spin-smooth 0.7s linear infinite',
              }} />
            )}
            {phase === 'done' && (
              <CheckCircle2 size={20} style={{ color: 'oklch(88% 0.18 145)', animation: 'pop-check 300ms cubic-bezier(0.34,1.56,0.64,1) both' }} />
            )}
            {phase === 'error' && (
              <AlertCircle size={20} style={{ color: 'oklch(75% 0.2 25)' }} />
            )}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', marginBottom: 2 }}>
              {phaseLabel(phase, isBatch)}
            </div>
            <div style={{ fontSize: 11, color: 'oklch(70% 0 0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {phase === 'done' ? shortPath(savedTo) : filename}
            </div>
          </div>

          {/* File icon */}
          <FileDown size={15} style={{ color: 'oklch(50% 0 0)', flexShrink: 0 }} />
        </div>

        {/* Progress bar (always visible, just at 100% when done) */}
        <div style={{ height: 3, background: 'oklch(25% 0 0)', position: 'relative', overflow: 'hidden' }}>
          {(phase === 'generating' || phase === 'saving') && !isBatch && (
            // Indeterminate shimmer
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, oklch(92% 0.2 125) 40%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.2s linear infinite',
            }} />
          )}
          {isBatch && (phase === 'generating' || phase === 'saving') && (
            <div style={{ height: '100%', width: `${progress}%`, background: 'oklch(92% 0.2 125)', transition: 'width 180ms ease', borderRadius: 2 }} />
          )}
          {phase === 'done' && (
            <div style={{ height: '100%', width: '100%', background: 'oklch(88% 0.18 145)', transition: 'width 300ms ease' }} />
          )}
          {phase === 'error' && (
            <div style={{ height: '100%', width: '100%', background: 'oklch(75% 0.2 25)' }} />
          )}
        </div>
      </div>
    </div>
  )
}

function iconBg(phase: string | null) {
  if (phase === 'done')  return 'oklch(30% 0.06 145)'
  if (phase === 'error') return 'oklch(28% 0.06 25)'
  return 'oklch(22% 0.04 125)'
}

function phaseLabel(phase: string | null, isBatch: boolean) {
  if (phase === 'generating') return isBatch ? 'PDFs werden generiert…' : 'PDF wird generiert…'
  if (phase === 'saving')     return isBatch ? 'ZIP wird gespeichert…' : 'Wird gespeichert…'
  if (phase === 'done')       return isBatch ? 'ZIP gespeichert' : 'PDF gespeichert'
  if (phase === 'error')      return 'Fehler beim Speichern'
  return ''
}

function shortPath(p: string) {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  const last2 = parts.slice(-2).join('/')
  return `…/${last2}`
}
