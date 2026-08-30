import { useMemo } from "react";
import { type GraphData, type GraphNode, CELESTIAL_ICON, SECTOR_MASS } from "@brain/shared";
import { colorForType } from "../graph/theme.js";

interface Props {
  graph: GraphData;
  onFocus: (id: number) => void;
  onIsolate: (id: number) => void;
}

const end = (v: number | { id: number }): number => (typeof v === "object" ? v.id : v);
const msOf = (raw?: string): number => {
  if (!raw) return NaN;
  return Date.parse(raw.includes("Z") || raw.includes("+") ? raw : raw.replace(" ", "T") + "Z");
};
function toneOf(avg: number): { label: string; color: string } {
  if (avg > 0.2) return { label: "warm", color: "#ffcf6b" };
  if (avg < -0.2) return { label: "heavy", color: "#6bb7ff" };
  return { label: "even", color: "#9b96c4" };
}

/**
 * High-level index of the galaxy's "Hubs" (Sectors). Each card now also explains
 * WHY its memories belong together — shared tags, shared people, the time window
 * they span, and the cluster's emotional tone — so a cluster is legible, not just
 * a blob.
 */
export function SectorView({ graph, onFocus, onIsolate }: Props) {
  // Adjacency once, for system membership + context aggregation.
  const adj = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const l of graph.links) {
      const s = end(l.source as any);
      const t = end(l.target as any);
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [graph.links]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const sectors = useMemo(
    () => graph.nodes.filter((n) => (n.mass ?? 0) >= SECTOR_MASS).sort((a, b) => (b.mass ?? 0) - (a.mass ?? 0)),
    [graph.nodes],
  );

  /** Why this hub's system coheres: shared tags/people/time/tone. */
  const contextFor = (hub: GraphNode) => {
    const members: GraphNode[] = [hub];
    for (const id of adj.get(hub.id) ?? []) {
      const n = byId.get(id);
      if (n) members.push(n);
    }
    // Shared tags (appear in ≥2 members).
    const tagFreq = new Map<string, number>();
    for (const m of members) for (const t of m.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
    const tags = [...tagFreq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    // People in the system.
    const people = members
      .filter((m) => m.type === "person" && m.id !== hub.id)
      .map((m) => m.label)
      .slice(0, 3);
    // Time span.
    const times = members.map((m) => msOf(m.occurredAt ?? m.createdAt)).filter((t) => !Number.isNaN(t));
    let span = "";
    if (times.length > 1) {
      const days = Math.round((Math.max(...times) - Math.min(...times)) / 8.64e7);
      span = days > 365 ? `~${Math.round(days / 365)}y` : days > 45 ? `~${Math.round(days / 30)}mo` : days > 0 ? `~${days}d` : "same day";
    }
    // Emotional tone.
    const ews = members.map((m) => m.emotionalWeight).filter((x): x is number => typeof x === "number");
    const tone = toneOf(ews.length ? ews.reduce((s, x) => s + x, 0) / ews.length : 0);
    return { count: members.length, tags, people, span, tone };
  };

  if (sectors.length === 0) {
    return (
      <div className="dock-body">
        <p className="empty">
          Your galaxy hasn't formed any major sectors yet. Keep adding thoughts and linking
          them to create gravitational hubs.
        </p>
      </div>
    );
  }

  return (
    <div className="dock-body">
      <p className="sector-intro">
        The galaxy is divided into <strong>{sectors.length} major sectors</strong>. Focus on a
        hub to explore its connected memories.
      </p>
      <ul className="neighbors sector-list">
        {sectors.map((s) => {
          const ctx = contextFor(s);
          return (
            <li key={s.id} className="sector-card">
              <div className="sector-header">
                <span className="dot" style={{ background: colorForType(s.type) }} />
                <span className="sector-name">{s.label}</span>
                <em className="sector-meta">
                  {CELESTIAL_ICON[s.celestial ?? "star"]} {Math.round((s.mass ?? 0) * 100)}% mass
                </em>
              </div>
              {s.celestialTitle && <p className="sector-title">"{s.celestialTitle}"</p>}
              <div className="sector-stats">
                <span>{ctx.count - 1} memories orbiting</span>
              </div>
              <div className="sector-context">
                <span className="sector-ctx" title="emotional tone">
                  <span className="nl-emodot" style={{ background: ctx.tone.color }} /> {ctx.tone.label}
                </span>
                {ctx.span && (
                  <span className="sector-ctx" title="time span">
                    🗓 {ctx.span}
                  </span>
                )}
                {ctx.people.length > 0 && (
                  <span className="sector-ctx" title="shared people">
                    👥 {ctx.people.join(", ")}
                  </span>
                )}
                {ctx.tags.map((t) => (
                  <span key={t} className="sector-ctx tag" title="shared tag">
                    #{t}
                  </span>
                ))}
              </div>
              <div className="sector-actions">
                <button className="mini" onClick={() => onFocus(s.id)}>
                  ⊙ Focus
                </button>
                <button className="mini primary" onClick={() => onIsolate(s.id)}>
                  🔭 Enter System
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
