# Bulk-Newcomer→Lead-Promotion

## Kontext

CRM-Audit 2026-07-04 (Memory `crm-audit-2026-07-04`): „Newcomer→Lead nur einzeln." In `src/routes/leverage/LeverageMailRoute.tsx` kann jeder unbekannte Absender („mögliche Leads"-Kandidat) nur einzeln per aufgeklapptem Formular zu einem Lead befördert werden (`UnknownMailRow` → `handleSubmit` → `onCreateLead`). Bei vielen Kandidaten (z.B. nach einem Newsletter-Import oder Messebesuch) ist das mühsam.

Zweiter, unabhängiger Teil derselben Audit-Zeile: „Lead-Mail-Compose" — bereits umgesetzt (siehe `docs/superpowers/specs/2026-07-06-lead-mail-compose-design.md`, gemerged). Diese Spec behandelt nur den Bulk-Teil.

## Scope

Nur `src/routes/leverage/LeverageMailRoute.tsx`. Keine neue Komponente, kein neuer Service, kein Rust-/DB-Code — `handleCreateLead` (Zeile 395-404) und `useLeadsStore.upsert` existieren bereits und werden pro Kandidat einfach mehrfach aufgerufen.

**Wiederverwendetes Muster:** Mehrfachauswahl exakt wie in `src/components/mail/CreateCampaignModal.tsx:60,135-141,143-149,196,350,370` — `Set<string> selectedIds`, `toggleItem`/`toggleAll`, Checkbox-Kopfzeile „Alle auswählen (N)" + Checkbox pro Zeile.

## Änderungen

1. **Neuer State** in `LeverageMailRoute`: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())` und `const [bulkCreating, setBulkCreating] = useState(false)`.

2. **`UnknownMailRow`** bekommt zwei neue Props: `selected: boolean`, `onToggleSelect: () => void`. Neue Checkbox links vom bestehenden Chevron (Grid-Spalten `'16px 1fr auto auto auto'` → `'20px 16px 1fr auto auto auto'`):
   ```tsx
   <input
     type="checkbox"
     checked={selected}
     onChange={e => { e.stopPropagation(); onToggleSelect() }}
     onClick={e => e.stopPropagation()}
   />
   ```
   (Klick auf die Checkbox darf die Zeile nicht gleichzeitig auf-/zuklappen — `stopPropagation` analog dem bestehenden „Kein Lead"-Button, Zeile 188.)

3. **Sektionsüberschrift der Kandidaten** (Zeile 427-441) bekommt eine „Alle auswählen"-Zeile direkt über der Liste (nur wenn `candidates.length > 0`):
   ```tsx
   <label style={{
     display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', cursor: 'pointer',
     borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)',
   }}>
     <input
       type="checkbox"
       checked={candidates.length > 0 && candidates.every(m => selectedIds.has(m.id))}
       onChange={toggleAll}
     />
     Alle auswählen ({candidates.length})
   </label>
   ```
   plus ein Bulk-Button daneben/darüber: „{selectedIds.size} Leads anlegen" — nur sichtbar wenn `selectedIds.size > 0`, `disabled={bulkCreating}`.

4. **`toggleSelect(id)` / `toggleAll()`**: exakt das `Set`-Toggle-Muster aus `CreateCampaignModal.tsx:135-149`, aber bezogen auf `candidates` statt `visibleItems`.

5. **`handleBulkCreateLeads()`** (neue async Funktion):
   ```ts
   async function handleBulkCreateLeads() {
     const targets = candidates.filter(m => selectedIds.has(m.id))
     if (targets.length === 0) return
     setBulkCreating(true)
     const results = await Promise.allSettled(
       targets.map(m => handleCreateLead({ name: m.fromName || m.fromAddr, email: m.fromAddr })),
     )
     const succeededIds = targets
       .filter((_, i) => results[i].status === 'fulfilled')
       .map(m => m.id)
     const failedCount = results.length - succeededIds.length
     setSelectedIds(prev => {
       const next = new Set(prev)
       succeededIds.forEach(id => next.delete(id))
       return next
     })
     setBulkCreating(false)
     showToast({
       message: failedCount === 0
         ? `${succeededIds.length} Lead${succeededIds.length === 1 ? '' : 's'} angelegt.`
         : `${succeededIds.length} von ${targets.length} Leads angelegt, ${failedCount} fehlgeschlagen.`,
       variant: failedCount === 0 ? 'success' : 'error',
     })
   }
   ```
   Erfolgreich angelegte Kandidaten verschwinden ohnehin aus der Kandidatenliste (matchen jetzt als bekannter Lead, siehe Kommentar Zeile 139 „wandert automatisch zu Bekannte Leads"); nur ihre IDs müssen aus `selectedIds` raus, damit die Auswahl nicht auf Karteileichen zeigt. Fehlgeschlagene bleiben ausgewählt und in der Liste stehen — Retry per erneutem Klick auf „N Leads anlegen".

6. **`useToastStore`-Import ergänzen** (noch nicht in dieser Datei importiert): `import { useToastStore } from '@/store/toast.store'`, `const showToast = useToastStore(s => s.show)`.

## Nicht im Scope (bewusst, per Nutzer-Entscheidung)

- Kein Bestätigungsdialog vor dem Bulk-Anlegen (Leads sind einfach löschbar, kein zusätzlicher Reibungspunkt für eine reversible Aktion).
- Keine Telefonnummer-Übernahme, kein Vor-dem-Anlegen-Bearbeiten der Namen im Bulk-Pfad — wer das braucht, nutzt weiterhin die bestehende Einzel-Zeile mit Formular.
- Kein Abbruch bei erstem Fehler — alle ausgewählten Kandidaten werden versucht (`Promise.allSettled`), Fehler werden gesammelt gemeldet.
- Keine Änderung an „Kein Lead"/Ignorieren-Funktion, an `leadMails`/`autoSorted`/`hidden`-Sektionen.

## Tests

`LeverageMailRoute.tsx` hat aktuell keine dedizierte RTL-Testdatei (gleiche Konvention wie `NavSidebar.tsx`/`LeadDetailModal.tsx` — große Routen-Komponenten werden hier nicht RTL-getestet). Die neue Toggle-Logik (`toggleSelect`/`toggleAll`) ist reiner `Set`-Code ohne neue Abstraktion wert (identisch zum bereits ungetesteten Original in `CreateCampaignModal.tsx`) — keine neue Testdatei. Verifikation über volle `npx vitest run`-Regression + `npx tsc --noEmit` + manueller Smoke-Test (Checkbox an/aus, „Alle auswählen", Bulk-Button, Erfolgs-/Fehler-Toast, Retry nach Teilfehler).

## Akzeptanzkriterien

- Jede Newcomer-Kandidaten-Zeile hat eine Checkbox; „Alle auswählen (N)" wählt/entwählt alle Kandidaten auf einmal.
- Bulk-Button zeigt die aktuelle Auswahlgröße, ist nur bei `selectedIds.size > 0` sichtbar und während der Verarbeitung disabled.
- Nach Klick werden alle ausgewählten Kandidaten als Leads angelegt (`leadSource: 'inbox'`, erste offene Stage — identisch zum Einzel-Pfad); erfolgreiche verschwinden aus der Kandidatenliste (bestehendes Matching-Verhalten), fehlgeschlagene bleiben stehen und ausgewählt.
- Sammel-Toast meldet Erfolg bzw. Erfolg+Fehlerzahl.
- `npx vitest run` und `npx tsc --noEmit` bleiben grün.
