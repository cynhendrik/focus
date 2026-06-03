interface Props {
  onSelect: (prompt: string) => void
}

const PROMPTS = [
  'Was ist heute wichtig?',
  'Überfällige Rechnungen?',
  'Neue Kunden-Mails?',
  'Meine Todos diese Woche?',
] as const

export function CorraSuggestedPrompts({ onSelect }: Props) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
      {PROMPTS.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          style={{
            padding: '4px 11px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            color: 'var(--fg-dim)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 150ms',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--fg)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-dim)'
          }}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
