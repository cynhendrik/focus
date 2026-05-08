# Dashboard KPI-Statistiken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KPI-Tab bekommt einen "Dashboard"-Sub-Tab zum Anpinnen von KPI-Metriken; das Haupt-Dashboard zeigt pro Kunde Karten mit aktuellem Wert, Trend und Sparkline.

**Architecture:** `pinKpi`/`unpinKpi` im Store speichern KPI-Namen in `customer.dashboardKpis[]`. `KpiDashboardTab` liest diese Liste und rendert Toggles. `KpiStatCard` zeigt Wert + Trend + SVG-Sparkline. `UebersichtPane` berechnet per `useMemo` welche Kunden gepinnte KPIs haben und rendert die Karten-Sektion.

**Tech Stack:** React, Zustand (dataSlice-Muster), Framer Motion, Vitest + Testing Library

---

## File Map

| Aktion | Datei | Zweck |
|---|---|---|
| Modify | `src/store/dataSlice.js` | `pinKpi` / `unpinKpi` Aktionen |
| Create | `src/components/kpis/KpiDashboardTab.jsx` | Dashboard-Sub-Tab mit Toggle-Liste |
| Modify | `src/components/kpis/KpisPane.jsx` | Tab-Navigation + KpiDashboardTab einbinden |
| Create | `src/components/uebersicht/KpiStatCard.jsx` | KPI-Karte mit Wert, Trend, Sparkline |
| Modify | `src/components/uebersicht/UebersichtPane.jsx` | Statistiken-Sektion unten |
| Modify | `src/test/store/dataSlice.test.js` | Tests für pinKpi / unpinKpi |

---

## Task 1: Store — pinKpi / unpinKpi

**Files:**
- Modify: `src/store/dataSlice.js` (nach `deleteKpi`, vor `addFolder`)
- Modify: `src/test/store/dataSlice.test.js`

- [ ] **Step 1: Failing tests schreiben**

Append to `src/test/store/dataSlice.test.js` inside the `describe('createDataSlice', ...)` block:

```js
it('pinKpi adds kpiName to dashboardKpis without duplicates', () => {
  const { get, slice } = makeSlice()
  slice.addCustomer({ name: 'A', company: '', email: '', phone: '' })
  const id = get().customers[0].id
  slice.pinKpi(id, 'Umsatz')
  slice.pinKpi(id, 'Umsatz')
  slice.pinKpi(id, 'Impressionen')
  expect(get().customers[0].dashboardKpis).toEqual(['Umsatz', 'Impressionen'])
})

it('unpinKpi removes kpiName from dashboardKpis', () => {
  const { get, slice } = makeSlice()
  slice.addCustomer({ name: 'B', company: '', email: '', phone: '' })
  const id = get().customers[0].id
  slice.pinKpi(id, 'Umsatz')
  slice.unpinKpi(id, 'Umsatz')
  expect(get().customers[0].dashboardKpis).toEqual([])
})

it('unpinKpi on customer without dashboardKpis is a no-op', () => {
  const { get, slice } = makeSlice()
  slice.addCustomer({ name: 'C', company: '', email: '', phone: '' })
  const id = get().customers[0].id
  expect(() => slice.unpinKpi(id, 'Umsatz')).not.toThrow()
  expect(get().customers[0].dashboardKpis).toEqual([])
})
```

- [ ] **Step 2: Tests zum Scheitern bringen**

```
npx vitest run src/test/store/dataSlice.test.js
```

Expected: 3 neue Tests FAIL mit "slice.pinKpi is not a function"

- [ ] **Step 3: Implementierung in dataSlice.js**

In `src/store/dataSlice.js`, nach `getKpis` (Zeile 83), einfügen:

```js
  pinKpi: (customerId, kpiName) => set(s => ({
    ...s,
    customers: s.customers.map(c =>
      c.id === customerId
        ? { ...c, dashboardKpis: [...new Set([...(c.dashboardKpis ?? []), kpiName])] }
        : c
    ),
  })),
  unpinKpi: (customerId, kpiName) => set(s => ({
    ...s,
    customers: s.customers.map(c =>
      c.id === customerId
        ? { ...c, dashboardKpis: (c.dashboardKpis ?? []).filter(n => n !== kpiName) }
        : c
    ),
  })),
```

- [ ] **Step 4: Tests laufen lassen**

```
npx vitest run src/test/store/dataSlice.test.js
```

Expected: alle Tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/dataSlice.js src/test/store/dataSlice.test.js
git commit -m "feat: add pinKpi/unpinKpi to dataSlice"
```

---

## Task 2: KpiDashboardTab — neue Komponente

**Files:**
- Create: `src/components/kpis/KpiDashboardTab.jsx`

- [ ] **Step 1: Datei anlegen**

`src/components/kpis/KpiDashboardTab.jsx`:

```jsx
import { useStore } from "../../store";

export function KpiDashboardTab({ customerId }) {
  const kpis = useStore(s => s.kpis.filter(k => k.customerId === customerId));
  const customer = useStore(s => s.customers.find(c => c.id === customerId));
  const pinKpi = useStore(s => s.pinKpi);
  const unpinKpi = useStore(s => s.unpinKpi);

  const pinned = customer?.dashboardKpis ?? [];
  const uniqueNames = [...new Set(kpis.map(k => k.name))].sort();

  if (kpis.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, fontSize: 13, color: "var(--text4)" }}>
        Füge zuerst KPIs in der Tabelle hinzu
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <p style={{ fontSize: 11, color: "var(--text4)", marginBottom: 8 }}>
        Aktiviere KPIs um sie auf dem Dashboard anzuzeigen.
      </p>
      {uniqueNames.map(name => {
        const count = kpis.filter(k => k.name === name).length;
        const isPinned = pinned.includes(name);
        return (
          <div
            key={name}
            style={{
              display: "flex", alignItems: "center", padding: "10px 12px",
              borderRadius: "var(--r-md)",
              background: isPinned ? "rgba(139,92,246,0.06)" : "transparent",
              border: `1px solid ${isPinned ? "rgba(139,92,246,0.18)" : "transparent"}`,
              transition: "all 0.15s",
            }}
          >
            <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{name}</span>
            <span style={{ fontSize: 11, color: "var(--text4)", marginRight: 12 }}>
              {count} {count === 1 ? "Eintrag" : "Einträge"}
            </span>
            <KpiToggle
              checked={isPinned}
              onChange={v => v ? pinKpi(customerId, name) : unpinKpi(customerId, name)}
            />
          </div>
        );
      })}
    </div>
  );
}

function KpiToggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, padding: 0, flexShrink: 0,
        cursor: "pointer",
        background: checked ? "var(--p)" : "var(--bg3)",
        border: `1px solid ${checked ? "rgba(139,92,246,0.5)" : "var(--border)"}`,
        position: "relative", transition: "background 0.18s, border-color 0.18s",
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 2,
        left: checked ? 18 : 2,
        transition: "left 0.18s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
      }} />
    </button>
  );
}
```

- [ ] **Step 2: Visuell prüfen** — Wird in Task 3 eingebunden, noch nicht testbar

- [ ] **Step 3: Commit**

```bash
git add src/components/kpis/KpiDashboardTab.jsx
git commit -m "feat: add KpiDashboardTab component"
```

---

## Task 3: KpisPane — Tab-Navigation einbauen

**Files:**
- Modify: `src/components/kpis/KpisPane.jsx`

- [ ] **Step 1: Import hinzufügen**

In `src/components/kpis/KpisPane.jsx`, Zeile 1 (nach den bestehenden Imports):

```jsx
import { KpiDashboardTab } from "./KpiDashboardTab";
```

- [ ] **Step 2: Tab-State hinzufügen**

In der `KpisPane`-Funktion, direkt nach den bestehenden useState-Zeilen (nach `setForm`):

```jsx
const [tab, setTab] = useState("tabelle");
```

- [ ] **Step 3: Tab-Bar nach dem Header einfügen**

Nach dem schließenden `</div>` des Header-Blocks (nach Zeile 62, vor dem `{/* Table */}`-Kommentar), einfügen:

```jsx
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "var(--bg2)", borderRadius: "var(--r-md)", padding: 3, alignSelf: "flex-start", flexShrink: 0 }}>
        {[["tabelle", "Tabelle"], ["dashboard", "Dashboard"]].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            style={{
              padding: "5px 14px", borderRadius: "var(--r-sm)", border: "none",
              background: tab === v ? "var(--bg)" : "transparent",
              color: tab === v ? "var(--text)" : "var(--text4)",
              fontSize: 12, fontWeight: tab === v ? 500 : 400,
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: tab === v ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
              transition: "all 0.15s",
            }}
          >{l}</button>
        ))}
      </div>
```

- [ ] **Step 4: Table-Div und Dashboard-Tab conditional rendern**

Das bestehende `{/* Table */}`-div (aktuell `<div style={{ flex: 1, overflowY: "auto" }}>`) ersetzen durch:

```jsx
      {tab === "tabelle" ? (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {kpis.length === 0 && !adding ? (
            <EmptyState icon="◈" title="Keine KPIs" description={'Klicke auf "+ KPI hinzufügen" um zu starten.'}
              action={<button onClick={() => setAdding(true)} style={{ marginTop: 8, padding: "8px 16px", borderRadius: "var(--r-md)", background: "var(--p)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ KPI hinzufügen</button>}
            />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[["name","KPI"],["value","Wert"],["unit","Einheit"],["date","Datum"]].map(([f,l]) => (
                    <th key={f} style={thStyle(f)} onClick={() => handleSort(f)}>
                      {l} {sort.f === f ? (sort.d === "asc" ? "↑" : "↓") : <span style={{ opacity: 0.3 }}>↕</span>}
                    </th>
                  ))}
                  <th style={{ ...thStyle(""), width: 40, cursor: "default" }} />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {sorted.map(k => <KpiRow key={k.id} kpi={k} onUpdate={updateKpi} onDelete={() => deleteKpi(k.id)} />)}
                </AnimatePresence>
                {adding && (
                  <tr style={{ background: "rgba(139,92,246,0.05)" }}>
                    {["name","value","unit","date"].map(f => (
                      <td key={f} style={{ padding: "8px 12px" }}>
                        <input
                          autoFocus={f === "name"}
                          type={f === "date" ? "date" : "text"}
                          value={form[f]}
                          onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
                          placeholder={f === "name" ? "KPI Name…" : f === "value" ? "123…" : f === "unit" ? "€, %, …" : ""}
                          style={{ background: "transparent", border: "none", borderBottom: "1px solid rgba(139,92,246,0.4)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", padding: "2px 0" }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={handleAdd} style={{ background: "none", border: "none", color: "var(--p3)", cursor: "pointer", fontSize: 14, marginRight: 4 }}>✓</button>
                      <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", color: "var(--text4)", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {(kpis.length > 0) && <p style={{ fontSize: 10, color: "var(--text4)", textAlign: "center", marginTop: 10 }}>Doppelklick zum Bearbeiten</p>}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <KpiDashboardTab customerId={customerId} />
        </div>
      )}
```

Dabei: den alten `{/* Table */}`-div-Block vollständig entfernen und durch den obigen Block ersetzen.

- [ ] **Step 5: Im Browser prüfen**

App starten (`npm run dev`), einen Kunden öffnen, KPI-Tab aufrufen. Tab-Leiste "Tabelle | Dashboard" soll erscheinen. Dashboard-Tab zeigt entweder "Füge zuerst KPIs hinzu" oder die Toggle-Liste.

- [ ] **Step 6: Commit**

```bash
git add src/components/kpis/KpisPane.jsx
git commit -m "feat: add Dashboard tab to KpisPane"
```

---

## Task 4: KpiStatCard — Karte mit Sparkline

**Files:**
- Create: `src/components/uebersicht/KpiStatCard.jsx`

- [ ] **Step 1: Datei anlegen**

`src/components/uebersicht/KpiStatCard.jsx`:

```jsx
export function KpiStatCard({ name, entries }) {
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const current = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const currentVal = Number(current?.value) || 0;
  const prevVal = Number(prev?.value) || 0;
  const trend = prev && prevVal !== 0
    ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100
    : null;

  return (
    <div style={{
      background: "rgba(17,17,21,0.70)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(124,58,237,0.10)", borderRadius: "var(--r-xl)", padding: "16px",
      boxShadow: "var(--shadow-lg)", minWidth: 160, maxWidth: 200,
      display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text4)" }}>
        {name}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em",
          color: "var(--text)", lineHeight: 1,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {current?.value ?? "—"}
        </span>
        {current?.unit && (
          <span style={{ fontSize: 13, color: "var(--text3)" }}>{current.unit}</span>
        )}
        {trend !== null && (
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: trend >= 0 ? "var(--p3)" : "var(--text3)",
          }}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <Sparkline values={sorted.map(e => Number(e.value) || 0)} />
    </div>
  );
}

function Sparkline({ values }) {
  if (values.length < 2) return <div style={{ height: 36 }} />;
  const W = 120, H = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / range) * (H * 0.85) - H * 0.075,
  ]);
  const d = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke="var(--p2)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/uebersicht/KpiStatCard.jsx
git commit -m "feat: add KpiStatCard with sparkline"
```

---

## Task 5: UebersichtPane — Statistiken-Sektion

**Files:**
- Modify: `src/components/uebersicht/UebersichtPane.jsx`

- [ ] **Step 1: Import hinzufügen**

In `src/components/uebersicht/UebersichtPane.jsx`, Import-Block (Zeile 1-6):

```jsx
import { KpiStatCard } from './KpiStatCard'
```

- [ ] **Step 2: statisticsData useMemo hinzufügen**

In `UebersichtPane`, nach dem `topKpis`-useMemo (nach Zeile 97):

```jsx
  const statisticsData = useMemo(() => {
    return customers
      .filter(c => (c.dashboardKpis ?? []).length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(c => ({
        customer: c,
        pinnedKpis: (c.dashboardKpis ?? [])
          .map(kpiName => ({
            name: kpiName,
            entries: kpis
              .filter(k => k.customerId === c.id && k.name === kpiName)
              .sort((a, b) => new Date(a.date) - new Date(b.date)),
          }))
          .filter(k => k.entries.length > 0),
      }))
      .filter(c => c.pinnedKpis.length > 0)
  }, [customers, kpis])
```

- [ ] **Step 3: Statistiken-Sektion im JSX einfügen**

Nach dem schließenden `</motion.div>` des Kunden-Strips (nach Zeile 254), vor dem äußeren schließenden `</div>`:

```jsx
        {/* Statistiken */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.22, ease }}
          style={{ marginTop: 20 }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text4)', display: 'block', marginBottom: 14 }}>
            Statistiken
          </span>
          {statisticsData.length === 0 ? (
            <div style={{ ...glassCard, alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
              <p style={{ fontSize: 12, color: 'var(--text4)', textAlign: 'center' }}>
                Keine Statistiken konfiguriert — öffne den KPI-Tab eines Kunden und aktiviere Metriken fürs Dashboard.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {statisticsData.map(({ customer, pinnedKpis }) => (
                <div key={customer.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Avatar name={customer.name} id={customer.id} size={20} radius={6} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)' }}>{customer.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                    {pinnedKpis.map(({ name, entries }) => (
                      <KpiStatCard key={name} name={name} entries={entries} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
```

- [ ] **Step 4: Tests aktualisieren**

In `src/test/components/UebersichtPane.test.jsx` — der `makeState`-Helper braucht `pinKpi` und `unpinKpi` als no-op Fns damit bestehende Tests nicht brechen. Zeile 62-69 (makeState) wird zu:

```js
  const makeState = (overrides = {}) => ({
    customers: [],
    todos: [],
    notes: [],
    kpis: [],
    uploadedFiles: [],
    selectCustomer: vi.fn(),
    pinKpi: vi.fn(),
    unpinKpi: vi.fn(),
    ...overrides,
  })
```

- [ ] **Step 5: Alle Tests laufen lassen**

```
npx vitest run
```

Expected: alle Tests PASS

- [ ] **Step 6: Im Browser prüfen**

1. Einen Kunden öffnen → KPI-Tab → KPIs hinzufügen (z.B. Name: "Umsatz", Wert: 1000 / Name: "Umsatz", Wert: 1200)
2. Dashboard-Tab → Toggle für "Umsatz" aktivieren
3. Zur Übersicht navigieren → Statistiken-Sektion zeigt Kunden-Block mit "Umsatz"-Karte, Wert 1200, Trend ↑ 20%, Sparkline

- [ ] **Step 7: Commit**

```bash
git add src/components/uebersicht/UebersichtPane.jsx src/test/components/UebersichtPane.test.jsx
git commit -m "feat: add Statistiken section to UebersichtPane"
```
