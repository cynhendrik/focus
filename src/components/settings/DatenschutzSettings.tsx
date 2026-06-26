import type { ReactNode } from 'react'

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        flexShrink: 0, width: 110, fontSize: 11, fontWeight: 600,
        color: 'var(--fg-muted)', textTransform: 'uppercase',
        letterSpacing: '0.04em', paddingTop: 1,
      }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
        {children}
      </div>
    </div>
  )
}

export function DatenschutzSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Datenschutz</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>
          Wie Cultera Focus mit KI-Funktionen und deinen Daten umgeht
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>KI-Funktionen &amp; Datenschutz</h3>

        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg-muted)', margin: 0 }}>
          Cultera Focus bietet KI-gestützte Funktionen — den KORA-Assistenten, Textentwürfe,
          Kunden-Briefings und Mahntext-Vorschläge. Dafür übermitteln wir die jeweils nötigen
          Inhalte an unseren Dienstleister <strong>Anthropic PBC (USA)</strong> und lassen sie
          dort verarbeiten.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoRow label="Wann">
            Nur wenn du eine KI-Funktion aktiv nutzt (KORA anschreiben, Entwurf/Briefing/Mahntext
            anfordern). Ohne deine Aktion gehen keine Daten an die KI.
          </InfoRow>
          <InfoRow label="Welche Daten">
            Je nach Funktion z. B. Kundennamen, Kontaktdaten, Notizen, Rechnungs-/Angebotsdaten
            und deine Chat-Eingaben.
          </InfoRow>
          <InfoRow label="Zweck">
            Erzeugung von Vorschlägen, Entwürfen und Zusammenfassungen.
          </InfoRow>
          <InfoRow label="Anbieter">
            Anthropic PBC, San Francisco, USA. Über die API übermittelte Inhalte werden
            standardmäßig <strong>nicht zum Training</strong> der Modelle verwendet.
          </InfoRow>
        </div>

        <div style={{
          fontSize: 12, color: 'var(--fg-dim)', margin: 0, lineHeight: 1.55,
          paddingTop: 12, borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span>
            <strong>Rechtsgrundlage der USA-Übermittlung:</strong> EU-Standardvertragsklauseln
            (Art. 46 DSGVO); Anthropic ist zudem unter dem EU-US&nbsp;Data&nbsp;Privacy&nbsp;Framework
            zertifiziert. Der Auftragsverarbeitungsvertrag nach Art.&nbsp;28 DSGVO ist Bestandteil von
            Anthropics Commercial&nbsp;Terms&nbsp;of&nbsp;Service (anthropic.com/legal/data-processing-addendum).
          </span>
          <span style={{ fontStyle: 'italic' }}>
            Vollständige Datenschutzerklärung: wird ergänzt.
          </span>
        </div>
      </div>
    </div>
  )
}
