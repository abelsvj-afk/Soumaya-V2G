import { useEffect, useState } from "react";
import type { DailyDigest, Insight } from "@brain/shared";
import { getDailyDigest, getDigest, runDigest } from "../api/client.js";
import { TYPE_COLORS } from "../graph/theme.js";

export function DigestPanel({ onFocus }: { onFocus: (id: number) => void }) {
  const [items, setItems] = useState<Insight[]>([]);
  const [daily, setDaily] = useState<DailyDigest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDigest()
      .then(setItems)
      .catch(() => {});
    getDailyDigest()
      .then(setDaily)
      .catch(() => {});
  }, []);

  async function run() {
    setBusy(true);
    try {
      await runDigest();
      setItems(await getDigest());
      setDaily(await getDailyDigest());
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
                    style={{ borderColor: TYPE_COLORS[e.node.type] }}
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

          {daily.closing && <p className="digest-closing">{daily.closing}</p>}
        </section>
      )}

      <div className="dock-head">
        <h3>Latent connections</h3>
        <button className="mini" onClick={run} disabled={busy}>
          {busy ? "Scanning…" : "🔍 Find new links"}
        </button>
      </div>
      {items.length === 0 && (
        <p className="empty">
          No insights yet. Dump a few related thoughts, then hit Synthesize to surface connections
          you haven&apos;t drawn.
        </p>
      )}
      <ul className="insights">
        {items.map((it) => (
          <li key={it.id}>
            <p className="insight-text">{it.text}</p>
            <div className="pills">
              {it.nodes.map((n) => (
                <button
                  key={n.id}
                  className="pill"
                  style={{ borderColor: TYPE_COLORS[n.type] }}
                  onClick={() => onFocus(n.id)}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
