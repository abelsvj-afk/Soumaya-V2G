import { useEffect, useState } from "react";
import { COGNITIVE_KINDS, COGNITIVE_META, type CognitiveKind } from "@brain/shared";
import { getCognitive, createCognitive, setCognitiveProgress, type CognitiveItem } from "../api/client.js";
import { pushToast } from "./Toasts.js";
import { playSfx } from "../graph/sfx.js";

/**
 * The Mind tab — the COGNITIVE LAYER. Beyond what you've remembered, this is what
 * you're pursuing and becoming: goals your memories drift toward, ideas, skills
 * that level up, the people you orbit, your identity, your mental models. Each is
 * a first-class body in the galaxy (colour/icon from the single-source
 * COGNITIVE_META). Create them here; Soumaya then pulls related memories into
 * their orbit over time.
 */
export function MindPanel({
  onFocus,
  demo,
  onChanged,
}: {
  onFocus: (id: number) => void;
  demo?: boolean;
  /** Refresh the galaxy after a new cognitive body is charted (so it appears). */
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<CognitiveItem[]>([]);
  const [kind, setKind] = useState<CognitiveKind>("goal");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const refresh = () => getCognitive().then(setItems).catch(() => {});
  useEffect(() => {
    if (!demo) refresh();
  }, [demo]);

  if (demo) {
    return <p className="empty">The cognitive layer lives in your own brain — sign in to map your mind.</p>;
  }

  const add = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const r = await createCognitive(kind, label.trim(), content.trim() || undefined);
      if (r) {
        playSfx("achievement");
        pushToast(`${COGNITIVE_META[kind].icon} ${COGNITIVE_META[kind].label} added to your galaxy`, "🧠", 4500);
        setLabel("");
        setContent("");
        setAdding(false);
        await refresh();
        onChanged?.(); // reload the galaxy so the new body appears + is focusable
      } else {
        pushToast("Couldn't add that — try again.", "⚠️", 4000);
      }
    } finally {
      setBusy(false);
    }
  };

  const bumpProgress = async (it: CognitiveItem, delta: number) => {
    const next = Math.max(0, Math.min(1, (it.progress ?? 0) + delta));
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, progress: next } : x)));
    await setCognitiveProgress(it.id, next);
  };

  // Group by kind, in the canonical order.
  const byKind = new Map<CognitiveKind, CognitiveItem[]>();
  for (const it of items) {
    const k = it.kind as CognitiveKind;
    if (!COGNITIVE_META[k]) continue;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(it);
  }

  return (
    <div className="dock-body mind-panel">
      <p className="companion-hint">
        Your mind, not just your memories: what you're <b>pursuing</b> and <b>becoming</b>. Add a
        goal, idea, skill, person, identity or mental model — Soumaya pulls related memories into its
        orbit over time.
      </p>

      {adding ? (
        <div className="companion-new">
          <div className="mind-kind-row">
            {COGNITIVE_KINDS.map((k) => (
              <button
                key={k}
                className={`mind-kind ${kind === k ? "on" : ""}`}
                onClick={() => setKind(k)}
                title={COGNITIVE_META[k].blurb}
              >
                {COGNITIVE_META[k].icon} {COGNITIVE_META[k].label}
              </button>
            ))}
          </div>
          <input
            className="tag-input wide"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Name this ${COGNITIVE_META[kind].label.toLowerCase()}…`}
          />
          <textarea
            className="companion-textarea"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={COGNITIVE_META[kind].blurb}
          />
          <div className="row">
            <button onClick={add} disabled={busy || !label.trim()}>
              {busy ? "Adding…" : `Add ${COGNITIVE_META[kind].label}`}
            </button>
            <button className="mini" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="companion-add-btn" onClick={() => setAdding(true)}>+ Map something in your mind</button>
      )}

      {items.length === 0 && !adding && (
        <p className="empty small">Nothing mapped yet. Start with a goal you're working toward.</p>
      )}

      {COGNITIVE_KINDS.filter((k) => byKind.has(k)).map((k) => (
        <section key={k} className="mind-section">
          <h3 style={{ color: COGNITIVE_META[k].color }}>
            {COGNITIVE_META[k].icon} {COGNITIVE_META[k].label}s
          </h3>
          <ul className="mind-list">
            {byKind.get(k)!.map((it) => (
              <li key={it.id} className="mind-card" style={{ borderLeftColor: COGNITIVE_META[k].color }}>
                <button className="mind-card-main" onClick={() => onFocus(it.id)} title="Fly to it">
                  <span className="mind-card-label">{it.label}</span>
                  <span className="mind-card-sub">{it.degree} linked</span>
                </button>
                {COGNITIVE_META[k].hasProgress && (
                  <div className="mind-progress">
                    <button className="mini" onClick={() => void bumpProgress(it, -0.1)} title="Less">–</button>
                    <span className="mind-bar">
                      <span style={{ width: `${Math.round((it.progress ?? 0) * 100)}%`, background: COGNITIVE_META[k].color }} />
                    </span>
                    <button className="mini" onClick={() => void bumpProgress(it, 0.1)} title="More">+</button>
                    <span className="mind-pct">{Math.round((it.progress ?? 0) * 100)}%</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
