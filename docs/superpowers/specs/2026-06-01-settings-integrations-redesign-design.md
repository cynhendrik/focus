# Settings + Integrationen Redesign

**Datum:** 2026-06-01
**Status:** Approved, ready for implementation plan
**Scope:** Settings-Seite visuell neu aufbauen (Sidebar-Layout), Module-Toggles auslagern, neue "Integrationen"-Route als eigenen Nav-Eintrag mit Zeilen-Liste aller API-Verbindungen.

---

## Ziel

Die aktuelle `SettingsRoute.tsx` (787 Zeilen, alles auf einer Seite) wird durch ein sauberes Sidebar-Layout ersetzt. Eine neue separate `IntegrationsRoute` erscheint als eigener Nav-Eintrag direkt über Settings. Module-Toggles werden aus Settings entfernt (eigenes Feature später).

---

## 1 — Navigation (NavSidebar)

### Neuer Eintrag

Zwischen Settings und dem User-Button wird `Integrationen` als eigener `SidebarNavItem` eingefügt:

```tsx
<SidebarNavItem icon={Plug} label="Integrationen" active={appView === 'integrations'} onClick={() => setAppView('integrations')} />
<SidebarNavItem icon={Settings} label="Settings" active={appView === 'settings'} onClick={() => setAppView('settings')} />
```

Icon: `Plug` aus lucide-react.

### AppView

`'integrations'` wird zum `AppView`-Union in `src/store/ui.store.ts` hinzugefügt.

### App.tsx Routing

`IntegrationsRoute` wird analog zu `SettingsRoute` im Switch eingebunden.

---

## 2 — Settings-Seite (Sidebar-Layout)

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Settings                                            │
├──────────────┬──────────────────────────────────────┤
│ Workspace    │  <Inhalt der aktiven Kategorie>       │
│ Profil       │                                       │
│ Erscheinungs-│                                       │
│   bild       │                                       │
│ Entwickler   │                                       │
│ ──────────── │                                       │
│ Gefahrenzone │                                       │
└──────────────┴──────────────────────────────────────┘
```

Linke Sidebar: 200px breit, `border-right: 1px solid var(--border)`. Aktiver Eintrag: 2px linker Akzent-Balken + `background: var(--accent-soft)`, Farbe `var(--accent)`.

Tab-State: `settingsTab` in `ui.store.ts` (Typ: `SettingsTab = 'workspace' | 'profil' | 'aussehen' | 'developer' | 'gefahrenzone'`), default `'workspace'`. Persistiert in localStorage.

### Kategorien & Inhalte

**Workspace**
- Workspace Name (editierbar, speichert via `companyStore`)
- Workspace ID (read-only, CopyField)
- Sprache (Dropdown, vorerst nur DE)

**Profil**
- Anzeigename (editierbar)
- E-Mail (read-only, aus Auth)
- Avatar-Initials-Preview

**Erscheinungsbild**
- Theme: Dark / Light / System (3 Kacheln mit Vorschau wie heute)
- Dichte: Normal / Kompakt (falls bereits vorhanden)

**Entwickler** *(versteckte Kategorie — nur sichtbar wenn `DEV_BYPASS` aktiv oder via `?dev=1` URL-Param)*
- Supabase URL (CopyField, aus `VITE_SUPABASE_URL`)
- Webhook Secret (CopyField, aus `VITE_LEAD_WEBHOOK_SECRET`)
- Anthropic API Key (Eye/EyeOff Input + Clear-Button)
- Modell-Auswahl (claude-opus-4-8 / claude-sonnet-4-6 / claude-haiku-4-5)

**Gefahrenzone**
- Workspace-Daten exportieren (Button → Download JSON)
- Workspace zurücksetzen (roter Confirm-Dialog)

### Was entfernt wird

- **Module-Toggles** (Sales, Mail, Social Media, Focus AI, Zeiterfassung) — komplett aus Settings entfernt, eigene Iteration später
- **Aktuelle Flat-Layout-Struktur** — wird durch Sidebar-Layout ersetzt

### Neue Dateien / Änderungen

```
src/routes/SettingsRoute.tsx              ← kompletter Rewrite
src/components/settings/
  ├─ SettingsSidebar.tsx                  ← NEU — Kategorie-Navigation
  ├─ WorkspaceSettings.tsx                ← NEU
  ├─ ProfilSettings.tsx                   ← NEU
  ├─ AussehensSettings.tsx                ← NEU (Theme-Kacheln aus bestehendem Code)
  ├─ DeveloperSettings.tsx                ← NEU (Supabase, Webhook, AI-Key)
  └─ GefahrenzoneSettings.tsx             ← NEU
src/store/ui.store.ts                     ← settingsTab + 'integrations' AppView
```

---

## 3 — Integrationen-Seite

### Layout

Zeilen-Liste. Jede Integration als `IntegrationRow`:

```
┌──────────────────────────────────────────────────────────────────┐
│ [Icon 40px]  Name          ● Verbunden / ○ Nicht verbunden       │
│              Kurzbeschreibung (1 Satz)          [Aktion-Button]  │
└──────────────────────────────────────────────────────────────────┘
```

**Status-Badge:**
- Verbunden: grüner Dot `#4ade80` + Glow + Text "Verbunden"
- Nicht verbunden: grauer Dot `var(--fg-dim)` + Text "Nicht verbunden"
- Coming Soon: gestrichelte Border + Badge "Bald" + gedimmt (opacity 0.5)

**Aktion-Button:**
- Verbunden → "Verwalten" (öffnet den bestehenden Setup-Flow, z.B. MailSetupWizard)
- Nicht verbunden → "Verbinden →" (Akzent-Farbe)
- Coming Soon → kein Button

### Integrations-Daten (statisch definiert, kein DB)

Status wird aus dem jeweiligen Store/Service abgeleitet:

| Integration | Icon | Beschreibung | Status-Quelle | Aktion |
|---|---|---|---|---|
| IMAP / SMTP | `Mail` | Empfange und sende E-Mails direkt in Cynera über dein eigenes Postfach. | `useMailStore` → hat Account? | öffnet MailSetupWizard |
| Zoom | `Video` | Importiere Webinar-Teilnehmer automatisch als Leads in Cynera. | `useLeadsStore` → hat Zoom-Leads? (Proxy) | öffnet Zoom-Webhook-Anleitung Modal |
| Webhook | `Webhook` | Empfange Leads von deiner Website oder externen Formularen automatisch. | immer "Aktiv" (URL existiert immer) | öffnet Webhook-Info-Modal (URL + Secret) |
| Google Calendar / Outlook | `CalendarDays` | Synchronisiere Termine bidirektional mit deinem Kalender. | immer "Nicht verbunden" (noch nicht implementiert) | deaktiviert |
| Bank | `Landmark` | Automatischer Zahlungsabgleich mit deinem Geschäftskonto. | Coming Soon | — |
| Shopify | `ShoppingBag` | Verbinde deinen Shopify-Shop für Bestell- und Umsatzdaten. | Coming Soon | — |

### Modals / Side-Flows

**Zoom — Anleitung Modal:**
- Erklärt wie man den Cynera-Webhook in Zoom Webinars einträgt
- Zeigt Webhook-URL zum Kopieren
- Kein echter OAuth-Flow (Zoom nutzt Webhooks, kein direktes API-Connect)

**Webhook — Info Modal:**
- Zeigt Endpoint-URL (aus `VITE_LEAD_WEBHOOK_SECRET`-basierter Berechnung)
- Copy-Button
- Beispiel-Payload als Code-Block

### Neue Dateien

```
src/routes/IntegrationsRoute.tsx          ← NEU
src/components/integrations/
  ├─ IntegrationRow.tsx                   ← NEU — einzelne Zeile
  ├─ ZoomSetupModal.tsx                   ← NEU — Anleitung + Webhook-URL
  └─ WebhookInfoModal.tsx                 ← NEU — URL + Secret + Beispiel
```

---

## 4 — Akzeptanzkriterien

### Navigation
- [ ] "Integrationen" erscheint in NavSidebar zwischen Settings und User-Button mit Plug-Icon
- [ ] `setAppView('integrations')` lädt IntegrationsRoute
- [ ] Settings und Integrationen sind beide über Keyboard-Shortcut erreichbar (falls vorhanden)

### Settings
- [ ] Sidebar zeigt 5 Kategorien: Workspace, Profil, Erscheinungsbild, Entwickler, Gefahrenzone
- [ ] Aktive Kategorie hat Akzent-Balken links
- [ ] Kategorie-State persistiert über Reload (`settingsTab` in localStorage via Zustand)
- [ ] Module-Toggles sind aus der Settings-Seite entfernt
- [ ] Entwickler-Kategorie nur sichtbar wenn `DEV_BYPASS === true` oder `?dev=1` in URL
- [ ] Theme-Kacheln funktionieren wie bisher
- [ ] Workspace-Name-Speichern funktioniert
- [ ] AI-Key: Eye/EyeOff toggle, Clear-Button, Speichern

### Integrationen
- [ ] 6 Zeilen: IMAP, Zoom, Webhook, Google Calendar/Outlook, Bank, Shopify
- [ ] IMAP: Status "Verbunden" wenn Mail-Account existiert, sonst "Nicht verbunden"
- [ ] IMAP "Verwalten" öffnet MailSetupWizard (oder bestehenden Mail-Settings-Flow)
- [ ] Zoom: "Verbinden" öffnet ZoomSetupModal mit Anleitung + URL
- [ ] Webhook: immer "Aktiv", "Konfigurieren" öffnet WebhookInfoModal
- [ ] Google Calendar: "Nicht verbunden", Button deaktiviert mit "Kommt bald"-Tooltip
- [ ] Bank + Shopify: Coming-Soon-Stil (gedimmt, gestrichelt, kein Button)

---

## 5 — Out of Scope

- Echter Google Calendar OAuth-Flow
- Zoom OAuth (nutzt Webhooks — kein direkter API-Connect nötig)
- Shopify / Bank Integration
- Module-Toggles (eigene Iteration)
- Multi-User / Team-Einstellungen
- Billing / Subscription-Management
