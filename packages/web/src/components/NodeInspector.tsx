import { useEffect, useMemo, useRef, useState } from "react";
import { type GraphData, type GraphNode, CELESTIAL_ICON } from "@brain/shared";
import { deleteNode, setImportance, synthesizeNode } from "../api/client.js";
import { TYPE_COLORS } from "../graph/theme.js";
import { loreFor } from "../graph/lore.js";

interface Props {
  node: GraphNode | null;
  graph: GraphData;
  onFocus: (id: number) => void;
  /** Called after a node's weight is changed so the galaxy can re-render. */
  onChanged?: (id: number) => void;
  /** Called after a node is deleted. */
  onDeleted?: () => void;
  /** Show only this memory + the bodies orbiting it. */
  onIsolate?: (id: number) => void;
}

const end = (v: number | { id: number }): number => (typeof v === "object" ? v.id : v);

export function NodeInspector({ node, graph, onFocus, onChanged, onDeleted, onIsolate }: Props) {
  const [weight, setWeight] = useState<number>(node?.importance ?? 0.4);
  const [insight, setInsight] = useState<string>("");
  const [synthBusy, setSynthBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any shown insight when switching memories.
  useEffect(() => {
    setInsight("");
  }, [node?.id]);

  const runSynthesis = () => {
    if (!node) return;
    setSynthBusy(true);
    setInsight("");
    synthesizeNode(node.id)
      .then((r) => setInsight(r.text))
      .catch((e) => setInsight(`(couldn't synthesize: ${(e as Error).message})`))
      .finally(() => setSynthBusy(false));
  };

  // Keep the slider in sync when a different node is selected.
  useEffect(() => {
    setWeight(node?.importance ?? 0.4);
  }, [node?.id, node?.importance]);

  // Debounced persist so dragging the slider doesn't spam the API.
  const commitWeight = (value: number | null) => {
    if (!node) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setImportance(node.id, value)
        .then(() => onChanged?.(node.id))
        .catch(() => {});
    }, 350);
  };

  // Direct connections, computed from the in-memory graph (correct in demo mode
  // too, and no API round-trip). Fixes "N links but 0 connections".
  const neighbors = useMemo(() => {
    if (!node) return [];
    const ids = new Set<number>();
    for (const l of graph.links) {
      const s = end(l.source as never);
      const t = end(l.target as never);
      if (s === node.id) ids.add(t);
      else if (t === node.id) ids.add(s);
    }
    return graph.nodes.filter((n) => ids.has(n.id));
  }, [node, graph]);

  if (!node) {
    return <p className="empty">Click a star to inspect a memory and its connections.</p>;
  }

  return (
    <div className="dock-body">
      <span className="chip" style={{ background: TYPE_COLORS[node.type] }}>
        {node.type.replace(/_/g, " ")}
      </span>
      {node.celestial && (
        <span className="meta">
          {CELESTIAL_ICON[node.celestial]} {node.celestial} · weight{" "}
          {Math.round((node.mass ?? 0) * 100)}%
          {node.degree ? ` · ${node.degree} link${node.degree === 1 ? "" : "s"}` : ""}
        </span>
      )}
      <h2>{node.label}</h2>
      {node.celestialTitle && (
        <p className="celestial-title" style={{ fontStyle: "italic", opacity: 0.8, marginTop: "-0.5rem", marginBottom: "1rem" }}>
          "{node.celestialTitle}"
        </p>
      )}
      <p className="content">{node.content}</p>
      {node.kind === "action" ? (
        <div className="action-due">
          <span>
            ⏰{" "}
            {node.expiresAt && Date.parse(node.expiresAt) > Date.now()
              ? `due in ~${Math.max(1, Math.round((Date.parse(node.expiresAt) - Date.now()) / 3.6e6))}h`
              : "overdue — will clear soon"}
          </span>
          {onDeleted && (
            <button
              className="mini"
              onClick={() => {
                deleteNode(node.id)
                  .then(() => onDeleted())
                  .catch(() => {});
              }}
            >
              ✓ Done
            </button>
          )}
        </div>
      ) : (
        <p className="lore">✦ {loreFor(node)}</p>
      )}

      <div className="weight">
        <div className="weight-head">
          <h3>Weight (gravity)</h3>
          <button
            className="link-btn"
            title="Reset to the automatic rating (offline, no API)"
            onClick={() => {
              commitWeight(null);
            }}
          >
            auto
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(weight * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setWeight(v);
            commitWeight(v);
          }}
        />
        <span className="weight-val">{Math.round(weight * 100)}%</span>
      </div>

      {onDeleted && (
        <button
          className="delete-btn"
          onClick={() => {
            if (!confirm(`Delete "${node.label}"? This can't be undone.`)) return;
            deleteNode(node.id)
              .then(() => onDeleted())
              .catch(() => {});
          }}
        >
          🗑 Delete memory
        </button>
      )}

      <button className="synth-btn" onClick={runSynthesis} disabled={synthBusy}>
        {synthBusy ? "Connecting…" : "✨ Connect the dots"}
      </button>
      {insight && <p className="insight-text">{insight}</p>}

      {onIsolate && (
        <button className="synth-btn" onClick={() => onIsolate(node.id)}>
          🔭 Isolate this system
        </button>
      )}

      <h3>Connected ({neighbors.length})</h3>
      <ul className="neighbors">
        {neighbors.map((n) => (
          <li key={n.id}>
            <button onClick={() => onFocus(n.id)}>
              <span className="dot" style={{ background: TYPE_COLORS[n.type] }} />
              {n.label}
            </button>
          </li>
        ))}
        {neighbors.length === 0 && <li className="empty">No connections yet.</li>}
      </ul>
    </div>
  );
}
