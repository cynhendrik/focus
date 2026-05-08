import type { Customer } from '@/types/customer.types'

interface Props {
  customer: Customer
  isSelected: boolean
  onClick: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-blue-500',
  aktiv: 'bg-green-500',
  inaktiv: 'bg-gray-400',
  lost: 'bg-red-400',
}

export function CustomerCard({ customer, isSelected, onClick }: Props) {
  const initials = customer.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <button
      onClick={() => onClick(customer.id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
        ${isSelected
          ? 'bg-primary text-white'
          : 'hover:bg-[var(--bg1)] text-[var(--text)]'
        }`}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{customer.name}</p>
        {customer.company && (
          <p className="text-xs text-[var(--text2)] truncate">{customer.company}</p>
        )}
      </div>
      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${STATUS_COLORS[customer.status] ?? 'bg-gray-400'}`} />
    </button>
  )
}
