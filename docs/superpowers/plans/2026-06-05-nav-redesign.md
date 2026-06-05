# Nav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar-Navigation auf saubere, Apple-like Struktur mit Section-Labels, flachem Inbox und einheitlicher CSS-Klasse umbauen.

**Architecture:** Zwei Dateien — `globals.css` bekommt eine einheitliche `.nav-item`-Basisklasse mit BEM-Modifiern statt drei separater Klassen; `NavSidebar.tsx` verliert das Accordion (`InboxSection`, `SubItem`) und wird auf flat, sektionierte Struktur umgestellt.

**Tech Stack:** React, TypeScript, CSS (no libraries), Lucide React Icons

---

## File Map

| Datei | Was passiert |
|---|---|
| `src/styles/globals.css` | Neue Modifier-Klassen ergänzen, alte löschen, `.nav-capture` hinzufügen |
| `src/components/layout/NavSidebar.tsx` | Vollständig neu schreiben — kein Accordion, neue Struktur |

---

## Task 1: CSS — Neue Modifier-Klassen und nav-capture

**Files:**
- Modify: `src/styles/globals.css` (Zeilen ~400–424)

### Kontext
Die bestehende `.nav-item`-Klasse (Zeilen 400–424) hat alle nötigen Basis-Styles. Wir ergänzen darunter zwei Modifier und die neue `.nav-capture`-Klasse.

- [ ] **Schritt 1: Modifier nach `.nav-item .nav-badge` einfügen**

Nach Zeile 424 (nach `.nav-item .nav-badge { ... }`) einfügen:

```css
.nav-item--primary { font-weight: 700; }
.nav-item--featured { color: var(--accent); font-weight: 600; }
```

- [ ] **Schritt 2: `.nav-capture` Klasse einfügen**

Direkt danach einfügen:

```css
.nav-capture {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; margin: 0 0 2px;
  border-radius: 10px; border: 1px dashed rgba(255,255,255,0.1);
  background: transparent; cursor: pointer;
  color: var(--fg-dim); font-size: 13px;
  transition: border-color 140ms, color 140ms;
  width: 100%;
}
.nav-capture:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Schritt 3: Collapsed-State für `.nav-capture` ergänzen**

Im bestehenden collapsed-State-Block (Zeilen ~232–248) nach der letzten `.sidebar[data-collapsed="true"]`-Zeile einfügen:

```css
.sidebar[data-collapsed="true"] .nav-capture { padding: 10px 6px; justify-content: center; }
.sidebar[data-collapsed="true"] .nav-capture span { display: none; }
```

- [ ] **Schritt 4: `.nav-section-label` Padding anpassen**

Aktuelle Zeile ~1584: `padding: 14px 10px 4px;`
Ändern zu:

```css
  padding: 12px 10px 3px;
```

- [ ] **Schritt 5: TypeScript-Check**

```bash
pnpm typecheck
```

Erwartetes Ergebnis: keine Fehler (TSX noch unverändert)

---

## Task 2: CSS — Alte Klassen entfernen

**Files:**
- Modify: `src/styles/globals.css` (Zeilen ~1547–1666)

### Kontext
Die folgenden Klassen werden durch den einheitlichen `.nav-item`-Ansatz überflüssig. Alle müssen vollständig gelöscht werden.

- [ ] **Schritt 1: `.corra-nav-item` Block löschen**

Finde und lösche den gesamten Block inklusive aller Varianten:

```
.corra-nav-item { ... }
.corra-nav-item:hover { ... }
.corra-nav-item[data-active="true"] { ... }
.corra-nav-item[data-active="true"]::before { ... }
.corra-nav-item .corra-icon { ... }
.corra-nav-item .corra-label { ... }
.corra-nav-item .corra-kbd { ... }
```

- [ ] **Schritt 2: `.nav-item-heute` Block löschen**

Finde und lösche:

```
.nav-item-heute { ... }
.nav-item-heute:hover { ... }
.nav-item-heute[data-active="true"] { ... }
.nav-item-heute[data-active="true"]::before { ... }
.nav-item-heute .nav-kbd { ... }
```

- [ ] **Schritt 3: `.nav-item-sub` und `.nav-inbox-header` Blöcke löschen**

Finde und lösche:

```
.nav-item-sub { ... }
.nav-item-sub:hover { ... }
.nav-item-sub[data-active="true"] { ... }
.nav-item-sub[data-active="true"]::before { ... }
.nav-item-sub .nav-badge { ... }

.nav-inbox-header { ... }
.nav-inbox-header:hover { ... }
```

- [ ] **Schritt 4: Collapsed-Overrides für gelöschte Klassen entfernen**

Finde und lösche:

```
[data-theme="light"] .corra-nav-item .corra-icon { ... }

.sidebar[data-collapsed="true"] .corra-nav-item { ... }
.sidebar[data-collapsed="true"] .corra-nav-item .corra-label,
.sidebar[data-collapsed="true"] .corra-nav-item .corra-kbd { ... }
.sidebar[data-collapsed="true"] .nav-item-heute { ... }
.sidebar[data-collapsed="true"] .nav-item-heute > span:not(.nav-kbd) { ... }
.sidebar[data-collapsed="true"] .nav-item-heute .nav-kbd { ... }
.sidebar[data-collapsed="true"] .nav-inbox-header { ... }
.sidebar[data-collapsed="true"] .nav-inbox-header > span,
.sidebar[data-collapsed="true"] .nav-inbox-header svg:last-child { ... }
.sidebar[data-collapsed="true"] .nav-item-sub { ... }
.sidebar[data-collapsed="true"] .nav-item-sub > span:not(.nav-badge) { ... }
```

**Achtung:** Die Zeile `.sidebar[data-collapsed="true"] .nav-section-label { display: none; }` NICHT löschen — die bleibt.

- [ ] **Schritt 5: TypeScript-Check**

```bash
pnpm typecheck
```

Erwartetes Ergebnis: keine Fehler

---

## Task 3: NavSidebar.tsx — Vollständiger Umbau

**Files:**
- Modify: `src/components/layout/NavSidebar.tsx`

### Kontext
`InboxSection` (Accordion) und `SubItem` entfallen. CORRA und Heute bekommen die neuen Modifier-Klassen. Inbox wird flat. Kunden-Badge entfällt. Quick Capture bekommt `.nav-capture` statt Inline-Styles. `useCustomersStore` und `ChevronRight` werden nicht mehr gebraucht.

- [ ] **Schritt 1: Datei komplett ersetzen**

`src/components/layout/NavSidebar.tsx` mit folgendem Inhalt ersetzen:

```tsx
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import {
  Home, Users, CreditCard, Target,
  Mail, Calendar, Clock, Plug,
  Settings, PanelLeftClose, PanelLeftOpen, PenLine, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function NavItem({
  icon: Ic, label, active, onClick, badge, kbd,
}: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
  badge?: number; kbd?: string
}) {
  return (
    <div className="nav-item" data-active={String(active)} onClick={onClick} title={label}>
      <Ic size={16} />
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
      {kbd && !badge ? <span className="nav-kbd">{kbd}</span> : null}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <div className="nav-section-label">{children}</div>
}

export function NavSidebar() {
  const appView         = useUiStore(s => s.appView)
  const setAppView      = useUiStore(s => s.setAppView)
  const collapsed       = useUiStore(s => s.sidebarCollapsed)
  const setQuickCapture = useUiStore(s => s.setQuickCaptureOpen)
  const toggleSidebar   = useUiStore(s => s.toggleSidebar)
  const user            = useAuthStore(s => s.user)

  const openDealCount = useDealsStore(s =>
    s.deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length
  )
  const newLeadsCount = useLeadsStore(s => s.newLeads().length)
  const unreadMails   = useMailStore(s => s.emails.filter(e => !e.isRead).length)

  const akquiseBadge = (newLeadsCount + openDealCount) || undefined
  const displayName  = user?.email?.split('@')[0] ?? 'Nutzer'
  const initials     = displayName.slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>

      {/* Brand */}
      <div className="sidebar-brand" data-tauri-drag-region>
        <div className="sidebar-brand-logo">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="22" fill="oklch(92% 0.2 125)"/>
            <rect x="36" y="19" width="40" height="13" rx="6.5" fill="oklch(15% 0 0)" transform="rotate(-28 56 25.5)"/>
            <rect x="24" y="46" width="44" height="13" rx="6.5" fill="oklch(15% 0 0)" transform="rotate(-23 46 52.5)"/>
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <strong>Focus</strong>
          <span>CYNERA · 2026</span>
        </div>
      </div>

      {/* CORRA — featured, kein Section-Label */}
      <div
        className="nav-item nav-item--featured"
        data-active={appView === 'corra' ? 'true' : 'false'}
        onClick={() => setAppView('corra')}
        title="CORRA Intelligence (⌘K)"
      >
        <Sparkles size={16} />
        <span>CORRA</span>
        {!collapsed && <span className="nav-kbd">⌘K</span>}
      </div>

      {/* HEUTE */}
      {!collapsed && <SectionLabel>Heute</SectionLabel>}
      <div
        className="nav-item nav-item--primary"
        data-active={appView === 'dashboard' ? 'true' : 'false'}
        onClick={() => setAppView('dashboard')}
        title="Heute (H)"
      >
        <Home size={16} />
        <span>Dashboard</span>
        {!collapsed && <span className="nav-kbd">H</span>}
      </div>

      {/* INBOX — flat, kein Accordion */}
      {!collapsed && <SectionLabel>Inbox</SectionLabel>}
      <NavItem icon={Mail}     label="Posteingang"    active={appView === 'posteingang'}
        onClick={() => setAppView('posteingang')} badge={unreadMails || undefined} />
      <NavItem icon={Calendar} label="Kalender"       active={appView === 'calendar'}
        onClick={() => setAppView('calendar')} />
      <NavItem icon={Clock}    label="Zeitmanagement" active={appView === 'zeitmanagement'}
        onClick={() => setAppView('zeitmanagement')} kbd="Z" />

      {/* WORKSPACE */}
      {!collapsed && <SectionLabel>Workspace</SectionLabel>}
      <NavItem icon={Users}      label="Kunden"   active={appView === 'clients'}
        onClick={() => setAppView('clients')} kbd="C" />
      <NavItem icon={Target}     label="Akquise"  active={appView === 'akquise'}
        onClick={() => setAppView('akquise')} badge={akquiseBadge} kbd="A" />
      <NavItem icon={CreditCard} label="Finanzen" active={appView === 'invoices'}
        onClick={() => setAppView('invoices')} kbd="F" />

      <div style={{ flex: 1 }} />

      {/* Quick Capture */}
      <button
        type="button"
        className="nav-capture"
        onClick={() => setQuickCapture(true)}
        title="Quick Capture (⌘⇧N)"
      >
        <PenLine size={15} style={{ flexShrink: 0 }} />
        {!collapsed && <span>Quick Capture</span>}
      </button>

      <button className="sidebar-collapse-btn" onClick={toggleSidebar}
        title={collapsed ? 'Ausklappen' : 'Einklappen'}>
        {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <NavItem icon={Plug}     label="Integrationen" active={appView === 'integrations'}
        onClick={() => setAppView('integrations')} />
      <NavItem icon={Settings} label="Einstellungen" active={appView === 'settings'}
        onClick={() => setAppView('settings')} />

      {/* Profil */}
      <div
        className="sidebar-user"
        onClick={() => setAppView('profile')}
        title="Profil & Workspace"
        style={{ cursor: 'pointer' }}
      >
        <div className="sidebar-user-avatar">{initials}</div>
        {!collapsed && (
          <div className="sidebar-user-text">
            <strong>{displayName}</strong>
            <span>Profil & Workspace</span>
          </div>
        )}
      </div>

    </aside>
  )
}
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
pnpm typecheck
```

Erwartetes Ergebnis: keine Fehler. Häufige Fehler:
- `useCustomersStore` Import noch vorhanden → entfernen
- `appView` Typ akzeptiert `'posteingang'` nicht → in `ui.store.ts` nachschauen ob die View-Keys den String-Literal-Typ abdecken

- [ ] **Schritt 3: App starten und visuell prüfen**

```bash
pnpm dev
```

Prüfe:
- [ ] CORRA oben, lime-farbig (Icon + Label)
- [ ] Section-Labels „Heute", „Inbox", „Workspace" sichtbar
- [ ] Kein Accordion — Posteingang, Kalender, Zeitmanagement direkt als flat Items
- [ ] Posteingang Badge erscheint nur wenn ungelesene Mails > 0
- [ ] Akquise Badge erscheint nur wenn Leads + offene Deals > 0
- [ ] Kunden: kein Badge
- [ ] Quick Capture: gestrichelter Button, Hover wird lime
- [ ] Collapsed State: nur Icons zentriert, alle Labels weg, Section-Labels weg
- [ ] Aktiv-Indikator (3px Lime-Linie links) funktioniert bei allen Items

---

## Task 4: Commit

**Files:** alle geänderten

- [ ] **Schritt 1: Änderungen stagen**

```bash
git add src/components/layout/NavSidebar.tsx src/styles/globals.css
```

- [ ] **Schritt 2: Commit**

```bash
git commit -m "redesign(nav): Apple-like Sidebar — Section-Labels, flat Inbox, einheitliche CSS-Klassen"
```

Erwartetes Ergebnis: Commit erfolgreich, keine Pre-Commit-Hook-Fehler.
