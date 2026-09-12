import { useEffect, useState } from "react";
import type { Insight } from "@brain/shared";
import { getDigest, resolveInsight } from "../../api/client.js";
import { recordBuildingWork } from "../data/npcJobs.js";

export interface ObservatoryOverlayProps {
  spaceId: string;
  onClose: () => void;
}

/**
 * The Observatory (Insights tab equivalent) — climb the tower to see newly-surfaced
 * connections. Real synthesis digest via getDigest(); resolving one calls resolveInsight()
 * and removes it from the star chart, matching DigestPanel's own dismiss behavior. Resolving
 * a real insight is the Observatory's own real work event (npc-economy.md).
 */
export function ObservatoryOverlay({ spaceId, onClose }: ObservatoryOverlayProps) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    void getDigest().then(setInsights);
  }, []);

  const resolve = async (insight: Insight) => {
    setBusyId(insight.id);
    try {
      await resolveInsight(insight.id);
      recordBuildingWork(spaceId, "observatory");
      setInsights((cur) => (cur ? cur.filter((i) => i.id !== insight.id) : cur));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Observatory"
      style={{
        position: "absolute",
        inset: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: 16,
        fontFamily: "monospace",
        overflowY: "auto",
      }}
    >
      <h2 style={{ marginTop: 0 }}>🔭 Observatory</h2>
      {insights === null ? (
        <p>Charting the sky...</p>
      ) : insights.length === 0 ? (
        <p>No new connections surfaced yet — check back after capturing more thoughts.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {insights.map((insight) => (
            <li key={insight.id} style={{ padding: "8px 0", borderBottom: "1px solid #2a2c4a" }}>
              <div>
                {insight.kind === "contradiction" ? "⚡" : "✨"} {insight.text}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{insight.nodes.map((n) => n.label).join(" · ")}</div>
              <button type="button" onClick={() => resolve(insight)} disabled={busyId === insight.id}>
                {busyId === insight.id ? "…" : "Mark seen"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
