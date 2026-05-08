export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 30) return `vor ${d} Tag${d !== 1 ? "en" : ""}`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

export function dueDiff(iso) {
  if (!iso) return null;
  return Math.floor((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

export function getInitials(name = "") {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const GRADS = [
  "linear-gradient(135deg,#7C3AED,#4C1D95)",
  "linear-gradient(135deg,#6D28D9,#3B0764)",
  "linear-gradient(135deg,#5B21B6,#7C3AED)",
  "linear-gradient(135deg,#4C1D95,#6D28D9)",
  "linear-gradient(135deg,#7C3AED,#5B21B6)",
];
export const avGrad = (id = "") => GRADS[id.charCodeAt(0) % GRADS.length];

export const TAG_COLORS = {
  meeting: "#3B82F6",
  telefon: "#8B5CF6",
  email: "#F59E0B",
  idee: "#22C55E",
  wichtig: "#EF4444",
  angebot: "#EC4899",
};

export function healthStatus(score) {
  if (score == null) return 'unknown';
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  return 'at-risk';
}

export function healthLabel(score) {
  if (score == null) return '—';
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Warning';
  return 'At Risk';
}

export function healthColor(score) {
  if (score == null) return 'var(--text3)';
  if (score >= 80) return 'var(--green)';
  if (score >= 60) return 'var(--amber)';
  return 'var(--red)';
}

export function generateWhatMatters(customer, healthScore, openTodos, deadlines) {
  const parts = [];
  if (healthScore) {
    if (healthScore.score >= 80)
      parts.push(`${customer.name} zeigt starke Performance mit einem Health Score von ${healthScore.score}.`);
    else if (healthScore.score >= 60)
      parts.push(`${customer.name} hat Verbesserungspotenzial — Health Score bei ${healthScore.score}.`);
    else
      parts.push(`${customer.name} benötigt sofortige Aufmerksamkeit — Health Score bei ${healthScore.score}.`);
  }
  const highPrio = openTodos.filter((t) => t.prio === 'high');
  if (openTodos.length > 0)
    parts.push(`${openTodos.length} offene Aufgabe${openTodos.length !== 1 ? 'n' : ''}${highPrio.length ? `, ${highPrio.length} mit hoher Priorität` : ''}.`);
  const urgent = deadlines.filter((d) => {
    const days = Math.ceil((new Date(d.date) - new Date()) / 86400000);
    return days >= 0 && days <= 7;
  });
  if (urgent.length > 0)
    parts.push(`${urgent.length} Deadline${urgent.length !== 1 ? 's' : ''} in den nächsten 7 Tagen.`);
  return parts.join(' ') || `Alles im Griff bei ${customer.name}. Kein sofortiger Handlungsbedarf.`;
}
