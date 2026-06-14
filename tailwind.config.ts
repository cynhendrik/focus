import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Aligned with CSS --accent / --accent-2 (globals.css) so legacy
        // components using `bg-primary` render the same blue as the rest of
        // the app instead of the old lime. Hex literals (not var()) are kept
        // so Tailwind opacity modifiers like `bg-primary/20` keep working.
        primary: {
          DEFAULT: '#3B6DF4',
          light: '#5B86F6',
          dark: '#2D5CDC',
        },

        // ── Design tokens (single source of truth: globals.css :root) ──────
        // Exposes the oklch token system as Tailwind utilities so new code can
        // write `bg-surface`, `text-fg-muted`, `border-border-strong` instead
        // of inline styles — themeable (dark/light/bw) for free via the CSS
        // variables. Note: opacity modifiers (e.g. `bg-surface/50`) are NOT
        // supported on these because the values are full oklch()/var() strings.
        canvas:  { DEFAULT: 'var(--bg)', 2: 'var(--bg-2)' },
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        border:  { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        fg:      { DEFAULT: 'var(--fg)', 2: 'var(--fg-2)', muted: 'var(--fg-muted)', dim: 'var(--fg-dim)' },
        accent:  { DEFAULT: 'var(--accent)', 2: 'var(--accent-2)', ink: 'var(--accent-ink)' },
        danger:  'var(--danger)',
        warn:    'var(--warn)',
        ok:      'var(--ok)',
        info:    'var(--info)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      fontFamily: {
        sans: ['"Geist"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
