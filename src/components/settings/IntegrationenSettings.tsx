import { useState } from 'react'
import { useMailStore } from '@/store/mail.store'
import { useUiStore } from '@/store/ui.store'
import { Mail, Video, Webhook, CalendarDays, Landmark, ShoppingBag } from 'lucide-react'
import { IntegrationRow } from '@/components/integrations/IntegrationRow'
import { ZoomSetupModal } from '@/components/integrations/ZoomSetupModal'

export function IntegrationenSettings() {
  const mailAccounts = useMailStore(s => s.accounts)
  const setAppView   = useUiStore(s => s.setAppView)
  const [showZoom, setShowZoom] = useState(false)

  const hasMailAccount = mailAccounts.length > 0

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>

      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Integrationen
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          Verbinde externe Dienste mit Cultera.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          <IntegrationRow
            icon={Mail}
            name="IMAP / SMTP"
            category="E-Mail"
            description="Empfange und sende E-Mails direkt in Cultera über dein eigenes Postfach."
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
            description="Nicht in der Testversion verfügbar — kommt mit der offiziellen Veröffentlichung."
            status="coming_soon"
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

      {showZoom && <ZoomSetupModal onClose={() => setShowZoom(false)} />}
    </div>
  )
}
