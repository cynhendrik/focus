import { useState } from 'react'
import { Mail, Video, Webhook, CalendarDays, Landmark, ShoppingBag } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { IntegrationRow } from '@/components/integrations/IntegrationRow'
import { ZoomSetupModal } from '@/components/integrations/ZoomSetupModal'
import { WebhookInfoModal } from '@/components/integrations/WebhookInfoModal'
import { useUiStore } from '@/store/ui.store'

export function IntegrationsRoute() {
  const mailAccounts   = useMailStore(s => s.accounts)
  const setAppView     = useUiStore(s => s.setAppView)
  const hasMailAccount = mailAccounts.length > 0

  const [showZoom,    setShowZoom]    = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Integrationen.</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Verbinde externe Dienste mit Cynera
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <IntegrationRow
            icon={Mail}
            name="IMAP / SMTP"
            category="E-Mail"
            description="Empfange und sende E-Mails direkt in Cynera über dein eigenes Postfach. Unterstützt alle IMAP-fähigen Anbieter (Gmail, Outlook, iCloud, etc.)."
            status={hasMailAccount ? 'connected' : 'disconnected'}
            connectedDetail={mailAccounts[0]?.email}
            onAction={() => setAppView('mail')}
            actionLabel={hasMailAccount ? 'Verwalten' : 'Verbinden →'}
          />

          <IntegrationRow
            icon={Video}
            name="Zoom"
            category="Webinar Lead-Import"
            description="Importiere Teilnehmer aus Zoom-Webinaren automatisch als Leads in Cynera. Einrichtung via Webhook in deinen Zoom-Einstellungen."
            status="disconnected"
            onAction={() => setShowZoom(true)}
            actionLabel="Einrichten →"
          />

          <IntegrationRow
            icon={Webhook}
            name="Webhook"
            category="Lead-Eingang"
            description="Empfange Leads von deiner Website, Wix, Zapier oder externen Formularen automatisch. Deine persönliche Webhook-URL ist immer aktiv."
            status="connected"
            connectedDetail="Webhook aktiv"
            onAction={() => setShowWebhook(true)}
            actionLabel="URL anzeigen"
          />

          <IntegrationRow
            icon={CalendarDays}
            name="Google Calendar / Outlook"
            category="Kalender-Sync"
            description="Synchronisiere Termine bidirektional mit deinem Google Calendar oder Outlook. Cynera-Termine erscheinen in deinem Kalender und umgekehrt."
            status="disconnected"
          />

          <div style={{ margin: '8px 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            In Entwicklung
          </div>

          <IntegrationRow
            icon={Landmark}
            name="Bank"
            category="Finanzsystem"
            description="Verknüpfe dein Geschäftskonto für automatischen Zahlungsabgleich mit deinen Rechnungen in Cynera."
            status="coming_soon"
          />

          <IntegrationRow
            icon={ShoppingBag}
            name="Shopify"
            category="E-Commerce"
            description="Verbinde deinen Shopify-Shop. Bestellungen und Umsatzdaten fließen automatisch in das Finanzsystem."
            status="coming_soon"
          />

        </div>
      </div>

      {showZoom    && <ZoomSetupModal    onClose={() => setShowZoom(false)} />}
      {showWebhook && <WebhookInfoModal  onClose={() => setShowWebhook(false)} />}
    </div>
  )
}
