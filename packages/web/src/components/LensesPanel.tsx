import { useEffect, useState, useCallback } from "react";
import type { Lens, LensQuery } from "@brain/shared";
import { getLenses, createLens, deleteLens, updateLens, lensNodes } from "../api/lenses.js";
import { pushToast } from "./Toasts.js";

/**
 * Smart Lenses (the "self-updating view" pattern). A lens is a saved query the galaxy
 * renders as a live constellation: open one and the galaxy isolates to just its matches,
 * staying current as you add memories. This panel lists your lenses (with live counts),
 * opens them, and has a small dropdown builder — no query language, offline, space-scoped.
 *
 * `presetLinkedTo` (a focused node) turns the builder into a one-tap "everything linked to
 * this" lens — the way a hand-made view becomes reusable.
 */
export function LensesPanel({
  onClose,
  onOpen,
  presetLinkedTo,
}: {
  onClose: () => void;
  /** Isolate the galaxy to these ids under this lens name. */
  onOpen: (ids: number[], name: string) => void;
  presetLinkedTo?: { id: number; label: string } | null;
}) {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [emotion, setEmotion] = useState<"" | "positive" | "heavy" | "neutral">("");
  const [state, setState] = useState<"" | "active" | "archived" | "due" | "orphan">("");
  const [importance, setImportance] = useState<"" | "0.3" | "0.5" | "0.7">("");
  const [within, setWithin] = useState<"" | "7" | "30" | "90">("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => getLenses().then(setLenses).catch(() => {}), []);
  useEffect(() => {
    refresh();
    // A lens's count is live — re-fetch when a memory is added.
    const on = () => refresh();
    window.addEventListener("brain-memory-added", on);
    return () => window.removeEventListener("brain-memory-added", on);
  }, [refresh]);

  const buildQuery = (): LensQuery => {
    const q: LensQuery = {};
    if (text.trim()) q.text = text.trim();
    if (emotion) q.emotion = emotion;
    if (state) q.state = state;
    if (importance) q.minImportance = Number(importance);
    if (within) q.withinDays = Number(within);
    if (presetLinkedTo) q.linkedTo = presetLinkedTo.id;
    return q;
  };

  const save = async () => {
    const finalName = name.trim() || (presetLinkedTo ? `Linked to ${presetLinkedTo.label}` : "My lens");
    setBusy(true);
    const lens = await createLens(finalName, buildQuery(), true);
    setBusy(false);
    if (!lens) {
      pushToast("Couldn't save that lens — try again.", "⚠️", 3500);
      return;
    }
    pushToast(`Lens saved: ${finalName} (${lens.count ?? 0})`, "⧉", 3500);
    setBuilding(false);
    setName(""); setText(""); setEmotion(""); setState(""); setImportance(""); setWithin("");
    refresh();
  };

  const open = async (l: Lens) => {
    const ids = await lensNodes(l.id);
    if (ids.length === 0) {
      pushToast(`"${l.name}" has no matches right now.`, "⧉", 3000);
      return;
    }
    onOpen(ids, l.name);
    onClose();
  };

  const remove = async (l: Lens) => {
    setLenses((xs) => xs.filter((x) => x.id !== l.id));
    await deleteLens(l.id);
  };

  const togglePin = async (l: Lens) => {
    await updateLens(l.id, { pinned: !l.pinned });
    refresh();
  };

  const desc = (q: LensQuery): string => {
    const parts: string[] = [];
    if (q.text) parts.push(`"${q.text}"`);
    if (q.kinds?.length) parts.push(q.kinds.join("/"));
    if (q.emotion) parts.push(q.emotion);
    if (q.state && q.state !== "active") parts.push(q.state);
    if (q.minImportance) parts.push(`≥${q.minImportance} imp`);
    if (q.withinDays) parts.push(`≤${q.withinDays}d`);
    if (q.linkedTo) parts.push("linked");
    return parts.join(" · ") || "all active memories";
  };

  return (
    <div className="lenses-overlay" role="dialog" aria-label="Smart Lenses" onClick={onClose}>
      <div className="lenses-card" onClick={(e) => e.stopPropagation()}>
        <header className="lenses-head">
          <h2>⧉ Smart Lenses</h2>
          <button className="lenses-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p className="lenses-hint">
          A lens is a saved view — open one and the galaxy shows only its stars, staying live as your
          brain grows.
        </p>

        <ul className="lenses-list">
          {lenses.length === 0 && <li className="lenses-empty">No lenses yet — build one below.</li>}
          {lenses.map((l) => (
            <li key={l.id} className="lens-row">
              <button className="lens-open" onClick={() => void open(l)} title="Open this view">
                <span className="lens-name">{l.pinned ? "📌 " : ""}{l.name}</span>
                <span className="lens-desc">{desc(l.query)}</span>
              </button>
              <span className="lens-count" aria-label={`${l.count ?? 0} matches`}>{l.count ?? 0}</span>
              <button className="lens-mini" onClick={() => void togglePin(l)} title={l.pinned ? "Unpin" : "Pin"}>{l.pinned ? "📌" : "📍"}</button>
              <button className="lens-mini" onClick={() => void remove(l)} title="Delete lens" aria-label="Delete lens">🗑</button>
            </li>
          ))}
        </ul>

        {presetLinkedTo && !building && (
          <button className="lenses-newbtn" onClick={() => { setBuilding(true); setName(`Linked to ${presetLinkedTo.label}`); }}>
            ⧉ Save “everything linked to {presetLinkedTo.label}” as a lens
          </button>
        )}
        {!building && (
          <button className="lenses-newbtn" onClick={() => setBuilding(true)}>+ New lens</button>
        )}

        {building && (
          <div className="lens-builder">
            <input className="lens-input" value={name} maxLength={60} placeholder="Lens name (e.g. Heavy projects)" onChange={(e) => setName(e.target.value)} />
            <input className="lens-input" value={text} maxLength={200} placeholder="Keyword (optional)" onChange={(e) => setText(e.target.value)} />
            <div className="lens-fields">
              <label>Mood
                <select value={emotion} onChange={(e) => setEmotion(e.target.value as typeof emotion)}>
                  <option value="">any</option><option value="positive">joyful</option><option value="heavy">heavy</option><option value="neutral">neutral</option>
                </select>
              </label>
              <label>State
                <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
                  <option value="">active</option><option value="due">due for recall</option><option value="orphan">orphans</option><option value="archived">archived</option>
                </select>
              </label>
              <label>Importance
                <select value={importance} onChange={(e) => setImportance(e.target.value as typeof importance)}>
                  <option value="">any</option><option value="0.3">≥ 0.3</option><option value="0.5">≥ 0.5</option><option value="0.7">≥ 0.7</option>
                </select>
              </label>
              <label>Recency
                <select value={within} onChange={(e) => setWithin(e.target.value as typeof within)}>
                  <option value="">any time</option><option value="7">last 7 days</option><option value="30">last 30 days</option><option value="90">last 90 days</option>
                </select>
              </label>
            </div>
            {presetLinkedTo && <p className="lens-note">Includes: linked to “{presetLinkedTo.label}”.</p>}
            <div className="lens-builder-actions">
              <button className="lens-save" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save lens"}</button>
              <button className="lens-mini ghost" onClick={() => setBuilding(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
