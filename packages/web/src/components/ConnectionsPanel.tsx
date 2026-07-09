import { useEffect, useRef, useState } from "react";
import {
  getCandidates,
  acceptCandidate,
  dismissCandidate,
  linkMemories,
  pruneWeakLinks,
  search,
  type Candidate,
  type SearchHit,
} from "../api/client.js";
import { pushToast } from "./Toasts.js";
import { playSfx } from "../graph/sfx.js";

/**
 * Suggested Connections — YOU control the linking. Soumaya no longer silently wires
 * everything together: the ones she's unsure of (or holds back past her per-memory
 * cap) wait here, and you can also declutter weak links she'd already drawn into this
 * same queue. Connect the ones that matter, dismiss the ones that don't — and link any
 * two memories yourself, no AI required.
 */
export function ConnectionsPanel({
  onClose,
  onChanged,
  onFocus,
}: {
  onClose: () => void;
  /** A link was created/removed → refresh the galaxy. */
  onChanged?: () => void;
  /** Fly the camera to a memory. */
  onFocus?: (id: number) => void;
}) {
  const [items, setItems] = useState<Candidate[]>([]);
  const [pruning, setPruning] = useState(false);

  const refresh = () => getCandidates().then((d) => setItems(d.candidates)).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const accept = async (c: Candidate) => {
    setItems((xs) => xs.filter((x) => x.id !== c.id));
    if (await acceptCandidate(c.id)) {
      playSfx("achievement");
      pushToast("Connected ✦", "🔗", 2500);
      onChanged?.();
    }
  };
  const dismiss = async (c: Candidate) => {
    setItems((xs) => xs.filter((x) => x.id !== c.id));
    await dismissCandidate(c.id);
  };
  const declutter = async () => {
    setPruning(true);
    try {
      const { pruned, anchorPruned, weakPruned } = await pruneWeakLinks();
      if (pruned > 0) {
        const bits = [
          anchorPruned > 0 ? `${anchorPruned} wrong link${anchorPruned === 1 ? "" : "s"} removed` : "",
          weakPruned > 0 ? `${weakPruned} weak one${weakPruned === 1 ? "" : "s"} sent here to review` : "",
        ].filter(Boolean);
        pushToast(`Decluttered — ${bits.join(", ")}.`, "🧹", 6000);
        onChanged?.();
        await refresh();
      } else {
        pushToast("Nothing to clear — your galaxy's already tidy.", "✨", 4000);
      }
    } finally {
      setPruning(false);
    }
  };

  return (
    <div className="settings-overlay" role="dialog" aria-label="Suggested connections">
      <div className="settings-card">
        <header className="settings-head">
          <h2>🔗 Connections</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <ManualLink onLinked={() => { onChanged?.(); refresh(); }} />

        <section className="settings-section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Suggested {items.length > 0 ? `(${items.length})` : ""}</h3>
            <button className="mini ghost" onClick={() => void declutter()} disabled={pruning} title="Move the weakest links here so you can review them">
              {pruning ? "Clearing…" : "🧹 Declutter weak links"}
            </button>
          </div>
          <p className="settings-note" style={{ fontSize: "12px", opacity: 0.75, margin: "2px 0 10px" }}>
            Links Soumaya wasn't sure about, or that you decluttered — connect the real ones, dismiss the rest.
          </p>
          {items.length === 0 ? (
            <p className="settings-note" style={{ opacity: 0.6 }}>Nothing waiting. New suggestions show up as you add memories.</p>
          ) : (
            <ul className="cand-list">
              {items.map((c) => (
                <li key={c.id} className="cand-item">
                  <div className="cand-pair">
                    <button className="cand-node" onClick={() => onFocus?.(c.a)} title="Fly to it">{c.aLabel}</button>
                    <span className="cand-link" aria-hidden>↔</span>
                    <button className="cand-node" onClick={() => onFocus?.(c.b)} title="Fly to it">{c.bLabel}</button>
                  </div>
                  {c.reason && <div className="cand-reason">{c.origin === "pruned" ? "🧹 " : "💭 "}{c.reason}</div>}
                  <div className="cand-actions">
                    <button className="cand-yes" onClick={() => void accept(c)}>Connect</button>
                    <button className="mini ghost" onClick={() => void dismiss(c)}>Dismiss</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Search two memories and connect them yourself — the manual-linking path. */
function ManualLink({ onLinked }: { onLinked: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [a, setA] = useState<SearchHit | null>(null);
  const [b, setB] = useState<SearchHit | null>(null);
  const t = useRef<number | null>(null);

  useEffect(() => {
    if (t.current) window.clearTimeout(t.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    t.current = window.setTimeout(() => {
      void search(q.trim()).then((r) => setHits(r.slice(0, 6)));
    }, 250);
    return () => {
      if (t.current) window.clearTimeout(t.current);
    };
  }, [q]);

  const pick = (h: SearchHit) => {
    if (!a) setA(h);
    else if (!b && h.id !== a.id) setB(h);
    setQ("");
    setHits([]);
  };
  const connect = async () => {
    if (!a || !b) return;
    if (await linkMemories(a.id, b.id)) {
      playSfx("achievement");
      pushToast("Linked ✦", "🔗", 2500);
      setA(null);
      setB(null);
      onLinked();
    } else {
      pushToast("Couldn't link those — try again.", "⚠️", 3000);
    }
  };

  return (
    <section className="settings-section">
      <h3>Connect two memories yourself</h3>
      <div className="ml-slots">
        <span className={`ml-slot ${a ? "filled" : ""}`}>{a ? a.label : "Pick the first…"}{a && <button onClick={() => setA(null)} aria-label="clear">×</button>}</span>
        <span className="ml-x" aria-hidden>↔</span>
        <span className={`ml-slot ${b ? "filled" : ""}`}>{b ? b.label : "Pick the second…"}{b && <button onClick={() => setB(null)} aria-label="clear">×</button>}</span>
        <button className="cand-yes" onClick={() => void connect()} disabled={!a || !b}>Link</button>
      </div>
      <input
        className="ml-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={a && !b ? "Search the second memory…" : "Search a memory to connect…"}
      />
      {hits.length > 0 && (
        <ul className="ml-hits">
          {hits.map((h) => (
            <li key={h.id}>
              <button onClick={() => pick(h)}>{h.label}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
