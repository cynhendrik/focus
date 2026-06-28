import { useState } from 'react'
import { useMailStore } from '@/store/mail.store'
import { useUiStore } from '@/store/ui.store'
import { Mail, Video } from 'lucide-react'
import { IntegrationRow } from '@/components/integrations/IntegrationRow'
import { ZoomSetupModal } from '@/components/integrations/ZoomSetupModal'
import { SettingsPage, SettingsSection } from './ui'

export function IntegrationenSettings() {
  const mailAccounts = useMailStore(s => s.accounts)
  const setAppView   = useUiStore(s => s.setAppView)
  const [showZoom, setShowZoom] = useState(false)

  const hasMailAccount = mailAccounts.length > 0

  return (
    <SettingsPage
      title="Integrationen"
      subtitle="Verbinde externe Dienste mit Cultera."
    >
      <SettingsSection>
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

      </SettingsSection>

      {showZoom && <ZoomSetupModal onClose={() => setShowZoom(false)} />}
    </SettingsPage>
  )
}
