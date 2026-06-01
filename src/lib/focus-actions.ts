import type { CustomerTab } from '@/store/ui.store'

export type FocusActionType = 'invoice' | 'offer' | 'mail' | 'call' | 'followup'

export interface FocusActionConfig {
  label: string
  icon: string           // lucide icon name, resolved in component
  customerTab: CustomerTab
  globalView: string
}

const PATTERNS: Array<{ type: FocusActionType; pattern: RegExp }> = [
  { type: 'invoice',  pattern: /rechnung|invoice|faktura|abrechnung|fakturier/i },
  { type: 'offer',    pattern: /angebot|offer|quote|proposal/i },
  { type: 'mail',     pattern: /\bmail\b|e-mail|email|antwort(en)?|reply/i },
  { type: 'call',     pattern: /\bcall\b|telefon|anrufen|telefonat/i },
  { type: 'followup', pattern: /nachfassen|follow.?up|nachhalten|wiedervorlage/i },
]

const CONFIGS: Record<FocusActionType, FocusActionConfig> = {
  invoice:  { label: 'Rechnung erstellen',  icon: 'FileText', customerTab: 'finanzen',       globalView: 'invoices'  },
  offer:    { label: 'Angebot erstellen',   icon: 'Tag',      customerTab: 'finanzen',       globalView: 'invoices'  },
  mail:     { label: 'Mail öffnen',         icon: 'Mail',     customerTab: 'kommunikation',  globalView: 'mail'      },
  call:     { label: 'Kunden öffnen',       icon: 'Phone',    customerTab: 'cockpit',        globalView: 'clients'   },
  followup: { label: 'Nachfassen',          icon: 'Reply',    customerTab: 'kommunikation',  globalView: 'followups' },
}

export function detectFocusAction(title: string): FocusActionType | null {
  for (const { type, pattern } of PATTERNS) {
    if (pattern.test(title)) return type
  }
  return null
}

export function getFocusActionConfig(type: FocusActionType): FocusActionConfig {
  return CONFIGS[type]
}
