import { useCustomersStore } from '@/store/customers.store'

interface Props {
  customerId: string
}

export function CustomerRoute({ customerId }: Props) {
  const customer = useCustomersStore(
    s => s.customers.find(c => c.id === customerId)
  )

  if (!customer) {
    return (
      <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[var(--text)]">{customer.name}</h1>
      {customer.company && (
        <p className="text-[var(--text2)]">{customer.company}</p>
      )}
      <div className="mt-2 flex gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg1)] text-[var(--text2)]">
          {customer.status}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg1)] text-[var(--text2)]">
          {customer.priority}
        </span>
      </div>
    </div>
  )
}
