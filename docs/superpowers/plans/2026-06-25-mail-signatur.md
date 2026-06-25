# E-Mail-Signatur (Outlook-Stil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine einmal in den Einstellungen festgelegte E-Mail-Signatur (aus dem Firmenprofil vorbefüllbar) wird automatisch in neue Mails (inkl. Mahnungen) eingesetzt und bleibt pro Mail editierbar.

**Architecture:** Neues optionales Feld `CompanyProfile.emailSignature` (persistiert über vorhandenes `saveProfile`, lokal + Supabase). Reine Helfer in `src/lib/mail-signature.ts` (`buildSignatureFromProfile`, `appendSignature`). Settings-UI zum Festlegen + „aus Profil übernehmen". `ComposeModal` hängt die Signatur an den Body genau für `mode="new"` an — eine zentrale Stelle.

**Tech Stack:** React + TypeScript, Zustand (`useCompanyStore`), Vitest. Mails sind reiner Text.

---

## Referenz (verifiziert)

- `CompanyProfile` (`src/types/company.types.ts`): Felder `name, address, phone, email, website, taxId, steuernummer, iban, bic, bankName, handelsregister, registergericht, geschaeftsfuehrer` (alle `?: string`), bereits inkl. `dunningFees?: number[]`.
- `WorkspaceSettings.tsx`: `const [form, setForm] = useState<CompanyProfile>(profile)`; Helfer `val(key)`/`f(key)`; lokale `Field`-Komponente (single-line); Speichern über vorhandenen Button → `saveProfile(form)`. Die „Mahngebühren"-Sektion existiert als Vorlage für eine neue Sektion.
- `ComposeModal.tsx`: Body-State wird mit `props.initialBody ?? bodyInitial(mode, replyTo, replyBody)` initialisiert (nach dem Prefill-Task). `mode: 'new' | 'reply' | 'forward'`. Sendet `bodyText`.
- `useCompanyStore` (`src/store/company.store.ts`): `profile: CompanyProfile`. Nicht-reaktiver Zugriff via `useCompanyStore.getState().profile`.

## File Structure

- **Create** `src/lib/mail-signature.ts` — reine Helfer `buildSignatureFromProfile`, `appendSignature`.
- **Create** `src/lib/mail-signature.test.ts` — Unit-Tests.
- **Modify** `src/types/company.types.ts` — `emailSignature?: string`.
- **Modify** `src/components/settings/WorkspaceSettings.tsx` — Sektion „E-Mail-Signatur" (Textarea + Button).
- **Modify** `src/components/mail/ComposeModal.tsx` — Signatur an `mode="new"`-Body anhängen.

---

## Task 1: Signatur-Helfer + Profil-Feld

**Files:**
- Modify: `src/types/company.types.ts`
- Create: `src/lib/mail-signature.ts`
- Test: `src/lib/mail-signature.test.ts`

- [ ] **Step 1: `emailSignature` zum Profil-Typ ergänzen**

In `src/types/company.types.ts` im `CompanyProfile`-Interface ein Feld ergänzen (z. B. direkt nach `dunningFees?: number[]`):

```typescript
  /** Vom Nutzer festgelegte E-Mail-Signatur (Outlook-Stil), wird an neue Mails gehängt. */
  emailSignature?: string
```

- [ ] **Step 2: Failing-Test schreiben**

Create `src/lib/mail-signature.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSignatureFromProfile, appendSignature } from './mail-signature'
import type { CompanyProfile } from '@/types/company.types'

describe('buildSignatureFromProfile', () => {
  it('includes only set fields, omitting empty ones', () => {
    const p: CompanyProfile = { name: 'Muster GmbH', address: 'Hauptstr. 1, 10115 Berlin', email: 'hallo@muster.de' }
    const sig = buildSignatureFromProfile(p)
    expect(sig).toContain('Muster GmbH')
    expect(sig).toContain('Hauptstr. 1, 10115 Berlin')
    expect(sig).toContain('hallo@muster.de')
    expect(sig).not.toContain('Tel:')        // phone not set
    expect(sig).not.toContain('USt-IdNr.')   // taxId not set
    expect(sig).not.toContain('IBAN')        // iban not set
  })
  it('builds a contact line, tax line, register line and bank line when set', () => {
    const p: CompanyProfile = {
      name: 'Muster GmbH', phone: '+49 30 123', email: 'a@b.de', website: 'muster.de',
      taxId: 'DE123', steuernummer: '30/456', registergericht: 'AG Berlin',
      handelsregister: 'HRB 1', geschaeftsfuehrer: 'Erika M.',
      iban: 'DE89...', bic: 'XYZ', bankName: 'Sparkasse',
    }
    const sig = buildSignatureFromProfile(p)
    expect(sig).toContain('Tel: +49 30 123')
    expect(sig).toContain('a@b.de')
    expect(sig).toContain('muster.de')
    expect(sig).toContain('USt-IdNr.: DE123')
    expect(sig).toContain('StNr.: 30/456')
    expect(sig).toContain('AG Berlin')
    expect(sig).toContain('HRB 1')
    expect(sig).toContain('GF: Erika M.')
    expect(sig).toContain('IBAN: DE89...')
    expect(sig).toContain('BIC: XYZ')
    expect(sig).toContain('Sparkasse')
  })
  it('returns empty string for an empty profile', () => {
    expect(buildSignatureFromProfile({})).toBe('')
  })
})

describe('appendSignature', () => {
  it('appends with the standard "-- " delimiter', () => {
    expect(appendSignature('Hallo', 'Muster GmbH')).toBe('Hallo\n\n-- \nMuster GmbH')
  })
  it('returns the body unchanged when signature is empty', () => {
    expect(appendSignature('Hallo', '')).toBe('Hallo')
    expect(appendSignature('Hallo', undefined)).toBe('Hallo')
  })
  it('omits leading blank lines when body is empty', () => {
    expect(appendSignature('', 'Muster GmbH')).toBe('-- \nMuster GmbH')
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/lib/mail-signature.test.ts`
Expected: FAIL — `Failed to resolve import "./mail-signature"`.

- [ ] **Step 4: Implementierung**

Create `src/lib/mail-signature.ts`:

```typescript
import type { CompanyProfile } from '@/types/company.types'

/** Baut einen Signatur-Textblock aus den gesetzten Feldern des Firmenprofils. */
export function buildSignatureFromProfile(p: CompanyProfile): string {
  const lines: string[] = []
  if (p.name)    lines.push(p.name)
  if (p.address) lines.push(p.address)

  const contact = [
    p.phone   ? `Tel: ${p.phone}` : '',
    p.email   || '',
    p.website || '',
  ].filter(Boolean).join(' · ')
  if (contact) lines.push(contact)

  const tax = [
    p.taxId       ? `USt-IdNr.: ${p.taxId}` : '',
    p.steuernummer ? `StNr.: ${p.steuernummer}` : '',
  ].filter(Boolean).join(' · ')
  if (tax) lines.push(tax)

  const register = [
    [p.registergericht, p.handelsregister].filter(Boolean).join(' '),
    p.geschaeftsfuehrer ? `GF: ${p.geschaeftsfuehrer}` : '',
  ].filter(Boolean).join(' · ')
  if (register) lines.push(register)

  const bank = [
    p.bankName || '',
    p.iban ? `IBAN: ${p.iban}` : '',
    p.bic  ? `BIC: ${p.bic}`  : '',
  ].filter(Boolean).join(' · ')
  if (bank) lines.push(bank)

  return lines.join('\n')
}

/** Hängt eine Signatur mit dem Standard-Trenner an den Body. Leere Signatur → Body unverändert. */
export function appendSignature(body: string, signature?: string): string {
  const sig = (signature ?? '').trim()
  if (!sig) return body
  if (!body) return `-- \n${sig}`
  return `${body}\n\n-- \n${sig}`
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run src/lib/mail-signature.test.ts`
Expected: PASS (alle Asserts grün).

- [ ] **Step 6: Typecheck + Commit**

Run: `npm run typecheck`
Expected: keine Fehler.

```bash
git add src/types/company.types.ts src/lib/mail-signature.ts src/lib/mail-signature.test.ts
git commit -m "feat(mail): signature helpers + emailSignature profile field"
```

---

## Task 2: Signatur-Sektion in den Einstellungen

**Files:**
- Modify: `src/components/settings/WorkspaceSettings.tsx`

- [ ] **Step 1: Import des Builders ergänzen**

Oben in `src/components/settings/WorkspaceSettings.tsx` ergänzen:

```typescript
import { buildSignatureFromProfile } from '@/lib/mail-signature'
```

- [ ] **Step 2: Signatur-Sektion einfügen**

Direkt **nach** der „Mahngebühren"-Sektion (die in einer früheren Aufgabe ergänzt wurde; sie endet mit ihrem schließenden `</div>` der Card) und vor `<InvoiceNumberSettings />` einfügen:

```tsx
      {/* E-Mail-Signatur */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>E-Mail-Signatur</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>Wird automatisch an neue Mails gehängt (editierbar pro Mail)</div>
          </div>
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, emailSignature: buildSignatureFromProfile(p) }))}
            style={{
              flexShrink: 0, height: 30, padding: '0 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--fg)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Aus Firmenprofil übernehmen
          </button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <textarea
            value={form.emailSignature ?? ''}
            onChange={e => setForm(p => ({ ...p, emailSignature: e.target.value }))}
            rows={7}
            placeholder={'Mit freundlichen Grüßen\n\nMuster GmbH\n…'}
            style={{
              width: '100%', resize: 'vertical', boxSizing: 'border-box',
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 14px', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6,
              outline: 'none',
            }}
          />
        </div>
      </div>
```

(`form`/`setForm` existieren bereits; Speichern läuft über den vorhandenen „Speichern"-Button → `saveProfile(form)`. `emailSignature` ist in `CompanyProfile` aus Task 1.)

- [ ] **Step 3: Typecheck + kurze Sichtprüfung**

Run: `npm run typecheck`
Expected: keine Fehler.

Dev-Server: Einstellungen → Unternehmen → Sektion „E-Mail-Signatur" sichtbar; „Aus Firmenprofil übernehmen" füllt das Feld; Wert nach „Speichern" + Reload erhalten.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/WorkspaceSettings.tsx
git commit -m "feat(mail): configurable email signature in company settings"
```

---

## Task 3: Signatur an neue Mails anhängen (ComposeModal)

**Files:**
- Modify: `src/components/mail/ComposeModal.tsx`

- [ ] **Step 1: Imports ergänzen**

Oben in `src/components/mail/ComposeModal.tsx` ergänzen:

```typescript
import { useCompanyStore } from '@/store/company.store'
import { appendSignature } from '@/lib/mail-signature'
```

- [ ] **Step 2: Body-Init um die Signatur erweitern (nur `mode="new"`)**

Finde die Body-State-Initialisierung. Nach dem Prefill-Task sieht sie sinngemäß so aus:

```typescript
  const [body, setBody] = useState(props.initialBody ?? bodyInitial(mode, replyTo, replyBody))
```

Ersetze sie durch eine Lazy-Initialisierung, die für `mode === 'new'` die im Firmenprofil hinterlegte Signatur anhängt (einmalig beim Mount; nicht-reaktiver Store-Zugriff ist hier korrekt):

```typescript
  const [body, setBody] = useState(() => {
    const base = props.initialBody ?? bodyInitial(mode, replyTo, replyBody)
    if (mode !== 'new') return base
    const signature = useCompanyStore.getState().profile.emailSignature
    return appendSignature(base, signature)
  })
```

WICHTIG: Passe die genauen Bezeichner an den real vorhandenen Code an (ob `props.initialBody` oder ein destrukturiertes `initialBody`; ob `mode` destrukturiert ist — ist es). Es darf NUR die Initialisierung geändert werden; `setBody`, das Senden (`bodyText: body`) und alle anderen Felder bleiben unverändert. Für `mode === 'reply' | 'forward'` bleibt das Verhalten exakt wie bisher.

- [ ] **Step 3: Typecheck + Tests**

Run: `npm run typecheck`
Expected: keine Fehler.
Run: `npx vitest run`
Expected: gesamte Suite grün (keine Regression).

- [ ] **Step 4: Manuell verifizieren**

Dev-Server (eingeloggt, Signatur in den Einstellungen gesetzt):
1. Mail → „Neue E-Mail" → der Text endet mit `-- ` + Signatur. Editierbar.
2. Mahnung „Senden" → der Editor öffnet mit Mahn-Text **und** Signatur darunter.
3. Eine Mail beantworten → KEINE Auto-Signatur (Verhalten wie zuvor).

- [ ] **Step 5: Commit**

```bash
git add src/components/mail/ComposeModal.tsx
git commit -m "feat(mail): append the configured signature to new mails (incl. dunning)"
```

---

## Abschluss

- [ ] **Volle Verifikation**

Run: `npm run typecheck && npx vitest run`
Expected: Typecheck sauber, gesamte Suite grün.

Manuell: Signatur in den Einstellungen setzen (per Button vorbefüllen + Gruß ergänzen) → neue Mail + Mahnung tragen die Signatur, Antworten nicht.
