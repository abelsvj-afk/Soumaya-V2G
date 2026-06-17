import { useMemo } from "react";
import { type GraphData, type GraphNode, CELESTIAL_ICON } from "@brain/shared";
import { TYPE_COLORS } from "../graph/theme.js";

interface Props {
  graph: GraphData;
  onFocus: (id: number) => void;
  onIsolate: (id: number) => void;
}

/** 
 * High-level index of the galaxy's "Hubs" (Sectors).
 * Helps users navigate high-density clusters by focusing on the major stars.
 */
export function SectorView({ graph, onFocus, onIsolate }: Props) {
  const sectors = useMemo(() => {
    // Hubs are the significant bodies that anchor orbital systems.
    return graph.nodes
      .filter((n) => (n.mass ?? 0) >= 0.44) // Giants, Stars, Supergiants
      .sort((a, b) => (b.mass ?? 0) - (a.mass ?? 0));
  }, [graph.nodes]);

  // Helper to count how many bodies are connected to this hub.
  const getSatelliteCount = (hubId: number) => {
    let count = 0;
    for (const l of graph.links) {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (s === hubId || t === hubId) count++;
    }
    return count;
  };

  if (sectors.length === 0) {
    return (
      <div className="dock-body">
        <p className="empty">
          Your galaxy hasn't formed any major sectors yet. 
          Keep adding thoughts and linking them to create gravitational hubs.
        </p>
      </div>
    );
  }

  return (
    <div className="dock-body">
      <p className="sector-intro">
        The galaxy is divided into <strong>{sectors.length} major sectors</strong>. 
        Focus on a hub to explore its connected memories.
      </p>
      <ul className="neighbors sector-list">
        {sectors.map((s) => (
          <li key={s.id} className="sector-card">
            <div className="sector-header">
              <span className="dot" style={{ background: TYPE_COLORS[s.type] }} />
              <span className="sector-name">{s.label}</span>
              <em className="sector-meta">
                {CELESTIAL_ICON[s.celestial ?? "star"]} {Math.round((s.mass ?? 0) * 100)}% mass
              </em>
            </div>
            {s.celestialTitle && <p className="sector-title">"{s.celestialTitle}"</p>}
            <div className="sector-stats">
              <span>{getSatelliteCount(s.id)} satellites orbiting</span>
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
        ))}
      </ul>
    </div>
  );
}
