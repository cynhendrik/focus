import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { Avatar } from "./ui/Avatar";
import { timeAgo } from "../utils/helpers";
import { toast } from "./ui/Toast";

export function CommandPalette({ open, onClose }) {
  const customers = useStore(s => s.customers);
  const notes = useStore(s => s.notes);
  const selectCustomer = useStore(s => s.selectCustomer);
  const setActiveTab = useStore(s => s.setActiveTab);
  const setSelectedNoteId = useStore(s => s.setSelectedNoteId);
  const addCustomer = useStore(s => s.addCustomer);
  const exportData = useStore(s => s.exportData);

  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const q = query.toLowerCase();

  const actions = [
    { id: "new-customer", icon: "＋", label: "Neuer Kunde", sub: "Kunden anlegen", action: () => { onClose(); document.querySelector("[data-add-customer]")?.click(); } },
    { id: "tab-todos", icon: "☑", label: "Tab: To-Dos", sub: "Zu To-Dos wechseln", action: () => { onClose(); setActiveTab("todos"); } },
    { id: "tab-notes", icon: "✎", label: "Tab: Notizen", sub: "Zu Notizen wechseln", action: () => { onClose(); setActiveTab("notes"); } },
    { id: "tab-kpis", icon: "◈", label: "Tab: KPIs", sub: "Zu KPIs wechseln", action: () => { onClose(); setActiveTab("kpis"); } },
    {
      id: "export", icon: "⬇", label: "Daten exportieren", sub: "JSON-Backup herunterladen",
      action: () => {
        const json = exportData();
        const blob = new Blob([json], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cynera-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        onClose(); toast("Backup exportiert ✓");
      }
    },
  ].filter(a => !q || a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q));

  const filteredCustomers = customers.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q)
  ).slice(0, 6);

  const filteredNotes = q.length > 1
    ? notes.filter(n => (n.title || "").toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q)).slice(0, 4)
    : [];

  const allItems = [
    ...actions.map(a => ({ ...a, type: "action" })),
    ...filteredCustomers.map(c => ({ type: "customer", id: c.id, label: c.name, sub: c.company || timeAgo(c.updatedAt), customer: c })),
    ...filteredNotes.map(n => {
      const c = customers.find(x => x.id === n.customerId);
      return { type: "note", id: n.id, label: n.title || "Ohne Titel", sub: c?.name || "", note: n };
    }),
  ];

  const run = (item) => {
    if (!item) return;
    if (item.type === "action") item.action();
    else if (item.type === "customer") { selectCustomer(item.id); onClose(); }
    else if (item.type === "note") {
      selectCustomer(item.note.customerId);
      setActiveTab("notes");
      setSelectedNoteId(item.id);
      onClose();
    }
  };

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, allItems.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(allItems[idx]); }
    else if (e.key === "Escape") onClose();
  };

  useEffect(() => { setIdx(0); }, [query]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const renderSection = (label, items, startIdx) => {
    if (!items.length) return null;
    return (
      <div key={label} style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text4)", padding: "6px 10px 3px" }}>{label}</div>
        {items.map((item, i) => {
          const gi = startIdx + i;
          const sel = gi === idx;
          return (
            <div
              key={item.id}
              data-idx={gi}
              onClick={() => run(item)}
              onMouseEnter={() => setIdx(gi)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderRadius: "var(--r-md)", cursor: "pointer",
                background: sel ? "var(--p5)" : "transparent", transition: "background 0.1s",
              }}
            >
              {item.type === "customer" ? (
                <Avatar name={item.customer.name} id={item.customer.id} size={28} radius={8} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: item.type === "action" && item.id !== "export" ? "var(--p5)" : "var(--bg3)", border: `1px solid ${item.type === "action" && item.id !== "export" ? "rgba(124,58,237,0.2)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                  {item.icon || "✎"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{item.label}</div>
                {item.sub && <div style={{ fontSize: 11, color: "var(--text4)" }}>{item.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  let si = 0;
  const sActions = actions.length; si += sActions;
  const sCustomers = filteredCustomers.length; const ciStart = si; si += sCustomers;
  const sNotes = filteredNotes.length; const niStart = si;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "14vh" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            style={{
              width: 560,
              background: "rgba(17,17,21,0.94)",
              backdropFilter: "blur(32px)",
              WebkitBackdropFilter: "blur(32px)",
              border: "1px solid var(--border2)",
              borderRadius: "var(--r-xl)",
              boxShadow: "var(--shadow-xl)",
              overflow: "hidden",
            }}
          >
            {/* Input */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--text3)" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Suchen oder Befehl eingeben…"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14, fontFamily: "inherit" }}
              />
              <span style={{ fontSize: 10, background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", color: "var(--text4)" }}>esc</span>
            </div>

            {/* Results */}
            <div ref={listRef} style={{ maxHeight: 340, overflowY: "auto", padding: 6 }}>
              {allItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 20px", color: "var(--text4)", fontSize: 13 }}>
                  Keine Ergebnisse für "{query}"
                </div>
              ) : (
                <>
                  {renderSection("Aktionen", actions.map(a => ({ ...a, type: "action" })), 0)}
                  {renderSection("Kunden", filteredCustomers.map(c => ({ type: "customer", id: c.id, label: c.name, sub: c.company || timeAgo(c.updatedAt), customer: c })), ciStart)}
                  {filteredNotes.length > 0 && renderSection("Notizen", filteredNotes.map(n => { const c = customers.find(x => x.id === n.customerId); return { type: "note", id: n.id, label: n.title || "Ohne Titel", sub: c?.name || "", note: n }; }), niStart)}
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 14 }}>
              {[["↑↓", "Navigieren"], ["↵", "Auswählen"], ["Esc", "Schließen"]].map(([k, l]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text4)" }}>
                  <kbd style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>{k}</kbd>
                  {l}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
