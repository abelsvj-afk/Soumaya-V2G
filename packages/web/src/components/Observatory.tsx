import { useEffect, useState } from "react";
import type { GraphNode, Constellation, Insight } from "@brain/shared";
import { getConstellations, getDigest } from "../api/client.js";
import { dailyQuests } from "./quests.js";

/**
 * The Observatory — a calm home that fades in *after* the cinematic fly-in settles
 * (it never touches the intro). A handful of live, click-through cards orient the
 * owner in one glance instead of dropping them into the full galaxy. Progressive
 * disclosure: essentials here, detail one click deeper. Offline-safe — every card
 * degrades to nothing if its data isn't there; the galaxy is always reachable via
 * "Enter the galaxy".
 */
export function Observatory({
  spaceName,
  memories,
  streak,
  fedToday,
  onCapture,
  onFocus,
  onOpenInsights,
  onEnter,
}: {
  spaceName: string;
  memories: GraphNode[]; // non-action nodes
  streak: number;
  fedToday: boolean;
  onCapture: () => void;
  onFocus: (id: number) => void;
  onOpenInsights: () => void;
  onEnter: () => void;
}) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [constellations, setConstellations] = useState<Constellation[]>([]);

  useEffect(() => {
    getDigest()
      .then((items) => setInsight(items[0] ?? null))
      .catch(() => {});
    getConstellations()
      .then((c) => setConstellations(c.slice(0, 3)))
      .catch(() => {});
  }, []);

  const count = memories.length;
  // Most-recent memories ("jump back in") — newest first by created time.
  const recent = [...memories]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 3);

  // New brain: a single calm hero, not an empty card grid.
  if (count === 0) {
    return (
      <div className="observatory" role="dialog" aria-label="Welcome">
        <div className="obs-card obs-hero">
          <h2>Welcome, {spaceName}.</h2>
          <p>Your galaxy is empty. Drop your first thought and watch it become a star.</p>
          <button className="obs-primary" onClick={onCapture}>
            ✍️ Drop your first thought
          </button>
          <button className="obs-enter" onClick={onEnter}>
            Enter the galaxy →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="observatory" role="dialog" aria-label="Observatory home">
      <div className="obs-stack">
        <header className="obs-head">
          <h2>Welcome back, {spaceName}.</h2>
          <span className="obs-sub">
            {count} {count === 1 ? "memory" : "memories"}
            {streak > 0 ? ` · 🔥 ${streak}-day streak` : ""}
          </span>
        </header>

        <button className="obs-card obs-action" onClick={onCapture}>
          <span className="obs-ic">✍️</span>
          <span className="obs-body">
            <span className="obs-title">Capture a thought</span>
            <span className="obs-line">Add to your galaxy — it links itself.</span>
          </span>
        </button>

        {(() => {
          const quests = dailyQuests(memories, fedToday);
          return (
            <div className="obs-card obs-quests">
              <span className="obs-ic">🎯</span>
              <span className="obs-body">
                <span className="obs-title">Today's tending</span>
                <span className="obs-questlist">
                  {quests.map((q) => (
                    <button
                      key={q.id}
                      className={`obs-quest ${q.done ? "done" : ""}`}
                      onClick={() => (q.action === "capture" ? onCapture() : q.focusId != null ? onFocus(q.focusId) : onOpenInsights())}
                      disabled={q.done && q.action === "capture"}
                    >
                      <span className="obs-quest-ic">{q.done ? "✓" : q.icon}</span>
                      {q.text}
                    </button>
                  ))}
                </span>
              </span>
            </div>
          );
        })()}

        {insight && (
          <button
            className="obs-card"
            onClick={() => (insight.nodes[0] ? onFocus(insight.nodes[0].id) : onOpenInsights())}
            title="See the connection"
          >
            <span className="obs-ic">✨</span>
            <span className="obs-body">
              <span className="obs-title">Soumaya surfaced a connection</span>
              <span className="obs-line obs-clamp">{insight.text}</span>
            </span>
          </button>
        )}

        {constellations.length > 0 && (
          <div className="obs-card obs-constellations">
            <span className="obs-ic">✦</span>
            <span className="obs-body">
              <span className="obs-title">Your constellations</span>
              <span className="obs-chips">
                {constellations.map((c) => (
                  <button
                    key={c.id}
                    className="obs-chip"
                    onClick={() => c.nodes[0] && onFocus(c.nodes[0].id)}
                    title={`${c.nodes.length} memories`}
                  >
                    {c.name}
                  </button>
                ))}
              </span>
            </span>
          </div>
        )}

        {recent.length > 0 && (
          <div className="obs-card obs-recent">
            <span className="obs-ic">🛰️</span>
            <span className="obs-body">
              <span className="obs-title">Jump back in</span>
              <span className="obs-chips">
                {recent.map((n) => (
                  <button key={n.id} className="obs-chip" onClick={() => onFocus(n.id)}>
                    {n.label.length > 28 ? `${n.label.slice(0, 28)}…` : n.label}
                  </button>
                ))}
              </span>
            </span>
          </div>
        )}

        <button className="obs-enter" onClick={onEnter}>
          Enter the galaxy →
        </button>
      </div>
    </div>
  );
}
