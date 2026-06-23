import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Plus, LogIn, LogOut, Users, ArrowRight } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Role } from '@/lib/capabilities'

const ROLE_LABEL: Record<Role, string> = { owner: 'Inhaber', admin: 'Admin', member: 'Mitglied' }

type Mode = 'menu' | 'create' | 'join'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function WorkspaceSwitcher() {
  const workspaces  = useWorkspaceStore(s => s.workspaces)
  const activeId    = useWorkspaceStore(s => s.activeWorkspaceId)
  const setActive   = useWorkspaceStore(s => s.setActiveWorkspace)
  const create      = useWorkspaceStore(s => s.createWorkspace)
  const joinByCode  = useWorkspaceStore(s => s.joinWorkspaceByCode)
  const isOnline    = useWorkspaceStore(s => s.isOnline)
  const signOut     = useAuthStore(s => s.signOut)

  const [open, setOpen]   = useState(false)
  const [mode, setMode]   = useState<Mode>('menu')
  const [value, setValue] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const active = workspaces.find(w => w.id === activeId)

  const reset = () => { setMode('menu'); setValue(''); setError(null); setBusy(false) }
  const close = () => { setOpen(false); reset() }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v || busy) return
    setBusy(true); setError(null)
    try {
      if (mode === 'create') await create(v)
      else await joinByCode(v)
      close()
    } catch (err: any) {
      setError(err?.message ?? (mode === 'create' ? 'Konnte nicht erstellt werden.' : 'Code ungültig oder Beitritt fehlgeschlagen.'))
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="ws-switcher">
      <button
        type="button"
        className="ws-trigger"
        onClick={() => (open ? close() : setOpen(true))}
        data-open={open ? 'true' : 'false'}
        title={active?.name ?? 'Workspace wählen'}
      >
        <span className="ws-avatar">{active ? initials(active.name) : '?'}</span>
        <span className="ws-trigger__body">
          <span className="ws-trigger__name">{active?.name ?? 'Kein Workspace'}</span>
          <span className="ws-trigger__meta">
            {active ? ROLE_LABEL[active.role] : 'wählen'}
            {active?.isShared && <span className="ws-shared"><Users size={9} strokeWidth={2.5} />geteilt</span>}
          </span>
        </span>
        {!isOnline && <span className="ws-offline" title="Offline — Änderungen werden später synchronisiert" />}
        <ChevronDown size={14} className="ws-chevron" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="ws-menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.1, 1] }}
          >
            {mode === 'menu' && (
              <>
                <div className="ws-menu__label">Deine Workspaces</div>
                <div className="ws-menu__list">
                  {workspaces.length === 0 && (
                    <div className="ws-empty">Noch kein Workspace — leg unten einen an oder tritt einem bei.</div>
                  )}
                  {workspaces.map(ws => {
                    const isActive = ws.id === activeId
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        className="ws-row"
                        data-active={isActive ? 'true' : 'false'}
                        onClick={() => { setActive(ws.id); close() }}
                      >
                        <span className="ws-avatar ws-avatar--sm">{initials(ws.name)}</span>
                        <span className="ws-row__body">
                          <span className="ws-row__name">{ws.name}</span>
                          <span className="ws-row__meta">
                            {ROLE_LABEL[ws.role]}{ws.isShared ? ' · geteilt' : ''}
                          </span>
                        </span>
                        {isActive && <Check size={15} className="ws-row__check" />}
                      </button>
                    )
                  })}
                </div>

                <div className="ws-divider" />

                <button type="button" className="ws-action" onClick={() => { setMode('create'); setValue(''); setError(null) }}>
                  <span className="ws-action__icon"><Plus size={15} /></span>
                  Neuer Workspace
                </button>
                <button type="button" className="ws-action" onClick={() => { setMode('join'); setValue(''); setError(null) }}>
                  <span className="ws-action__icon"><LogIn size={15} /></span>
                  Workspace beitreten
                </button>

                <div className="ws-divider" />

                <button type="button" className="ws-action ws-action--danger" onClick={signOut}>
                  <span className="ws-action__icon"><LogOut size={15} /></span>
                  Ausloggen
                </button>
              </>
            )}

            {mode !== 'menu' && (
              <form className="ws-form" onSubmit={submit}>
                <div className="ws-form__label">
                  {mode === 'create' ? 'Neuer Workspace' : 'Workspace beitreten'}
                </div>
                <div className="ws-form__row">
                  <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(mode === 'join' ? e.target.value.toUpperCase() : e.target.value)}
                    placeholder={mode === 'create' ? 'z.B. Agentur Müller' : 'Beitritts-Code'}
                    maxLength={mode === 'join' ? 8 : 60}
                    className="ws-input"
                    style={mode === 'join' ? { fontFamily: 'var(--font-mono)', letterSpacing: '0.18em' } : undefined}
                    disabled={busy}
                  />
                  <button type="submit" className="ws-submit" disabled={!value.trim() || busy} aria-label="Bestätigen">
                    <ArrowRight size={15} />
                  </button>
                </div>
                <p className="ws-form__hint">
                  {mode === 'create' ? 'Du wirst Inhaber dieses Workspace.' : 'Du trittst als Mitglied bei.'}
                </p>
                {error && <p className="ws-form__error">{error}</p>}
                <button type="button" className="ws-form__back" onClick={reset} disabled={busy}>← zurück</button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
