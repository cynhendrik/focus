import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Modal({ open, onClose, title, children, maxWidth = 420 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(0,0,0,0.70)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            style={{
              width: "100%", maxWidth,
              background: "var(--bg1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: 24,
              boxShadow: "var(--shadow-xl)",
            }}
          >
            {title && (
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18, letterSpacing: "-0.01em", color: "var(--text)" }}>
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
