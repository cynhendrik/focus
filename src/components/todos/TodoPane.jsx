import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { EmptyState } from "../ui/EmptyState";
import { dueDiff, fmtDate } from "../../utils/helpers";

const PRIO_CONFIG = {
  high: { label: "Hoch",    color: "#EF4444", bg: "rgba(239,68,68,0.09)" },
  mid:  { label: "Mittel",  color: "#F59E0B", bg: "rgba(245,158,11,0.09)" },
  low:  { label: "Niedrig", color: "#9CA3AF", bg: "rgba(0,0,0,0.05)" },
};

function getStatus(todo) {
  if (todo.status) return todo.status;
  return todo.completed ? "done" : "open";
}

export function TodoPane({ customerId }) {
  const addTodo          = useStore(s => s.addTodo);
  const updateTodoStatus = useStore(s => s.updateTodoStatus);
  const deleteTodo       = useStore(s => s.deleteTodo);
  const todos            = useStore(s => s.todos.filter(t => t.customerId === customerId && !t.archived));

  const [text,   setText]   = useState("");
  const [prio,   setPrio]   = useState("high");
  const [due,    setDue]    = useState("");
  const [filter, setFilter] = useState("all");

  const handleAdd = () => {
    if (!text.trim()) return;
    addTodo(customerId, text.trim(), prio, due || null);
    setText(""); setDue("");
  };

  let filtered = todos;
  if      (filter === "open")        filtered = todos.filter(t => getStatus(t) === "open");
  else if (filter === "in_progress") filtered = todos.filter(t => getStatus(t) === "in_progress");
  else if (filter === "done")        filtered = todos.filter(t => getStatus(t) === "done");
  else if (filter === "high")        filtered = todos.filter(t => t.prio === "high" && getStatus(t) !== "done");
  else if (filter === "due")         filtered = todos.filter(t => t.due && getStatus(t) !== "done" && dueDiff(t.due) <= 1);

  const openTodos       = filtered.filter(t => getStatus(t) === "open");
  const inProgressTodos = filtered.filter(t => getStatus(t) === "in_progress");
  const doneTodos       = filtered.filter(t => getStatus(t) === "done");

  const inputStyle = {
    background: "var(--bg1)", border: "1px solid var(--border)",
    borderRadius: "var(--r-md)", padding: "9px 12px", color: "var(--text)",
    fontSize: 13, fontFamily: "inherit", outline: "none", transition: "border-color 0.15s",
  };

  const pillStyle = (active) => ({
    padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500,
    border: `1px solid ${active ? "rgba(124,58,237,0.3)" : "var(--border)"}`,
    background: active ? "var(--p5)" : "transparent",
    color: active ? "var(--p)" : "var(--text3)",
    cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 24px" }}>
      {/* Add row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexShrink: 0 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="Neue Aufgabe hinzufügen…"
          style={{ ...inputStyle, flex: 1 }}
          onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.45)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
        <select value={prio} onChange={e => setPrio(e.target.value)} style={{ ...inputStyle, width: 100 }}>
          <option value="low">Niedrig</option>
          <option value="mid">Mittel</option>
          <option value="high">Hoch</option>
        </select>
        <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...inputStyle, width: 140 }} />
        <button
          onClick={handleAdd}
          style={{
            width: 38, height: 38, borderRadius: "var(--r-md)", border: "1px solid var(--border)",
            background: "var(--bg1)", color: "var(--text2)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s", fontFamily: "inherit", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--p5)"; e.currentTarget.style.color = "var(--p)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--bg1)"; e.currentTarget.style.color = "var(--text2)"; }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["all",         "Alle"],
          ["open",        "Offen"],
          ["in_progress", "In Bearbeitung"],
          ["done",        "Erledigt"],
          ["high",        "🔴 Hoch"],
          ["due",         "⏰ Fällig"],
        ].map(([v, l]) => (
          <button key={v} style={pillStyle(filter === v)} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {filtered.length === 0 ? (
          <EmptyState icon="☑" title="Keine Aufgaben" description="Füge eine neue Aufgabe über das Eingabefeld oben hinzu." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {openTodos.length > 0 && (
              <div>
                <SectionLabel label="Offen" count={openTodos.length} />
                <AnimatePresence initial={false}>
                  {openTodos.map(t => (
                    <TodoCard
                      key={t.id}
                      todo={t}
                      status="open"
                      onDone={() => updateTodoStatus(t.id, "done")}
                      onStart={() => updateTodoStatus(t.id, "in_progress")}
                      onDelete={deleteTodo}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {inProgressTodos.length > 0 && (
              <div style={{ marginTop: openTodos.length > 0 ? 12 : 0 }}>
                <SectionLabel label="In Bearbeitung" count={inProgressTodos.length} accent="blue" />
                <AnimatePresence initial={false}>
                  {inProgressTodos.map(t => (
                    <TodoCard
                      key={t.id}
                      todo={t}
                      status="in_progress"
                      onDone={() => updateTodoStatus(t.id, "done")}
                      onStart={() => updateTodoStatus(t.id, "open")}
                      onDelete={deleteTodo}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {doneTodos.length > 0 && (
              <div style={{ marginTop: (openTodos.length + inProgressTodos.length) > 0 ? 12 : 0 }}>
                <SectionLabel label="Erledigt" count={doneTodos.length} />
                <AnimatePresence initial={false}>
                  {doneTodos.map(t => (
                    <TodoCard
                      key={t.id}
                      todo={t}
                      status="done"
                      onDone={() => updateTodoStatus(t.id, "open")}
                      onDelete={deleteTodo}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ label, count, accent }) {
  const isBlue = accent === "blue";
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
      color: isBlue ? "rgba(59,130,246,0.7)" : "var(--text3)",
      padding: "0 2px", marginBottom: 8, marginTop: 2,
      display: "flex", alignItems: "center", gap: 7,
    }}>
      {label}
      <span style={{
        background: isBlue ? "rgba(59,130,246,0.1)" : "var(--bg3)",
        color: isBlue ? "rgba(59,130,246,0.8)" : "var(--text3)",
        padding: "1px 6px", borderRadius: 99, fontSize: 9, fontWeight: 700,
      }}>{count}</span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="11" fill="var(--p)" />
      <path d="M6.5 11l3 3 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InProgressIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9.5" stroke="rgba(59,130,246,0.2)" strokeWidth="1.5" />
      <path d="M11 1.5A9.5 9.5 0 0 1 20.5 11" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="11" r="3.5" fill="rgba(59,130,246,0.25)" />
    </svg>
  );
}

function EmptyIcon({ hovered }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9.5"
        stroke={hovered ? "var(--p)" : "var(--border2)"}
        strokeWidth="1.5"
        style={{ transition: "stroke 0.15s" }}
      />
      {hovered && (
        <path d="M7 11l3 3 5-5" stroke="var(--p)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      )}
    </svg>
  );
}

function TodoCard({ todo, status, onDone, onStart, onDelete }) {
  const [hov, setHov] = useState(false);

  const isDone       = status === "done";
  const isInProgress = status === "in_progress";

  const diff     = dueDiff(todo.due);
  const dueLabel = diff != null
    ? diff < 0  ? `${Math.abs(diff)} Tage überfällig`
    : diff === 0 ? "Heute fällig"
    : diff === 1 ? "Morgen fällig"
    : `Fällig: ${fmtDate(todo.due)}`
    : null;
  const dueColor = diff == null ? null
    : diff < 0  ? "#EF4444"
    : diff <= 1 ? "#F59E0B"
    : "var(--text3)";

  const prio = PRIO_CONFIG[todo.prio] || PRIO_CONFIG.mid;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.25, 0.8, 0.5, 1] }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 14px",
        borderRadius: 12,
        border: isInProgress
          ? "1px solid rgba(59,130,246,0.25)"
          : hov && !isDone
          ? "1px solid var(--border2)"
          : "1px solid var(--border)",
        background: isDone
          ? "transparent"
          : isInProgress
          ? "rgba(59,130,246,0.04)"
          : "var(--bg1)",
        marginBottom: 5,
        position: "relative",
        transition: "border 0.15s, background 0.15s",
      }}
    >
      {/* Blue left accent for in_progress */}
      {isInProgress && (
        <div style={{
          position: "absolute", left: 0, top: 8, bottom: 8, width: 3,
          background: "#3B82F6", borderRadius: "0 3px 3px 0", opacity: 0.6,
        }} />
      )}

      {/* Circle: click = done (or reopen if done) */}
      <motion.button
        onClick={onDone}
        whileTap={{ scale: 0.75 }}
        title={isDone ? "Wieder öffnen" : "Als erledigt markieren"}
        style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
          border: "none", background: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.14 }}
            style={{ display: "flex" }}
          >
            {isDone       ? <CheckIcon /> :
             isInProgress ? <InProgressIcon /> :
             <EmptyIcon hovered={hov} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: isDone ? "var(--text3)" : "var(--text)",
          textDecoration: isDone ? "line-through" : "none",
          textDecorationColor: "var(--text4)",
          lineHeight: 1.4,
          marginBottom: (dueLabel || todo.prio) && !isDone ? 5 : 0,
        }}>
          {todo.text}
        </div>
        {!isDone && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10, fontWeight: 500,
              color: prio.color, background: prio.bg,
              padding: "2px 7px", borderRadius: 99,
            }}>
              {prio.label}
            </span>
            {dueLabel && (
              <span style={{
                fontSize: 10, fontWeight: 500, color: dueColor,
                background: dueColor === "#EF4444" ? "rgba(239,68,68,0.08)"
                  : dueColor === "#F59E0B" ? "rgba(245,158,11,0.08)"
                  : "transparent",
                padding: dueColor !== "var(--text3)" ? "2px 7px" : "2px 0",
                borderRadius: 99,
              }}>
                {dueLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* Starten / Zurück button */}
        <AnimatePresence>
          {hov && !isDone && onStart && (
            <motion.button
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.12 }}
              onClick={isInProgress ? onStart : onStart}
              style={{
                padding: "3px 9px", borderRadius: 99, fontSize: 10, fontWeight: 600,
                border: isInProgress
                  ? "1px solid rgba(59,130,246,0.25)"
                  : "1px solid rgba(124,58,237,0.25)",
                background: isInProgress
                  ? "rgba(59,130,246,0.08)"
                  : "rgba(124,58,237,0.08)",
                color: isInProgress ? "#3B82F6" : "var(--p)",
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.12s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = isInProgress ? "rgba(59,130,246,0.14)" : "rgba(124,58,237,0.14)";
                e.currentTarget.style.color = isInProgress ? "#3B82F6" : "var(--p)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isInProgress ? "rgba(59,130,246,0.08)" : "rgba(124,58,237,0.08)";
                e.currentTarget.style.color = isInProgress ? "#3B82F6" : "var(--p)";
              }}
            >
              {isInProgress ? "↩ Zurück" : "In Bearbeitung"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Delete */}
        <AnimatePresence>
          {hov && (
            <motion.button
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.12 }}
              onClick={() => onDelete(todo.id)}
              style={{
                width: 22, height: 22, borderRadius: 7,
                background: "none", border: "none",
                color: "var(--text4)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#EF4444"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text4)"; }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
