import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

let _showToast = null;

export function useToast() {
  return { toast: _showToast };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timerRef = useRef({});

  _showToast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    timerRef.current[id] = setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  return (
    <>
      {children}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            style={{
              background: "rgba(17,17,21,0.90)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${t.type === "error" ? "rgba(239,68,68,0.3)" : t.type === "success" ? "rgba(34,197,94,0.25)" : "var(--border2)"}`,
              borderRadius: "var(--r-lg)", padding: "10px 16px",
              fontSize: 12, color: "var(--text2)",
              boxShadow: "var(--shadow-md)",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 14 }}>{t.type === "error" ? "⚠" : "✓"}</span>
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
      </div>
    </>
  );
}

export function toast(msg, type = "success") {
  _showToast?.(msg, type);
}
