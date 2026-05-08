export function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 8, textAlign: "center", padding: 40, color: "var(--text3)",
    }}>
      <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 4 }}>{icon}</div>
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)" }}>{title}</p>
      {description && <p style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>{description}</p>}
      {action}
    </div>
  );
}
