import { useLeadsStore } from '@/store/leads.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCustomersStore } from '@/store/customers.store'
import { accountRowToLead, accountRowToAccount } from '@/data/accounts.mapper'
import { accountToCustomer } from '@/data/customers.mapper'

interface AccountChange { eventType: string; new: any; old: any }

function removeFromLeads(id: string) {
  useLeadsStore.setState(s => ({ leads: s.leads.filter(l => l.id !== id) }))
}
function removeFromAccountsAndCustomers(id: string) {
  useAccountsStore.setState(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  useCustomersStore.setState(s => ({ customers: s.customers.filter(c => c.id !== id) }))
}

/** Wendet eine Realtime-Änderung der `accounts`-Tabelle auf leads/accounts/customers an. */
export function applyAccountsRealtimeChange(payload: AccountChange) {
  const newRow = payload.new
  const oldRow = payload.old
  const goneId: string | undefined = newRow?.id ?? oldRow?.id

  if (payload.eventType === 'DELETE') {
    if (goneId) { removeFromLeads(goneId); removeFromAccountsAndCustomers(goneId) }
    return
  }
  if (!newRow) return

  if (newRow.account_type === 'lead') {
    const lead = accountRowToLead(newRow)
    useLeadsStore.setState(s => {
      const exists = s.leads.some(l => l.id === lead.id)
      return { leads: exists ? s.leads.map(l => l.id === lead.id ? lead : l) : [lead, ...s.leads] }
    })
    removeFromAccountsAndCustomers(lead.id)
    return
  }

  // Nicht-Lead (client / null). Private Accounts erscheinen nicht in geteilten Listen.
  if (newRow.is_private === true || newRow.is_private === 1) {
    if (goneId) { removeFromLeads(goneId); removeFromAccountsAndCustomers(goneId) }
    return
  }
  const account = accountRowToAccount(newRow)
  useAccountsStore.setState(s => {
    const exists = s.accounts.some(a => a.id === account.id)
    return { accounts: exists ? s.accounts.map(a => a.id === account.id ? account : a) : [...s.accounts, account] }
  })
  const customer = accountToCustomer(account)
  useCustomersStore.setState(s => {
    const exists = s.customers.some(c => c.id === customer.id)
    return { customers: exists ? s.customers.map(c => c.id === customer.id ? customer : c) : [...s.customers, customer] }
  })
  removeFromLeads(account.id)
}
