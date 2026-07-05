# Cultera — Marken-Architektur, Naming & Pricing

**Stand:** 2026-06-29 · Ergebnis aus 2 Experten-Roundtables + Gründer-Entscheidungen.

## Marken-Architektur: Branded House
**Cultera = Firma UND Dachmarke.** Ein Solo-Bootstrapper kann nicht mehrere Marken vermarkten →
alle Markenkraft fließt in *ein* Wort: **Cultera**. Darunter mehrere eigenständige Apps.

## Die 4 Apps (eigenständige Produkte, EIN SaaS, als Pfade unter cultera.de)
| App | Was | Status | Pfad |
|---|---|---|---|
| **Cultera OS** | Business-OS / Organizer (CRM, Finanzen, E-Rechnung, Mail, Kalender, Aufträge, Zeit) — **Flaggschiff** | **gebaut** (war „Cultera Focus") | `cultera.de/app` |
| **Cultera Projekte** | Projektplanner | geplant | `cultera.de/projekte` |
| **Cultera Drive** | Cloud-Speicher | geplant | `cultera.de/drive` |
| **Cultera Marketing** | Marketing-Tool | geplant | `cultera.de/marketing` |
| **KORA** | KI in *allen* Apps (Querschnitt) | gebaut (in OS) | — |
| **Cultera Komplett** | Bundle aller Apps | später | — |

- **Tagline (Cultera OS):** „Business-OS für Selbstständige".
- **„Focus" ist retiriert** als Produktname — lebt nur noch als Feature „Fokus-Modus".

## Naming-System
- Muster: **Marke trägt, Apps beschreiben** (Modell Google: Google → Gmail/Drive/Docs).
  Cultera = Held; Apps = klar/beschreibend (Drive/Projekte/Marketing); **OS** = Helden-Name fürs Flaggschiff.
- **KORA-Schreibregel:** NIEMALS „Cultera KORA" (Laut-Stolperer). KORA ist Figur:
  *„KORA, deine Assistentin in Cultera."* Spricht in Ich-Form, Du-Ansprache.
- Warmes Gegengewicht zu „OS" (kühl/techy): KORA + Sunset-Koralle tragen die Wärme.

## Domains
**Eine Domain: `cultera.de`.** Apps als Pfade (`/app`, `/projekte`, `/drive`, `/marketing`).
KEINE Domain pro App (Realitäts-Check 2026-06-29: kurze Wort-/Latein-`.de/.com` sind praktisch alle
belegt — z.B. vello/vesta/orbis/arca/… alle TAKEN). Einzeldomain höchstens **defensiv**.

## Pricing (Richtung — noch nicht final, da nur 1 App existiert)
Modell: **à-la-carte je App + „Cultera Komplett"-Bundle**, KORA IMMER inklusive (nie Paywall),
Bundle als No-Brainer (−~24 % vs. Einzelkauf). Solo-Anker **~24 €**, Fullbuild-Tendenz **39 €**.
14-Tage-Trial ohne Karte, Jahr −20 %, kein Freemium. **Achtung:** Die modulare Preis-Tabelle aus dem
Roundtable basierte auf einer falschen Annahme (4 Module *innerhalb* einer App). Real sind es **4
separate Apps** — nur **Cultera OS** existiert heute, also zunächst **1 Produkt, 1 Preis**; modulares
Mehr-App-Pricing kommt mit den weiteren Apps.

## Technik-Hinweis (wichtig)
- Tauri-`identifier` = **`de.cultera.focus`** (NICHT com.cynera.focus — ältere Memory dazu ist
  veraltet). Datenverzeichnis: `%APPDATA%\de.cultera.focus\`. Beim Umbenennen NIE den Identifier
  ändern → sonst Datenverlust. Produktname-Umbenennung (Focus→OS) berührt ihn nicht.

## Offene Entscheidungen
1. **Preis für Cultera OS** allein (24 € vs. 19 € vs. später testen) — nur diese App existiert.
2. Bekommen die 3 künftigen Apps beschreibende Namen (Drive/Projekte/Marketing) oder eigene
   Kunstwörter? Aktuell: beschreibend.
3. Tagline final: „Business-OS für Selbstständige" — so lassen?
4. `.exe` kosmetisch `focus.exe` → `cultera-os.exe`? (optional)
