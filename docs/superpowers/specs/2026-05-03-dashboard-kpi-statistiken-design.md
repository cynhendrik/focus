# Dashboard KPI-Statistiken

**Datum:** 2026-05-03

## Ziel

Im KPI-Tab kann der Nutzer pro Kunde bestimmte KPI-Metriken fürs Haupt-Dashboard anpinnen. Das Dashboard zeigt diese dann als Karten mit aktuellem Wert, Trend und Sparkline.

---

## 1. Datenmodell

### Customer-Objekt (Erweiterung)
```js
{
  // bestehende Felder...
  dashboardKpis: string[]  // Array gepinnter KPI-Namen, z.B. ["Umsatz", "Impressionen"]
}
```
Standard-Wert bei bestehenden Kunden: `[]` (leeres Array, kein Breaking Change).

### Neue Store-Aktionen
- `pinKpi(customerId, kpiName)` — fügt `kpiName` zu `customer.dashboardKpis` hinzu (kein Duplikat)
- `unpinKpi(customerId, kpiName)` — entfernt `kpiName` aus `customer.dashboardKpis`

### Zeitreihe (keine neuen Felder)
Die Zeitreihe eines gepinnten KPIs ergibt sich durch: alle KPI-Einträge des Kunden mit `name === kpiName`, sortiert nach `date` aufsteigend.

---

## 2. KPI-Tab — Dashboard-Sub-Tab

### Tab-Leiste
`KpisPane` erhält zwei Tabs direkt unter dem bestehenden Header:
- **Tabelle** (bestehende Ansicht)
- **Dashboard** (neu)

### Dashboard-Tab — Inhalt
Liste aller eindeutigen KPI-Namen dieses Kunden.

Jede Zeile:
| Element | Detail |
|---|---|
| KPI-Name | Text links |
| Eintragsanzahl | z.B. "6 Einträge", gedimmt |
| Toggle-Switch | rechts — aktiv = gepinnt |

**Leerzustände:**
- Keine KPI-Einträge vorhanden → "Füge zuerst KPIs in der Tabelle hinzu"
- Einträge vorhanden, aber keiner gepinnt → Liste wird angezeigt, alle Toggles off

---

## 3. UebersichtPane — Statistiken-Sektion

### Position
Unterhalb der bestehenden drei Karten ("Offene To-Dos", "Letzte Aktivität", "KPI Highlights").

### Aufbau
```
Statistiken
├── [Kundenname A]
│   ├── KPI-Karte: Umsatz
│   └── KPI-Karte: Impressionen
└── [Kundenname B]
    └── KPI-Karte: Reichweite
```

- Pro Kunde mit `dashboardKpis.length > 0` erscheint ein Block
- Kunden ohne gepinnte KPIs werden nicht angezeigt
- Blöcke sind nach Kundenname alphabetisch sortiert

### KPI-Karte
| Element | Detail |
|---|---|
| KPI-Name | oben, klein, gedimmt |
| Aktueller Wert + Einheit | groß, letzter Eintrag nach Datum |
| Trend | Pfeil + Prozent zum vorletzten Eintrag; aufwärts = lila, abwärts = gedimmt; nur 1 Eintrag = kein Trend |
| Sparkline | SVG-Linienpfad, alle Einträge, keine Achsen |

### Sparkline-Implementierung
Eigene SVG-Berechnung — keine neue Bibliothek. Werte werden auf einen festen Viewport (z.B. 120×40px) normalisiert. Glatte Kurve via `quadraticBezier` oder einfache `polyline`.

### Leerzustand
Wenn kein Kunde gepinnte KPIs hat:
> "Keine Statistiken konfiguriert — öffne den KPI-Tab eines Kunden und pinne Metriken ans Dashboard."

---

## Nicht im Scope

- Chart-Typ-Auswahl (immer Linie)
- Zeitraum-Filter (immer alle Einträge)
- Cross-Customer-Aggregation
- Reihenfolge der Karten konfigurierbar
