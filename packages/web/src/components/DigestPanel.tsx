import { useEffect, useState } from "react";
import type { Constellation, DailyDigest, EmotionalTrajectory, Insight } from "@brain/shared";
import { getConstellations, getDailyDigest, getDigest, getEmotionalTrajectory, promoteConstellation, runDigest, runContradictions } from "../api/client.js";
import { colorForType } from "../graph/theme.js";
import { pushToast } from "./Toasts.js";

/** Dependency-free valence sparkline (−1..1). Green above the midline, red below. */
function MoodSparkline({ points }: { points: EmotionalTrajectory["points"] }) {
  if (points.length < 2) return null;
  const W = 240;
  const H = 44;
  const n = points.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H / 2 - (v * (H / 2 - 3)); // +1 → top, −1 → bottom
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valence).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", maxWidth: "100%" }} aria-label="Mood over time">
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <path d={line} fill="none" stroke="#7af9ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.valence)} r={2} fill={p.valence >= 0 ? "#5ee6a0" : "#ff7a59"} />
      ))}
    </svg>
  );
}

export function DigestPanel({
  onFocus,
  onPromoted,
}: {
  onFocus: (id: number) => void;
  /** Called after a cluster is promoted to a constellation hub, so the galaxy refreshes. */
  onPromoted?: () => void;
}) {
  const [items, setItems] = useState<Insight[]>([]);
  const [daily, setDaily] = useState<DailyDigest | null>(null);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [emotional, setEmotional] = useState<EmotionalTrajectory | null>(null);
  const [busy, setBusy] = useState(false);
  // Inline "save as constellation" — which cluster is being named, the draft name, and save-in-flight.
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  async function savePromotion(c: Constellation) {
    const name = draftName.trim();
    if (!name) return;
    setSavingId(c.id);
    try {
      const hub = await promoteConstellation(name, c.nodes.map((n) => n.id));
      if (hub) {
        pushToast(`Constellation "${name}" charted ✦`, "🌌", 5500);
        setPromotingId(null);
        setDraftName("");
        onPromoted?.();
      } else {
        pushToast("Couldn't chart that constellation — try again.", "⚠️", 4500);
      }
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    getDigest()
      .then(setItems)
      .catch(() => {});
    getDailyDigest()
      .then(setDaily)
      .catch(() => {});
    getConstellations()
      .then(setConstellations)
      .catch(() => {});
    getEmotionalTrajectory()
      .then(setEmotional)
      .catch(() => {});
  }, []);

  async function run() {
    setBusy(true);
    try {
      await runDigest();
      setItems(await getDigest());
      setDaily(await getDailyDigest());
      setConstellations(await getConstellations());
    } finally {
      setBusy(false);
    }
  }

  async function scanContradictions() {
    setBusy(true);
    try {
      const found = await runContradictions();
      setItems(await getDigest());
      pushToast(
        found.length > 0
          ? `Found ${found.length} contradiction${found.length === 1 ? "" : "s"} to reconcile ⚡`
          : "No contradictions found — your memories are consistent ✓",
        found.length > 0 ? "⚡" : "✓",
        5000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dock-body">
      {/* Soumaya's daily digest — her read on the day, with links + her take. */}
      {daily && (daily.fresh.length > 0 || daily.expiredActions.length > 0 || daily.greeting) && (
        <section className="daily-digest">
          <h3>🛰️ Soumaya&apos;s daily digest</h3>
          {daily.greeting && <p className="digest-greeting">{daily.greeting}</p>}

          {daily.fresh.length > 0 && (
            <ul className="digest-entries">
              {daily.fresh.map((e) => (
                <li key={e.node.id}>
                  <button
                    className="digest-link"
                    style={{ borderColor: colorForType(e.node.type) }}
                    onClick={() => onFocus(e.node.id)}
                  >
                    {e.node.label}
                  </button>
                  <p className="digest-snippet">{e.snippet}</p>
                  <p className="digest-take">— {e.take}</p>
                </li>
              ))}
            </ul>
          )}

          {daily.expiredActions.length > 0 && (
            <div className="digest-actions">
              <h4>⏰ Action items that cleared</h4>
              <ul>
                {daily.expiredActions.map((a, i) => (
                  <li key={`${a.label}-${i}`}>{a.label}</li>
                ))}
              </ul>
            </div>
          )}

          {daily.cooling.length > 0 && (
            <div className="digest-cooling">
              <h4>❄️ Going cold — drop by to warm them</h4>
              <div className="pills">
                {daily.cooling.map((c) => (
                  <button
                    key={c.node.id}
                    className="pill"
                    style={{ borderColor: colorForType(c.node.type), opacity: 0.55 + 0.45 * (1 - c.entropy) }}
                    onClick={() => onFocus(c.node.id)}
                    title={`${Math.round(c.entropy * 100)}% cold`}
                  >
                    {c.node.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {daily.reminders && daily.reminders.length > 0 && (
            <div className="digest-reminders">
              <h4>⏰ Reminders due</h4>
              <div className="pills">
                {daily.reminders.map((r) => (
                  <button
                    key={r.node.id}
                    className="pill"
                    style={{ borderColor: colorForType(r.node.type) }}
                    onClick={() => onFocus(r.node.id)}
                    title="You asked to be reminded of this"
                  >
                    {r.node.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {daily.closing && <p className="digest-closing">{daily.closing}</p>}
        </section>
      )}

      {/* ML constellations — unsupervised k-means groupings of the memories. */}
      {constellations.length > 0 && (
        <section className="constellations">
          <h3>🌌 Constellations</h3>
          <p className="constellations-sub">
            Memories the model grouped by meaning — your galaxy&apos;s natural regions.
          </p>
          <ul className="constellation-list">
            {constellations.map((c) => (
              <li key={c.id}>
                <div className="constellation-head">
                  <strong>{c.name}</strong>
                  <span className="constellation-meta">
                    {c.nodes.length} · {Math.round(c.cohesion * 100)}% tight
                  </span>
                </div>
                <div className="pills">
                  {c.nodes.slice(0, 8).map((n) => (
                    <button
                      key={n.id}
                      className="pill"
                      style={{ borderColor: colorForType(n.type) }}
                      onClick={() => onFocus(n.id)}
                    >
                      {n.label}
                    </button>
                  ))}
                  {c.nodes.length > 8 && <span className="pill-more">+{c.nodes.length - 8}</span>}
                </div>
                {promotingId === c.id ? (
                  <div className="constellation-promote">
                    <input
                      className="list-filter"
                      value={draftName}
                      autoFocus
                      maxLength={60}
                      placeholder="Name this constellation…"
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && savePromotion(c)}
                    />
                    <button className="mini" disabled={savingId === c.id || !draftName.trim()} onClick={() => savePromotion(c)}>
                      {savingId === c.id ? "Charting…" : "✦ Save"}
                    </button>
                    <button className="mini ghost" onClick={() => setPromotingId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="mini constellation-make"
                    title="Make this a permanent, named constellation hub in your galaxy"
                    onClick={() => {
                      setPromotingId(c.id);
                      setDraftName(c.name);
                    }}
                  >
                    ✦ Save as constellation
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Emotional weather — mood trajectory + detected patterns (offline, free). */}
      {emotional && emotional.sampleSize >= 3 && (
        <section className="emotional-weather" style={{ marginBottom: "1rem" }}>
          <div className="dock-head">
            <h3>🌡️ Emotional weather</h3>
            <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>
              {emotional.trend === "rising" ? "↗ brightening" : emotional.trend === "falling" ? "↘ cooling" : "→ steady"}
            </span>
          </div>
          <MoodSparkline points={emotional.points} />
          <p style={{ fontSize: "0.74rem", opacity: 0.7, margin: "0.35rem 0 0.6rem 0" }}>
            Across {emotional.sampleSize} memories · avg mood {emotional.average >= 0 ? "+" : ""}
            {emotional.average.toFixed(2)} · {emotional.volatility >= 0.5 ? "high swings" : "stable"}
          </p>
          {emotional.patterns.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {emotional.patterns.map((p, i) => (
                <li key={i} style={{ borderLeft: "3px solid #9a7aff", paddingLeft: "0.6rem" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                    {p.type}
                    {p.trigger ? <span style={{ opacity: 0.7, fontWeight: 400 }}> · often around “{p.trigger}”</span> : null}
                    {p.repeats > 1 ? <span style={{ opacity: 0.7, fontWeight: 400 }}> · ×{p.repeats}</span> : null}
                  </div>
                  <div style={{ fontSize: "0.76rem", opacity: 0.85 }}>{p.intervention}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.76rem", opacity: 0.7, margin: 0 }}>No strong patterns yet — your mood reads as steady.</p>
          )}
        </section>
      )}

      <div className="dock-head">
        <h3>Latent connections</h3>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="mini" onClick={run} disabled={busy}>
            {busy ? "Scanning…" : "🔍 Find new links"}
          </button>
          <button className="mini" onClick={scanContradictions} disabled={busy} title="Scan same-topic memories for conflicting beliefs, reversed goals, or shifting identity">
            ⚡ Find contradictions
          </button>
        </div>
      </div>
      {items.length === 0 && (
        <p className="empty">
          No insights yet. Dump a few related thoughts, then hit Synthesize to surface connections
          you haven&apos;t drawn.
        </p>
      )}
      <ul className="insights">
        {items.map((it) => {
          const isConflict = it.kind === "contradiction";
          return (
            <li
              key={it.id}
              style={isConflict ? { borderLeft: "3px solid #ff7a59", paddingLeft: "0.6rem" } : undefined}
            >
              {isConflict && (
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#ff7a59", letterSpacing: "0.04em", marginBottom: "0.2rem" }}>
                  ⚡ CONTRADICTION · RECONCILE
                </div>
              )}
              <p className="insight-text">{it.text}</p>
              <div className="pills">
                {it.nodes.map((n) => (
                  <button
                    key={n.id}
                    className="pill"
                    style={{ borderColor: colorForType(n.type) }}
                    onClick={() => onFocus(n.id)}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
