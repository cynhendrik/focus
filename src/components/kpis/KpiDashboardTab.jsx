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
