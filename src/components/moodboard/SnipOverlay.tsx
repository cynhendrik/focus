import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface DragRect { x: number; y: number; w: number; h: number }

export function SnipOverlay() {
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [rect, setRect] = useState<DragRect | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const bgUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    invoke<number[]>('cmd_get_snip_background').then(bytes => {
      if (cancelled) return
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      const url = URL.createObjectURL(blob)
      bgUrlRef.current = url
      setBgUrl(url)
    }).catch(() => {
      void invoke('cmd_cancel_screen_snip')
    })
    return () => {
      cancelled = true
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void invoke('cmd_cancel_screen_snip')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY }
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current
    if (!start) return
    const x = Math.min(start.x, e.clientX)
    const y = Math.min(start.y, e.clientY)
    const w = Math.abs(e.clientX - start.x)
    const h = Math.abs(e.clientY - start.y)
    setRect({ x, y, w, h })
  }

  const onPointerUp = () => {
    const r = rect
    dragStart.current = null
    if (!r) return
    const scale = window.devicePixelRatio || 1
    void invoke('cmd_finish_screen_snip', {
      rect: {
        x: Math.round(r.x * scale),
        y: Math.round(r.y * scale),
        width: Math.round(r.w * scale),
        height: Math.round(r.h * scale),
      },
    })
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={e => { e.preventDefault(); void invoke('cmd_cancel_screen_snip') }}
      style={{ position: 'fixed', inset: 0 }}
    >
      {bgUrl && (
        <img src={bgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
      )}
      {rect && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: rect.y, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: rect.y + rect.h, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: rect.y, width: rect.x, height: rect.h, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: '1px solid #fff' }} />
        </>
      )}
    </div>
  )
}
