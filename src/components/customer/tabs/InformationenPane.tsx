import { ProfilPane } from './ProfilPane'

interface Props { customerId: string }

/**
 * Stammdaten — der Profil-Editor des Kunden (Adresse, Industrie, Tags, etc.).
 * Notizen wurden nach Arbeiten → Notizen und Activities → Infos ausgelagert,
 * deshalb steht hier nur noch das Profil.
 */
export function InformationenPane({ customerId }: Props) {
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <ProfilPane customerId={customerId} />
    </div>
  )
}
