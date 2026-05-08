import { avGrad, getInitials } from "../../utils/helpers";

export function Avatar({ name = "", id = "", size = 32, radius = 10, className = "" }) {
  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: radius,
        background: avGrad(id || name),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.34), fontWeight: 600, color: "#fff",
        flexShrink: 0, letterSpacing: "0.02em",
      }}
    >
      {getInitials(name)}
    </div>
  );
}
