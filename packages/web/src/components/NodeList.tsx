import { useMemo, useState } from "react";
import { type GraphNode, CELESTIAL_ICON } from "@brain/shared";
import { TYPE_COLORS } from "../graph/theme.js";

interface Props {
  nodes: GraphNode[];
  onFocus: (id: number) => void;
}

/** Scrollable, filterable index of every memory — click to fly to it. */
export function NodeList({ nodes, onFocus }: Props) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => {
    const f = q.trim().toLowerCase();
    return [...nodes]
      .filter((n) => !f || n.label.toLowerCase().includes(f) || n.content.toLowerCase().includes(f))
      .sort((a, b) => (b.mass ?? 0) - (a.mass ?? 0));
  }, [nodes, q]);

  if (nodes.length === 0) {
    return <p className="empty">No memories yet — dump a thought to begin.</p>;
  }

  return (
    <div className="dock-body">
      <input
        className="list-filter"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Filter ${nodes.length} memories…`}
      />
      <ul className="neighbors node-list">
        {sorted.map((n) => (
          <li key={n.id}>
            <button onClick={() => onFocus(n.id)}>
              <span className="dot" style={{ background: TYPE_COLORS[n.type] }} />
              <span className="nl-label">{n.label}</span>
              <em className="nl-meta">
                {CELESTIAL_ICON[n.celestial ?? "moon"]} {Math.round((n.mass ?? 0) * 100)}%
              </em>
            </button>
          </li>
        ))}
        {sorted.length === 0 && <li className="empty">No matches.</li>}
      </ul>
    </div>
  );
}
