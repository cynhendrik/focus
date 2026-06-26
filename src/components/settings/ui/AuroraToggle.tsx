interface Props { on: boolean; saving?: boolean; onChange?: () => void }

export function AuroraToggle({ on, saving = false, onChange }: Props) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={saving}
      onClick={(e) => { e.stopPropagation(); onChange?.() }}
      style={{
        width: 44, height: 25, borderRadius: 99, flexShrink: 0, position: 'relative',
        border: 'none', padding: 0, cursor: saving ? 'default' : 'pointer',
        background: on ? 'var(--accent-gradient)' : 'var(--surface-3)',
        boxShadow: on ? '0 0 0 4px var(--accent-soft)' : 'none',
        opacity: saving ? 0.6 : 1, transition: 'background 200ms, box-shadow 200ms',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 22 : 3,
        width: 19, height: 19, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgb(0 0 0 / 0.25)',
        transition: 'left 180ms cubic-bezier(.4,0,.2,1)',
      }} />
    </button>
  )
}
