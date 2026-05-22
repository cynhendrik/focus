# Sales-Modul Toggle — Design Spec

**Datum:** 2026-05-22
**Branch:** feature/v2-redesign
**Ansatz:** Iterativ — bestehende Modul-Infrastruktur erweitern

---

## Ziel

Sales komplett aus der Navigation ausblenden können. Leads, Pipeline, Smart Lists und Follow-Ups verschwinden — kein Daten-Löschen, nur UI-Hiding.

---

## 1. Datenmodell

### `CompanyModules` (`src/types/company.types.ts`)

Neues optionales Feld:

```ts
export interface CompanyModules {
  crm?: boolean
  mail?: boolean
  instagram?: boolean
  focusAi?: boolean
  zeiterfassung?: boolean
  sales?: boolean   // NEU
}
```

Semantik: `undefined` und `true` = sichtbar (backward-compatible). Nur explizit `false` = versteckt. Kein DB-Schema-Change nötig — `modules` ist bereits eine JSON-Spalte in `company_settings`.

---

## 2. Settings-UI (`src/routes/SettingsRoute.tsx`)

`MODULE_LABELS` bekommt einen neuen Eintrag:

```ts
const MODULE_LABELS: Record<keyof CompanyModules, string> = {
  sales: 'Sales',          // NEU
  crm: 'CRM',
  mail: 'Mail-Client',
  instagram: 'Instagram',
  focusAi: 'FOCUS AI',
  zeiterfassung: 'Zeiterfassung',
}
```

Der Toggle erscheint automatisch im bestehenden Modul-Grid — kein neuer UI-Code nötig.

---

## 3. NavSidebar (`src/components/layout/NavSidebar.tsx`)

`modules` aus `useCompanyStore` lesen (Store bereits importiert):

```ts
const modules = useCompanyStore(s => s.modules)
```

Sales-Sektion und alle 4 Items nur rendern wenn `modules.sales !== false`:

```tsx
{modules.sales !== false && (
  <>
    <SidebarSection label="Sales" ... />
    {expanded.sales && (
      <>
        <SidebarNavItem ... Leads />
        <SidebarNavItem ... Pipeline />
        <SidebarNavItem ... Smart Lists />
        <SidebarNavItem ... Follow-Ups />
      </>
    )}
  </>
)}
```

**Redirect:** Wenn die aktive View eine Sales-View ist und Sales deaktiviert wird, `useEffect` in `NavSidebar` springt auf `'dashboard'`:

```ts
const SALES_VIEWS = new Set(['leads', 'pipeline', 'smartlists', 'followups'])

useEffect(() => {
  if (modules.sales === false && SALES_VIEWS.has(appView)) {
    setAppView('dashboard')
  }
}, [modules.sales, appView, setAppView])
```

---

## 4. Nicht im Scope

- Daten löschen beim Deaktivieren
- Per-User-Override (globale Workspace-Einstellung gilt für alle)
- Feingranulare Einzeltoggles (z.B. nur Pipeline deaktivieren)
- Keyboard-Shortcuts für Sales-Views deaktivieren (bleiben inaktiv sobald View nicht erreichbar)
