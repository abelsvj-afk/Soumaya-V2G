import { useEffect, useState } from "react";
import type { Constellation, DailyDigest, Insight } from "@brain/shared";
import { getConstellations, getDailyDigest, getDigest, promoteConstellation, runDigest, runContradictions } from "../api/client.js";
import { colorForType } from "../graph/theme.js";
import { pushToast } from "./Toasts.js";

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
