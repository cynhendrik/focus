import { useState, useCallback } from 'react'
import { useCompanyStore } from '@/store/company.store'
import { useMailStore } from '@/store/mail.store'
import { useUiStore } from '@/store/ui.store'
import type { CompanyModules } from '@/types/company.types'
import {
  Users, CreditCard, Mail, Calendar, Target,
  Megaphone, Zap, Sparkles, LockKeyhole,
  Video, Webhook, CalendarDays, Landmark, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { IntegrationRow } from '@/components/integrations/IntegrationRow'
import { ZoomSetupModal } from '@/components/integrations/ZoomSetupModal'
import { WebhookInfoModal } from '@/components/integrations/WebhookInfoModal'

interface ModuleDef {
  key: keyof CompanyModules
  label: string
  icon: LucideIcon
  color: string
  badge?: 'lizenz' | 'beta' | 'ki' | 'addon'
  defaultOn: boolean
}

const MODULES: ModuleDef[] = [
  { key: 'crm',       label: 'CRM',           icon: Users,     color: 'oklch(60% 0.18 240)', badge: 'lizenz', defaultOn: true  },
  { key: 'finanzen',  label: 'Finanzen',       icon: CreditCard,color: 'oklch(65% 0.18 140)', badge: 'lizenz', defaultOn: true  },
  { key: 'focus',     label: 'Focus',          icon: Zap,       color: 'var(--accent)',                        defaultOn: true  },
  { key: 'mail',      label: 'Mail',           icon: Mail,      color: 'oklch(60% 0.15 260)',                  defaultOn: true  },
  { key: 'kalender',  label: 'Kalender',       icon: Calendar,  color: 'oklch(65% 0.16 200)',                  defaultOn: true  },
  { key: 'leads',     label: 'Lead Management',icon: Target,    color: 'oklch(68% 0.2 50)',   badge: 'addon',  defaultOn: true  },
  { key: 'kampagnen', label: 'Kampagnen',      icon: Megaphone, color: 'oklch(62% 0.18 320)', badge: 'addon',  defaultOn: false },
  { key: 'corra',     label: 'KORA KI',        icon: Sparkles,  color: 'var(--accent)',        badge: 'ki',    defaultOn: false },
]

const BADGE_CONFIG = {
  lizenz: { label: 'Lizenz',  bg: 'oklch(60% 0.18 240 / 0.12)', color: 'oklch(60% 0.18 240)' },
  beta:   { label: 'Beta',    bg: 'oklch(65% 0.18 50 / 0.12)',   color: 'oklch(65% 0.18 50)'  },
  ki:     { label: 'KI',      bg: 'var(--accent-soft)',           color: 'var(--accent)'        },
  addon:  { label: 'Add-on',  bg: 'oklch(50% 0 0 / 0.08)',        color: 'var(--fg-muted)'      },
}

const WEBHOOK_CONFIGURED = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_LEAD_WEBHOOK_SECRET
)

function Toggle({ on, onChange, saving }: { on: boolean; onChange: () => void; saving?: boolean }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onChange() }}
      disabled={saving}
      role="switch"
      aria-checked={on}
      style={{
        width: 36, height: 20, borderRadius: 99, flexShrink: 0,
        background: on ? 'var(--accent)' : 'oklch(50% 0 0 / 0.18)',
        border: 'none', cursor: saving ? 'wait' : 'pointer',
        position: 'relative', transition: 'background 200ms',
        opacity: saving ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: 99,
        background: on ? 'var(--accent-ink)' : 'oklch(70% 0 0)',
        transition: 'left 180ms cubic-bezier(.4,0,.2,1)',
      }} />
    </button>
  )
}

export function IntegrationenSettings() {
  const modules     = useCompanyStore(s => s.modules)
  const saveModules = useCompanyStore(s => s.saveModules)
  const mailAccounts   = useMailStore(s => s.accounts)
  const setAppView     = useUiStore(s => s.setAppView)
  const [saving, setSaving] = useState<keyof CompanyModules | null>(null)
  const [showZoom,    setShowZoom]    = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  const hasMailAccount = mailAccounts.length > 0

  const isOn = useCallback((key: keyof CompanyModules, defaultOn: boolean): boolean => {
    const val = modules[key]
    return val === undefined ? defaultOn : !!val
  }, [modules])

  const handleToggle = async (key: keyof CompanyModules, defaultOn: boolean) => {
    if (saving) return
    setSaving(key)
    try {
      await saveModules({ ...modules, [key]: !isOn(key, defaultOn) })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* Header */}
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Module & Integrationen
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          Aktiviere Module und verbinde externe Dienste.
        </p>
      </div>

      {/* Module-Grid */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', marginBottom: 12,
        }}>
          Module
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 8,
        }}>
          {MODULES.map(mod => {
            const Icon    = mod.icon
            const on      = isOn(mod.key, mod.defaultOn)
            const badge   = mod.badge ? BADGE_CONFIG[mod.badge] : null
            const isSaving = saving === mod.key

            return (
              <div
                key={mod.key}
                onClick={() => handleToggle(mod.key, mod.defaultOn)}
                style={{
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--border)' : 'oklch(50% 0 0 / 0.07)'}`,
                  background: 'var(--surface-2)',
                  opacity: on ? 1 : 0.5,
                  transition: 'opacity 200ms, border-color 200ms',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: on ? `${mod.color}18` : 'oklch(50% 0 0 / 0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 200ms',
                  }}>
                    <Icon size={17} style={{ color: on ? mod.color : 'var(--fg-dim)', transition: 'color 200ms' }} />
                  </div>
                  <Toggle on={on} onChange={() => handleToggle(mod.key, mod.defaultOn)} saving={isSaving} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginBottom: badge ? 4 : 0 }}>
                    {mod.label}
                  </div>
                  {badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                      textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                      padding: '1px 6px', borderRadius: 99,
                      background: badge.bg, color: badge.color,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                      {mod.badge === 'lizenz' && <LockKeyhole size={7} />}
                      {badge.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Integrationen */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', marginBottom: 12,
        }}>
          Integrationen
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          <IntegrationRow
            icon={Mail}
            name="IMAP / SMTP"
            category="E-Mail"
            description="Empfange und sende E-Mails direkt in Cynera über dein eigenes Postfach."
            status={hasMailAccount ? 'connected' : 'disconnected'}
            connectedDetail={mailAccounts[0]?.email}
            onAction={() => setAppView('mail')}
            actionLabel={hasMailAccount ? 'Verwalten' : 'Verbinden →'}
          />

          <IntegrationRow
            icon={Video}
            name="Zoom"
            category="Webinar Lead-Import"
            description="Importiere Teilnehmer aus Zoom-Webinaren automatisch als Leads."
            status="disconnected"
            onAction={() => setShowZoom(true)}
            actionLabel="Einrichten →"
          />

          <IntegrationRow
            icon={Webhook}
            name="Webhook"
            category="Lead-Eingang"
            description="Empfange Leads von deiner Website, Zapier oder externen Formularen."
            status={WEBHOOK_CONFIGURED ? 'connected' : 'disconnected'}
            connectedLabel="URL bereit"
            connectedDetail="Kein Setup nötig — URL kopieren & eintragen"
            onAction={WEBHOOK_CONFIGURED ? () => setShowWebhook(true) : undefined}
            actionLabel="URL anzeigen"
          />

          <IntegrationRow
            icon={CalendarDays}
            name="Google Calendar / Outlook"
            category="Kalender-Sync"
            description="Synchronisiere Termine bidirektional mit deinem externen Kalender."
            status="coming_soon"
          />

          <div style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
            In Entwicklung
          </div>

          <IntegrationRow
            icon={Landmark}
            name="Bank"
            category="Finanzsystem"
            description="Verknüpfe dein Geschäftskonto für automatischen Zahlungsabgleich."
            status="coming_soon"
          />

          <IntegrationRow
            icon={ShoppingBag}
            name="Shopify"
            category="E-Commerce"
            description="Verbinde deinen Shopify-Shop mit dem Finanzsystem."
            status="coming_soon"
          />

        </div>
      </div>

      {showZoom    && <ZoomSetupModal    onClose={() => setShowZoom(false)} />}
      {showWebhook && <WebhookInfoModal  onClose={() => setShowWebhook(false)} />}
    </div>
  )
}
