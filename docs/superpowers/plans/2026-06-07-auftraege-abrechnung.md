# Aufträge-Verwaltung + Abrechnung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufträge in Settings verwalten, nicht abgerechnete Zeiteinträge pro Kunde anzeigen und daraus direkt Rechnung oder Angebot erstellen.

**Architecture:** 3 Tasks in Reihenfolge — (1) Store-Erweiterung für selektives Billing, (2) neuer Settings-Tab für Aufträge-CRUD, (3) „Nicht abgerechnet"-Sektion in der Kunden-FinanzPane mit Billing-Flow. Keine neuen Backend-Calls nötig — Aufträge/Zeiteinträge leben in localStorage (Zustand-Store). Invoice/Offer-Erstellung nutzt bestehende `createInvoice`/`createOffer` Store-Actions.

**Tech Stack:** React + Zustand (auftraege.store, finance.store, ui.store), TypeScript, Lucide icons — identische Patterns wie bestehende Settings-Komponenten und FinanzPane

---

## File Map

| Datei | Änderung |
|---|---|
| `src/store/auftraege.store.ts` | Neu: `markBilledEntries(ids, invoiceId)` Action |
| `src/store/ui.store.ts` | `SettingsTab` type: `'auftraege'` hinzufügen |
| `src/components/settings/SettingsSidebar.tsx` | „Aufträge" Item einfügen |
| `src/routes/SettingsRoute.tsx` | case + VALID_TABS ergänzen |
| `src/components/settings/AuftraegeSettings.tsx` | NEU: Aufträge-CRUD in Settings |
| `src/components/customer/tabs/FinanzPane.tsx` | Neuer Abschnitt + Billing-Flow |

---

## Task 1: Store — `markBilledEntries`

**Files:**
- Modify: `src/store/auftraege.store.ts`

- [ ] **Step 1: `markBilledEntries` zur Interface hinzufügen**

In `interface AuftraegeState` (Zeile ~30) nach `markBilledForAccount` einfügen:

```typescript
markBilledEntries: (entryIds: string[], invoiceId: string) => void
```

- [ ] **Step 2: Implementation hinzufügen**

Im `create`-Aufruf nach `markBilledForAccount` einfügen:

```typescript
markBilledEntries(entryIds, invoiceId) {
  const idSet = new Set(entryIds)
  const zeiteintraege = get().zeiteintraege.map(z =>
    idSet.has(z.id) ? { ...z, billed: true, invoiceId } : z
  )
  save(KEY_ZEITEINTRAEGE, zeiteintraege)
  set({ zeiteintraege })
},
```

- [ ] **Step 3: TypeScript prüfen**

```powershell
npx tsc --noEmit 2>&1 | head -10
```

Erwartet: keine Fehler.

- [ ] **Step 4: Commit**

```powershell
git add src/store/auftraege.store.ts
git commit -m "feat(auftraege): markBilledEntries für selektives Billing"
```

---

## Task 2: Settings „Aufträge" Tab

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/settings/SettingsSidebar.tsx`
- Modify: `src/routes/SettingsRoute.tsx`
- Create: `src/components/settings/AuftraegeSettings.tsx`

- [ ] **Step 1: `SettingsTab` type erweitern**

In `src/store/ui.store.ts` Zeile 87, `'auftraege'` ergänzen:

```typescript
export type SettingsTab = 'workspace' | 'profil' | 'aussehen' | 'module' | 'integrationen' | 'developer' | 'gefahrenzone' | 'auftraege'
```

- [ ] **Step 2: SettingsSidebar ergänzen**

In `src/components/settings/SettingsSidebar.tsx`:

Import ergänzen:
```typescript
import { Building2, LayoutGrid, Plug, Code2, AlertTriangle, Clock } from 'lucide-react'
```

In `ITEMS` nach `{ key: 'workspace', ... }` einfügen:
```typescript
{ key: 'auftraege' as SettingsTab, label: 'Aufträge', icon: Clock, dividerBefore: true },
```

- [ ] **Step 3: SettingsRoute ergänzen**

In `src/routes/SettingsRoute.tsx`:

Import ergänzen (nach GefahrenzoneSettings):
```typescript
import { AuftraegeSettings } from '@/components/settings/AuftraegeSettings'
```

`VALID_TABS` ergänzen:
```typescript
const VALID_TABS = ['workspace', 'module', 'integrationen', 'developer', 'gefahrenzone', 'auftraege']
```

In `renderPanel()` neuen case einfügen:
```typescript
case 'auftraege': return <AuftraegeSettings />
```

- [ ] **Step 4: `AuftraegeSettings.tsx` anlegen**

Neue Datei `src/components/settings/AuftraegeSettings.tsx`:

```tsx
import { useState, useRef } from 'react'
import { Plus, Trash2, Archive, Check, X } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
import type { Auftrag } from '@/types/auftrag.types'

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// ── Inline-Edit-Zeile ────────────────────────────────────────────────────────

function AuftragRow({ auftrag }: { auftrag: Auftrag }) {
  const updateAuftrag = useAuftraege(s => s.updateAuftrag)
  const deleteAuftrag = useAuftraege(s => s.deleteAuftrag)
  const [editing, setEditing] = useState(false)
  const [title,   setTitle]   = useState(auftrag.title)
  const [rate,    setRate]    = useState(auftrag.defaultHourlyRate?.toString() ?? '')
  const [hover,   setHover]   = useState(false)

  const save = () => {
    const r = parseFloat(rate.replace(',', '.'))
    updateAuftrag(auftrag.id, {
      title: title.trim() || auftrag.title,
      defaultHourlyRate: r > 0 ? r : null,
    })
    setEditing(false)
  }

  const archive = () => updateAuftrag(auftrag.id, { status: 'archived' })
  const restore = () => updateAuftrag(auftrag.id, { status: 'active' })

  const isArchived = auftrag.status === 'archived'

  if (editing) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setTitle(auftrag.title); setRate(auftrag.defaultHourlyRate?.toString() ?? ''); setEditing(false) } }}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <input
          value={rate}
          onChange={e => setRate(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="€/Std"
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)' }}
        />
        <button onClick={save} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={13} />
        </button>
        <button onClick={() => { setTitle(auftrag.title); setRate(auftrag.defaultHourlyRate?.toString() ?? ''); setEditing(false) }} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'var(--surface-3)', color: 'var(--fg-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: isArchived ? 0.5 : 1, cursor: 'pointer' }}
      onClick={() => !isArchived && setEditing(true)}
    >
      <span style={{ fontSize: 13, color: isArchived ? 'var(--fg-dim)' : 'var(--fg)' }}>{auftrag.title}</span>
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
        {auftrag.defaultHourlyRate != null ? fmtEur(auftrag.defaultHourlyRate) + '/h' : '—'}
      </span>
      <div style={{ display: 'flex', gap: 4, opacity: hover ? 1 : 0, transition: 'opacity 150ms' }}>
        {isArchived
          ? <button onClick={e => { e.stopPropagation(); restore() }} title="Wiederherstellen" style={btnStyle}><Archive size={12} /></button>
          : <button onClick={e => { e.stopPropagation(); archive() }} title="Archivieren" style={btnStyle}><Archive size={12} /></button>
        }
        <button onClick={e => { e.stopPropagation(); if (confirm(`„${auftrag.title}" wirklich löschen?`)) deleteAuftrag(auftrag.id) }} title="Löschen" style={btnStyle}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 5, border: 'none',
  background: 'var(--surface-3)', color: 'var(--fg-dim)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ── Neuer Auftrag Form ───────────────────────────────────────────────────────

function NewAuftragForm({ onDone }: { onDone: () => void }) {
  const createAuftrag = useAuftraege(s => s.createAuftrag)
  const [title, setTitle] = useState('')
  const [rate,  setRate]  = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const save = () => {
    const t = title.trim()
    if (!t) return
    const r = parseFloat(rate.replace(',', '.'))
    createAuftrag({ title: t, defaultHourlyRate: r > 0 ? r : null, notes: '' })
    setTitle(''); setRate('')
    ref.current?.focus()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto auto', gap: 8, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <input
        ref={ref}
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }}
        placeholder="Auftragsbezeichnung…"
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
      />
      <input
        value={rate}
        onChange={e => setRate(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }}
        placeholder="€/Std  (opt.)"
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)' }}
      />
      <button onClick={save} disabled={!title.trim()} style={{ ...btnStyle, background: title.trim() ? 'var(--accent)' : 'var(--surface-3)', color: title.trim() ? 'var(--accent-ink)' : 'var(--fg-dim)', width: 30, height: 30 }}>
        <Check size={13} />
      </button>
      <button onClick={onDone} style={{ ...btnStyle, width: 30, height: 30 }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export function AuftraegeSettings() {
  const auftraege = useAuftraege(s => s.auftraege)
  const [adding,       setAdding]       = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const active   = auftraege.filter(a => a.status === 'active')
  const archived = auftraege.filter(a => a.status === 'archived')

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Aufträge</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
            Auftragstypen für die Zeiterfassung — z.&nbsp;B. „Beratung 120&nbsp;€/h", „Entwicklung 95&nbsp;€/h".
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Neu
          </button>
        )}
      </div>

      {/* Tabellenkopf */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, padding: '6px 0', borderBottom: '2px solid var(--border)' }}>
        {['Bezeichnung', 'Stundensatz', ''].map(h => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>

      {/* Neuen Auftrag Form */}
      {adding && <NewAuftragForm onDone={() => setAdding(false)} />}

      {/* Aktive Aufträge */}
      {active.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '20px 0' }}>Noch keine Aufträge. Klicke „Neu" um den ersten anzulegen.</p>
      )}
      {active.map(a => <AuftragRow key={a.id} auftrag={a} />)}

      {/* Archivierte */}
      {archived.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--fg-dim)', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {showArchived ? '▼' : '▶'} {archived.length} archivierte Aufträge
          </button>
          {showArchived && archived.map(a => <AuftragRow key={a.id} auftrag={a} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: TypeScript prüfen**

```powershell
npx tsc --noEmit 2>&1 | head -15
```

Erwartet: keine Fehler.

- [ ] **Step 6: Commit**

```powershell
git add src/store/ui.store.ts src/components/settings/SettingsSidebar.tsx src/routes/SettingsRoute.tsx src/components/settings/AuftraegeSettings.tsx
git commit -m "feat(settings): Aufträge-Tab mit CRUD + Inline-Edit"
```

---

## Task 3: FinanzPane — „Nicht abgerechnet" + Billing-Flow

**Files:**
- Modify: `src/components/customer/tabs/FinanzPane.tsx`

- [ ] **Step 1: FinanzPane.tsx vollständig ersetzen**

```tsx
import { useEffect, useState, useMemo } from 'react'
import { FileText, Tag, Clock, ChevronRight } from 'lucide-react'
import { FinanceService } from '@/services/finance.service'
import { useFinanceStore } from '@/store/finance.store'
import { useAuftraege }   from '@/store/auftraege.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore }      from '@/store/auth.store'
import { useUiStore }        from '@/store/ui.store'
import type { Invoice, Offer } from '@/types/finance.types'
import type { Zeiteintrag }   from '@/types/auftrag.types'

interface Props { customerId: string }

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
function fmtH(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function todayISO() { return new Date().toLocaleDateString('sv') }
function dueDateISO() {
  const d = new Date(); d.setDate(d.getDate() + 14)
  return d.toLocaleDateString('sv')
}

const STATUS_TONE: Record<string, string> = {
  draft: '', open: 'warn', paid: 'ok', overdue: 'bad',
  sent: 'info', accepted: 'ok', rejected: 'bad',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', overdue: 'Überfällig',
  sent: 'Versendet', accepted: 'Angenommen', rejected: 'Abgelehnt',
}

// ── Unbilled group ────────────────────────────────────────────────────────────

interface AuftragGroup {
  auftragId:    string | null
  auftragTitle: string
  hourlyRate:   number
  entries:      Zeiteintrag[]
  totalMinutes: number
  totalAmount:  number
}

export function FinanzPane({ customerId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [offers,   setOffers]   = useState<Offer[]>([])
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState(false)

  const auftraege         = useAuftraege(s => s.auftraege)
  const zeiteintraege     = useAuftraege(s => s.zeiteintraege)
  const markBilledEntries = useAuftraege(s => s.markBilledEntries)
  const createInvoice     = useFinanceStore(s => s.createInvoice)
  const createOffer       = useFinanceStore(s => s.createOffer)
  const workspaceId       = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId            = useAuthStore(s => s.user?.id) ?? ''
  const setAppView        = useUiStore(s => s.setAppView)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      FinanceService.getInvoicesByAccount(customerId),
      FinanceService.getOffersByAccount(customerId),
    ]).then(([inv, off]) => {
      setInvoices(inv)
      setOffers(off)
    }).finally(() => setLoading(false))
  }, [customerId])

  // Group unbilled entries by Auftrag
  const groups: AuftragGroup[] = useMemo(() => {
    const unbilled = zeiteintraege.filter(z => z.accountId === customerId && !z.billed)
    const map = new Map<string, AuftragGroup>()
    for (const z of unbilled) {
      const key = z.auftragId ?? '__none__'
      const auf = auftraege.find(a => a.id === z.auftragId)
      const rate = z.hourlyRate ?? auf?.defaultHourlyRate ?? 0
      const amount = Math.round((z.minutes / 60) * rate * 100) / 100
      if (!map.has(key)) {
        map.set(key, {
          auftragId:    z.auftragId,
          auftragTitle: auf?.title ?? 'Ohne Auftrag',
          hourlyRate:   rate,
          entries:      [],
          totalMinutes: 0,
          totalAmount:  0,
        })
      }
      const g = map.get(key)!
      g.entries.push(z)
      g.totalMinutes += z.minutes
      g.totalAmount  = Math.round((g.totalAmount + amount) * 100) / 100
    }
    return Array.from(map.values())
  }, [zeiteintraege, auftraege, customerId])

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Reset selection when groups change
  useEffect(() => { setSelected(new Set(groups.map(g => g.auftragId ?? '__none__'))) }, [groups.length])

  const allSelected = groups.length > 0 && selected.size === groups.length
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(groups.map(g => g.auftragId ?? '__none__')))
  const toggleGroup = (key: string) => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const selectedGroups  = groups.filter(g => selected.has(g.auftragId ?? '__none__'))
  const selectedMinutes = selectedGroups.reduce((s, g) => s + g.totalMinutes, 0)
  const selectedAmount  = Math.round(selectedGroups.reduce((s, g) => s + g.totalAmount, 0) * 100) / 100
  const subtotal        = Math.round(selectedAmount * 100) / 100
  const taxAmount       = Math.round(subtotal * 0.19 * 100) / 100
  const total           = Math.round((subtotal + taxAmount) * 100) / 100

  const buildItems = () => selectedGroups.map((g, i) => ({
    title:       g.auftragTitle,
    description: `${fmtH(g.totalMinutes)} Zeiterfassung`,
    quantity:    Math.round((g.totalMinutes / 60) * 100) / 100,
    unitPrice:   g.hourlyRate,
    taxRate:     19,
    total:       g.totalAmount,
    sortOrder:   i,
    unit:        'Std',
  }))

  const billedEntryIds = () => selectedGroups.flatMap(g => g.entries.map(e => e.id))

  const handleCreateInvoice = async () => {
    if (!selectedGroups.length || creating) return
    setCreating(true)
    try {
      const result = await createInvoice({
        workspaceId, createdBy: userId, accountId: customerId,
        date: todayISO(), dueDate: dueDateISO(),
        status: 'draft',
        subtotal, taxAmount, total,
        items: buildItems(),
      })
      markBilledEntries(billedEntryIds(), result.invoice.id)
      setAppView('invoices')
    } finally { setCreating(false) }
  }

  const handleCreateOffer = async () => {
    if (!selectedGroups.length || creating) return
    setCreating(true)
    try {
      const result = await createOffer({
        workspaceId, createdBy: userId, accountId: customerId,
        title: `Angebot ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
        validUntil: dueDateISO(),
        subtotal, taxAmount, total,
        items: buildItems(),
      })
      markBilledEntries(billedEntryIds(), result.offer.id)
      setAppView('invoices')
    } finally { setCreating(false) }
  }

  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const totalOpen    = invoices.filter(i => i.status === 'open').reduce((s, i) => s + i.total, 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--fg-dim)', fontSize: 13 }}>Laden…</div>
  }

  return (
    <div style={{ padding: '20px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', flex: 1 }}>
      {/* Summary */}
      <div className="row-3" style={{ marginBottom: 0 }}>
        {[
          { label: 'Gesamtumsatz', value: totalPaid,    tone: 'ok'   },
          { label: 'Offen',        value: totalOpen,    tone: 'warn' },
          { label: 'Überfällig',   value: totalOverdue, tone: 'bad'  },
        ].map(({ label, value, tone }) => (
          <div key={label} className="card" style={{ padding: '14px 16px' }}>
            <div className="card-label" style={{ marginBottom: 6 }}>{label}</div>
            <div className="chip" data-tone={value > 0 ? tone : ''} style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: 0, background: 'none', letterSpacing: '-0.02em' }}>
              {fmt(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Nicht abgerechnet */}
      {groups.length > 0 && (
        <Section title="Nicht abgerechnet" icon={<Clock size={13} />}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 90px', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
              {['Auftrag', 'Zeit', 'Betrag'].map(h => (
                <span key={h} className="card-label" style={{ fontWeight: 500 }}>{h}</span>
              ))}
            </div>

            {groups.map(g => {
              const key = g.auftragId ?? '__none__'
              const checked = selected.has(key)
              return (
                <div
                  key={key}
                  onClick={() => toggleGroup(key)}
                  style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 90px', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: checked ? 'oklch(92% 0.2 125 / 0.05)' : 'transparent', transition: 'background 100ms' }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleGroup(key)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{g.auftragTitle}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{fmtH(g.totalMinutes)}</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: checked ? 'var(--fg)' : 'var(--fg-muted)' }}>{fmt(g.totalAmount)}</span>
                </div>
              )
            })}

            {/* Footer: Summe + Buttons */}
            <div style={{ padding: '12px 14px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--fg-muted)' }}>
                <span>{fmtH(selectedMinutes)}</span>
                <span style={{ fontWeight: 700, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{fmt(selectedAmount)} zzgl. 19% MwSt = {fmt(total)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCreateOffer}
                  disabled={!selectedGroups.length || creating}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-3)', color: selectedGroups.length ? 'var(--fg)' : 'var(--fg-dim)', fontSize: 12, fontWeight: 600, cursor: selectedGroups.length ? 'pointer' : 'not-allowed', transition: 'all 140ms' }}
                >
                  <Tag size={12} /> Angebot
                </button>
                <button
                  onClick={handleCreateInvoice}
                  disabled={!selectedGroups.length || creating}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: selectedGroups.length ? 'var(--accent)' : 'var(--surface-3)', color: selectedGroups.length ? 'var(--accent-ink)' : 'var(--fg-dim)', fontSize: 12, fontWeight: 600, cursor: selectedGroups.length ? 'pointer' : 'not-allowed', transition: 'all 140ms' }}
                >
                  <ChevronRight size={12} /> {creating ? 'Erstellt…' : 'Rechnung'}
                </button>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Invoices */}
      <Section title="Rechnungen" icon={<FileText size={13} />} empty={invoices.length === 0} emptyText="Keine Rechnungen">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nummer', 'Datum', 'Fällig', 'Betrag', 'Status'].map(h => (
                  <th key={h} className="card-label" style={{ padding: '8px 14px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdS}><span className="mono" style={{ fontSize: 11 }}>{inv.number ?? '—'}</span></td>
                  <td style={{ ...tdS, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.date)}</td>
                  <td style={{ ...tdS, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.dueDate)}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.total)}</td>
                  <td style={tdS}><span className="chip" data-tone={STATUS_TONE[inv.status] ?? ''}>{STATUS_LABEL[inv.status] ?? inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Offers */}
      <Section title="Angebote" icon={<Tag size={13} />} empty={offers.length === 0} emptyText="Keine Angebote">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nummer', 'Titel', 'Gültig bis', 'Betrag', 'Status'].map(h => (
                  <th key={h} className="card-label" style={{ padding: '8px 14px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map(offer => (
                <tr key={offer.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdS}><span className="mono" style={{ fontSize: 11 }}>{offer.number ?? '—'}</span></td>
                  <td style={{ ...tdS, fontSize: 12 }}>{offer.title}</td>
                  <td style={{ ...tdS, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(offer.validUntil)}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(offer.total)}</td>
                  <td style={tdS}><span className="chip" data-tone={STATUS_TONE[offer.status] ?? ''}>{STATUS_LABEL[offer.status] ?? offer.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, icon, children, empty, emptyText }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; empty?: boolean; emptyText?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ color: 'var(--fg-muted)' }}>{icon}</span>
        <span className="card-label">{title}</span>
      </div>
      {empty
        ? <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '10px 0' }}>{emptyText}</div>
        : children
      }
    </div>
  )
}

const tdS: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'middle' }
```

- [ ] **Step 2: TypeScript prüfen**

```powershell
npx tsc --noEmit 2>&1 | head -15
```

Erwartet: keine Fehler.

- [ ] **Step 3: Commit**

```powershell
git add src/components/customer/tabs/FinanzPane.tsx
git commit -m "feat(finanzen): Nicht-abgerechnete Zeiteinträge + Rechnung/Angebot aus Zeiterfassung"
```

---

## Self-Review

**Spec-Coverage:**
- ✅ Settings Aufträge-Tab → Task 2
- ✅ Aufträge definieren (anlegen, bearbeiten, archivieren, löschen) → Task 2 AuftraegeSettings
- ✅ FinanzPane „Nicht abgerechnet" mit Auftrag-Gruppen → Task 3
- ✅ Einzel- und Batch-Selektion (Checkbox pro Gruppe + Alle-Toggle) → Task 3
- ✅ Rechnung erstellen aus Zeiteinträgen → Task 3 `handleCreateInvoice`
- ✅ Angebot erstellen aus Zeiteinträgen → Task 3 `handleCreateOffer`
- ✅ Zeiteinträge nach Erstellung als abgerechnet markieren → Task 3 `markBilledEntries`
- ✅ Weiterleiten zu Finanzen → Task 3 `setAppView('invoices')`
- ✅ `markBilledEntries` Store-Action → Task 1

**Typ-Konsistenz:**
- `markBilledEntries(ids: string[], invoiceId: string)` — konsistent in Task 1 (Definition) und Task 3 (Aufruf)
- `buildItems()` gibt `UpsertInvoiceItemPayload[]` zurück — alle Pflichtfelder (title, quantity, unitPrice, taxRate, total, sortOrder) vorhanden
- `createInvoice` und `createOffer` Parameter passen zu `UpsertInvoicePayload` / `UpsertOfferPayload` aus `finance.types.ts`
