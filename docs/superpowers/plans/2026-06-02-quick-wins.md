# Quick-Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7 unabhängige, risikofreie Verbesserungen — jede < 4h, kein Breaking Change, sofortiger Nutzer-Impact.

**Architecture:** Alle Tasks sind isolierte Änderungen in bestehenden Komponenten. Kein neuer Store, kein neues Schema. Jede Änderung ist unabhängig ausführbar und rollback-sicher.

**Tech Stack:** React 18, TypeScript, Tauri, Zustand, Lucide React, inline styles (kein CSS-Framework)

---

## Task 1: Todo.aiSummary in TasksListView und TasksBoardView anzeigen

**Context:** `Todo.aiSummary` (string | undefined) wird von `TaskComposer` gefüllt aber nirgends angezeigt. Nutzer sieht nie den KI-generierten Kontext.

**Files:**
- Modify: `src/components/tasks/TaskRow.tsx`
- Modify: `src/components/tasks/TaskBoardCard.tsx`
- Modify: `src/components/tasks/TaskFocusCard.tsx`

- [ ] **Lese TaskRow.tsx um die aktuelle Todo-Darstellung zu verstehen**

```bash
cat src/components/tasks/TaskRow.tsx
```

- [ ] **Füge aiSummary-Zeile in TaskRow.tsx ein** — direkt unter dem Titel, nur wenn `todo.aiSummary` vorhanden ist:

```tsx
// In der Render-Funktion, direkt nach dem <span> mit dem Titel:
{todo.aiSummary && (
  <span style={{
    display: 'block',
    fontSize: 11,
    color: 'var(--fg-dim)',
    marginTop: 2,
    fontStyle: 'italic',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  }}>
    {todo.aiSummary}
  </span>
)}
```

- [ ] **Gleiche Änderung in TaskBoardCard.tsx** — gleiche Position (nach Titel), gleicher Style

- [ ] **TypeScript check:**
```bash
cd C:/Users/hendr/Documents/DEV/cyneradev && npx tsc --noEmit 2>&1
```
Expected: keine Fehler

- [ ] **Commit:**
```bash
git add src/components/tasks/TaskRow.tsx src/components/tasks/TaskBoardCard.tsx src/components/tasks/TaskFocusCard.tsx
git commit -m "feat(tasks): show aiSummary under task title"
```

---

## Task 2: Angebot → Rechnung Button in FinanceRoute

**Context:** `FinanceService.convertOfferToInvoice()` (oder `approveInvoiceSuggestion`) existiert. In der Angebots-Tabelle fehlt ein Button "In Rechnung umwandeln". Flow: Angebot accepted → 1 Klick → neue Rechnung mit Angebots-Positionen.

**Files:**
- Read: `src/routes/FinanceRoute.tsx` (Angebots-Tabelle finden)
- Read: `src/store/finance.store.ts` (createInvoice signature)
- Modify: `src/routes/FinanceRoute.tsx`

- [ ] **Lies die Offers-Tabelle in FinanceRoute.tsx:**
```bash
grep -n "offer\|Angebot\|accepted" src/routes/FinanceRoute.tsx | head -30
```

- [ ] **Lies createInvoice Payload-Typ:**
```bash
grep -n "createInvoice\|UpsertInvoicePayload" src/store/finance.store.ts | head -10
grep -n "UpsertInvoicePayload" src/types/finance.types.ts
```

- [ ] **Füge `convertToInvoice`-Handler in FinanceRoute.tsx ein** — in der Nähe der anderen State-Handler:

```tsx
const convertOfferToInvoice = async (offerId: string) => {
  const offer = offers.find(o => o.id === offerId)
  if (!offer || !workspaceId || !userId) return
  try {
    // Lade Offer-Items
    const offerWithItems = await FinanceService.getOffer(offerId)
    await createInvoice({
      workspaceId,
      createdBy: userId,
      accountId: offer.accountId,
      dealId: offer.dealId,
      date: todayStr(),
      dueDate: generateZahlungsziel(todayStr(), profile.zahlungszielTage ?? 14),
      status: 'draft',
      taxMode: offer.taxMode ?? 'standard',
      subtotal: offer.subtotal,
      taxAmount: offer.taxAmount,
      total: offer.total,
      bankInfo: profile.iban ?? '',
      notes: `Aus Angebot ${offer.number ?? offerId.slice(0, 8)} übernommen`,
      isLocked: false,
      isSuggestion: false,
      items: offerWithItems.items.map(i => ({
        title: i.title,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate,
        total: i.total,
        sortOrder: i.sortOrder,
        unit: i.unit,
      })),
    })
    showToast({ message: 'Rechnung aus Angebot erstellt.', variant: 'success' })
    loadAll(workspaceId)
  } catch {
    showToast({ message: 'Fehler beim Umwandeln.', variant: 'error' })
  }
}
```

- [ ] **Füge Button in die Offers-Tabellenzeile ein** (bei `status === 'accepted'`):

```tsx
{offer.status === 'accepted' && (
  <button
    type="button"
    onClick={() => convertOfferToInvoice(offer.id)}
    style={{
      fontSize: 11, padding: '3px 10px', borderRadius: 6,
      background: 'var(--accent)', color: 'var(--accent-ink)',
      border: 'none', cursor: 'pointer', fontWeight: 600,
    }}
  >
    → Rechnung
  </button>
)}
```

- [ ] **Imports prüfen** — `todayStr`, `generateZahlungsziel` aus `@/lib/invoice-engine`, `FinanceService.getOffer` prüfen ob vorhanden:
```bash
grep -n "getOffer\|getInvoice" src/services/finance.service.ts | head -5
```

- [ ] **TypeScript check:**
```bash
npx tsc --noEmit 2>&1
```

- [ ] **Commit:**
```bash
git add src/routes/FinanceRoute.tsx
git commit -m "feat(finance): add offer-to-invoice conversion button"
```

---

## Task 3: Lead-Quelle in Deal speichern beim Konvertieren

**Context:** Wenn ein Lead zu einem Deal konvertiert wird (`convertToDeal`), geht `lead.leadSource` verloren. Nutzer verliert den Audit-Trail "Woher kam dieser Deal?".

**Files:**
- Read: `src/store/leads.store.ts`
- Read: `src-tauri/src/commands/deal.rs` (convertToDeal Command)
- Read: `src/types/pipeline.types.ts` (Deal type)
- Modify: `src/routes/LeadsRoute.tsx` — Deal-Card zeigt leadSource Badge
- Possibly: `src-tauri/src/db/deal.rs` — payload speichern

- [ ] **Lies convertToDeal in leads.store.ts:**
```bash
grep -n "convertToDeal\|leadSource" src/store/leads.store.ts
```

- [ ] **Lies Deal-Typ um zu sehen ob payload/notes vorhanden:**
```bash
grep -n "payload\|notes\|leadSource" src/types/pipeline.types.ts
```

- [ ] **Option A (schnell): Speichere leadSource in deal.notes beim Konvertieren.** Ändere den `convertToDeal`-Aufruf in LeadsRoute.tsx, sodass ein `notes`-Feld mitgegeben wird:

Finde in `src/routes/LeadsRoute.tsx` die Stelle wo `convertToDeal` aufgerufen wird:
```bash
grep -n "convertToDeal" src/routes/LeadsRoute.tsx
```

Erweitere den Aufruf:
```tsx
// Vorher:
await convertToDeal(lead.id, workspaceId, userId)

// Nachher — finde die Methoden-Signatur und passe sie an:
// In leads.store.ts: füge optionales `notes` zu convertToDeal hinzu
// Nutze den leadSource als Tag-Information
```

- [ ] **In `src/store/leads.store.ts` — `convertToDeal` Payload erweitern:**
```bash
grep -n -A 10 "convertToDeal" src/store/leads.store.ts
```

Wenn `convertToDeal` ein notes/description Feld übergeben kann:
```ts
// Finde die invoke() Zeile und ergänze:
invoke('convert_lead_to_deal', {
  leadId: id,
  workspaceId,
  createdBy: userId,
  // Ergänze falls im Rust-Command vorhanden:
  notes: lead.leadSource ? `Lead-Quelle: ${lead.leadSource}` : undefined,
})
```

- [ ] **In PipelineRoute.tsx — leadSource aus Deal.notes lesen und als Badge anzeigen:**
```bash
grep -n "notes\|DealCard\|deal\.notes" src/routes/PipelineRoute.tsx | head -10
```

Füge in der Deal-Karte unter dem Titel hinzu, wenn `deal.notes` "Lead-Quelle:" enthält:
```tsx
{deal.notes?.startsWith('Lead-Quelle:') && (
  <span style={{
    fontSize: 9.5, padding: '1px 6px', borderRadius: 99,
    background: 'oklch(68% 0.2 50 / 0.12)', color: 'oklch(68% 0.2 50)',
    fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
    fontWeight: 700,
  }}>
    🏷 {deal.notes.replace('Lead-Quelle: ', '')}
  </span>
)}
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/store/leads.store.ts src/routes/LeadsRoute.tsx src/routes/PipelineRoute.tsx
git commit -m "feat(leads): preserve lead source when converting to deal"
```

---

## Task 4: Mail-Liste zeigt Customer-Status-Chip

**Context:** In der Mailliste sieht man nur Absender und Betreff. Ob eine Mail bereits einem Kunden zugeordnet ist — und welchem — ist nicht sichtbar. Nutzer muss Mail öffnen um das zu sehen.

**Files:**
- Modify: `src/routes/MailRoute.tsx` — Email-Listenitem erweitern

- [ ] **Finde die E-Mail-Listen-Render-Stelle:**
```bash
grep -n "email\.subject\|fromName\|fromAddr\|customerId" src/routes/MailRoute.tsx | head -20
```

- [ ] **Lies `useCustomersStore` Schnittstelle:**
```bash
grep -n "customers\b" src/store/customers.store.ts | head -10
```

- [ ] **Füge Customer-Chip in Mail-Listen-Item ein.** Finde die Stelle im Mail-Listenitem-Render und füge nach dem Absender-Namen hinzu:

```tsx
// In der Email-Listenzeile — nach fromName/subject:
{email.customerId && (() => {
  const cust = customers.find(c => c.id === email.customerId)
  if (!cust) return null
  return (
    <span style={{
      fontSize: 9.5, padding: '1px 7px', borderRadius: 99,
      background: 'var(--surface-3)', color: 'var(--fg-dim)',
      fontWeight: 600, flexShrink: 0,
      overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80,
      whiteSpace: 'nowrap',
    }}>
      {cust.name}
    </span>
  )
})()}
```

- [ ] **Sicherstellen dass `customers` im MailRoute gelesen wird:**
```bash
grep -n "useCustomersStore\|customers" src/routes/MailRoute.tsx | head -5
```

Falls nicht vorhanden, Import und Selektor hinzufügen:
```tsx
import { useCustomersStore } from '@/store/customers.store'
// in der Komponente:
const customers = useCustomersStore(s => s.customers)
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/routes/MailRoute.tsx
git commit -m "feat(mail): show assigned customer chip in mail list"
```

---

## Task 5: FollowUps nach Priorität sortieren

**Context:** `FollowUp.priority` ('low' | 'normal' | 'high') ist definiert und gespeichert, aber die Follow-Up-Liste sortiert nur chronologisch. High-Priority Follow-Ups kommen nicht nach oben.

**Files:**
- Modify: `src/routes/FollowupsDashboardRoute.tsx`

- [ ] **Lies aktuelle Sortierlogik:**
```bash
grep -n "sort\|priority\|followUps\|crm" src/routes/FollowupsDashboardRoute.tsx | head -20
```

- [ ] **Füge Prioritätssortierung hinzu.** Finde die Stelle wo `followUps` oder `crm_follow_ups` gefiltert/gerendert werden und ergänze:

```tsx
const PRIO_ORDER = { high: 0, normal: 1, low: 2 }

// Ergänze die sort()-Kette:
.sort((a, b) => {
  const pDiff = (PRIO_ORDER[a.priority ?? 'normal'] ?? 1) -
                (PRIO_ORDER[b.priority ?? 'normal'] ?? 1)
  if (pDiff !== 0) return pDiff
  return a.dueDate.localeCompare(b.dueDate)
})
```

- [ ] **Füge Prioritäts-Badge in Follow-Up-Karte ein:**
```tsx
{followUp.priority === 'high' && (
  <span style={{
    fontSize: 9, padding: '1px 6px', borderRadius: 99,
    background: 'oklch(60% 0.2 25 / 0.12)', color: 'oklch(60% 0.2 25)',
    fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
  }}>
    Dringend
  </span>
)}
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/routes/FollowupsDashboardRoute.tsx
git commit -m "feat(followups): sort by priority, show urgency badge"
```

---

## Task 6: isPrivate Filter in Clients-Tabelle

**Context:** `Customer.isPrivate` ist definiert und es gibt einen `isPrivateCustomer()` Helper — aber die Clients-Tabelle filtert nicht danach. Private Einträge (persönliche Kontakte) erscheinen im Geschäfts-CRM.

**Files:**
- Modify: `src/routes/ClientsRoute.tsx` (oder wo Kunden-Tabelle gerendert wird)
- Modify: `src/store/customers.store.ts` — prüfen ob Filter vorhanden

- [ ] **Finde wo Customers gerendert werden:**
```bash
grep -n "customers\|isPrivate" src/routes/ClientsRoute.tsx | head -20
```

- [ ] **Filtere private Customers aus der Liste:**
```tsx
// Ergänze den Filter vor der Renderliste:
const visibleCustomers = useMemo(
  () => customers.filter(c => !c.isPrivate),
  [customers],
)
// Ersetze `customers` in der Renderliste durch `visibleCustomers`
```

- [ ] **Ebenso in `useAccountsStore`-basierter Clients-Liste prüfen:**
```bash
grep -n "isPrivate" src/routes/ClientsRoute.tsx
grep -n "isPrivate" src/store/accounts.store.ts
```

Falls in `accounts` vorhanden, gleichen Filter anwenden.

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/routes/ClientsRoute.tsx
git commit -m "fix(clients): filter out private customers from business CRM list"
```

---

## Task 7: Deal-Stall-Warning in Pipeline (> 14 Tage ohne Aktivität)

**Context:** Wenn ein Deal länger als 14 Tage im gleichen Stage sitzt ohne Aktivität, sollte ein visueller Warn-Chip erscheinen. `deal.lastActivityAt` und `deal.updatedAt` sind vorhanden.

**Files:**
- Read: `src/types/pipeline.types.ts` — Deal type fields
- Modify: `src/routes/PipelineRoute.tsx` — Deal-Karte erweitern

- [ ] **Lies Deal-Typ:**
```bash
grep -n "lastActivityAt\|updatedAt\|stalled\|daysInStage" src/types/pipeline.types.ts
```

- [ ] **Schreibe `isDealStalled` Helper:**

```tsx
function isDealStalled(deal: Deal): boolean {
  if (deal.stage === 'won' || deal.stage === 'lost') return false
  const lastTouch = deal.lastActivityAt ?? deal.updatedAt
  if (!lastTouch) return false
  const daysIdle = Math.floor(
    (Date.now() - new Date(lastTouch).getTime()) / 86_400_000,
  )
  return daysIdle >= 14
}
```

- [ ] **Füge Warn-Chip in Deal-Karte ein** — suche die Deal-Karten-Komponente:
```bash
grep -n "deal\.title\|DealCard\|deal-card" src/routes/PipelineRoute.tsx | head -10
```

Direkt unter dem Deal-Titel:
```tsx
{isDealStalled(deal) && (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 9.5, padding: '2px 7px', borderRadius: 99,
    background: 'oklch(65% 0.18 50 / 0.15)', color: 'oklch(65% 0.18 50)',
    fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em',
  }}>
    ⚠ Kein Kontakt seit {Math.floor((Date.now() - new Date(deal.lastActivityAt ?? deal.updatedAt).getTime()) / 86_400_000)}d
  </div>
)}
```

- [ ] **TypeScript check + Commit:**
```bash
npx tsc --noEmit 2>&1
git add src/routes/PipelineRoute.tsx
git commit -m "feat(pipeline): warn when deal has no activity for 14+ days"
```
