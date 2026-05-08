import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { EmptyState } from "../ui/EmptyState";
import { fmtDate } from "../../utils/helpers";
import { toast } from "../ui/Toast";
import { KpiDashboardTab } from "./KpiDashboardTab";

export function KpisPane({ customerId }) {
  const kpis = useStore(s => s.kpis.filter(k => k.customerId === customerId));
  const addKpi = useStore(s => s.addKpi);
  const updateKpi = useStore(s => s.updateKpi);
  const deleteKpi = useStore(s => s.deleteKpi);

  const [sort, setSort] = useState({ f: "date", d: "desc" });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", unit: "", date: new Date().toISOString().slice(0, 10) });
  const [tab, setTab] = useState("tabelle");

  const sorted = [...kpis].sort((a, b) => {
    const va = a[sort.f] || "", vb = b[sort.f] || "";
    return sort.d === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const handleSort = (f) => setSort(s => ({ f, d: s.f === f ? (s.d === "asc" ? "desc" : "asc") : "asc" }));

  const handleAdd = () => {
    if (!form.name.trim() || !form.value.trim()) return;
    addKpi(customerId, form);
    setForm({ name: "", value: "", unit: "", date: new Date().toISOString().slice(0, 10) });
    setAdding(false);
    toast("KPI gespeichert ✓");
  };

  const thisMonth = kpis.filter(k => k.date?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;

  const thStyle = (f) => ({
    padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 600,
    letterSpacing: "0.1em", textTransform: "uppercase",
    color: sort.f === f ? "var(--p3)" : "var(--text4)",
    borderBottom: "1px solid var(--border)", cursor: "pointer", userSelect: "none",
    transition: "color 0.12s", position: "sticky", top: 0, background: "var(--bg)",
  });
  const tdStyle = { padding: "10px 12px", fontSize: 13, color: "var(--text2)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[["Gesamt", kpis.length, "var(--p3)"], ["Diesen Monat", thisMonth, "var(--text2)"]].map(([l, v, c]) => (
            <div key={l} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "10px 14px", minWidth: 90 }}>
              <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: "var(--r-md)", background: "var(--p)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 20px rgba(139,92,246,0.25)" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--p2)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--p)"}
        >+ KPI hinzufügen</button>
      </div>

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
    </div>
  );
}

function KpiRow({ kpi, onUpdate, onDelete }) {
  const [hov, setHov] = useState(false);
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState("");

  const startEdit = (f) => { setEditing(f); setVal(kpi[f] || ""); };
  const commit = () => { if (val.trim()) onUpdate(kpi.id, { [editing]: val.trim() }); setEditing(null); };

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", background: hov ? "var(--bg2)" : "transparent", transition: "background 0.1s" }}
    >
      {[["name", "var(--text2)"], ["value", "var(--p4)"], ["unit", "var(--text3)"], ["date", "var(--text4)"]].map(([f, col]) => (
        <td key={f} style={{ padding: "10px 12px", fontSize: f === "value" ? 14 : f === "date" ? 11 : 13, color: col, fontFamily: f === "value" || f === "date" ? "'JetBrains Mono', monospace" : "inherit", fontWeight: f === "value" ? 500 : 400 }}
          onDoubleClick={() => startEdit(f)}
        >
          {editing === f ? (
            <input
              autoFocus type={f === "date" ? "date" : "text"} value={val}
              onChange={e => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
              style={{ background: "transparent", border: "none", borderBottom: "1px solid rgba(139,92,246,0.4)", color: "var(--text)", fontSize: "inherit", fontFamily: "inherit", outline: "none", width: "100%", padding: "1px 0" }}
            />
          ) : f === "date" ? fmtDate(kpi[f]) : (kpi[f] || "—")}
        </td>
      ))}
      <td style={{ padding: "10px 12px" }}>
        {hov && (
          <button onClick={onDelete} style={{ background: "none", border: "none", color: "var(--text4)", cursor: "pointer", padding: 3, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.12)"; e.currentTarget.style.color = "var(--red)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text4)"; }}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        )}
      </td>
    </motion.tr>
  );
}
