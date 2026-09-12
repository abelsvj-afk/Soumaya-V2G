import { useEffect, useState } from "react";
import type { Journey, LoreEntry } from "@brain/shared";
import { journeysFor } from "../../api/journeys.js";
import { evolveLore, getLore, gradeReview } from "../../api/client.js";
import type { CreatureEntity } from "../types.js";

export interface CreatureSummaryOverlayProps {
  creature: CreatureEntity;
  onGreet: () => void;
  onClose: () => void;
  busy?: boolean;
  /** spaced-repetition.md — called after a real recall attempt is graded, so the caller can
   *  refresh the world snapshot (the same pattern onGreet already uses for tendNode). */
  onGraded?: () => void;
}

/**
 * The creature Summary screen (Details tab equivalent) — stats, type, connection count,
 * and which Journey it belongs to (idea.md: "a memory can belong to no Journey" — shown
 * as "Uncharted", never an error). Every interaction with a creature opens this first;
 * greeting (FR11/FR12) is one action available from it, not a separate screen.
 *
 * spaced-repetition.md — when the node is on the server's SM-2 due list (`dueForRecall`,
 * a DIFFERENT signal from `isDue`'s ambient entropy dim), it also grows a real "Recall check":
 * content stays hidden until you choose to try to recall it first, then grades the real
 * attempt via the now-finally-used `gradeReview` — never a client-side memory-strength guess.
 *
 * Lore (revived, docs/overworld/storytelling-revival.md, task #71) — a memory's own real,
 * append-only evolving story (`getLore`/`evolveLore`, already fully working on the server,
 * only ever orphaned client-side). Shows the latest chapter; "✦ Evolve" writes the next one.
 */
export function CreatureSummaryOverlay({ creature, onGreet, onClose, busy, onGraded }: CreatureSummaryOverlayProps) {
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [lore, setLore] = useState<LoreEntry[] | null>(null);
  const [evolving, setEvolving] = useState(false);

  useEffect(() => {
    void journeysFor("node", creature.nodeId).then(setJourneys);
    void getLore("memory", String(creature.nodeId)).then(setLore);
  }, [creature.nodeId]);

  const evolve = async () => {
    setEvolving(true);
    try {
      setLore(await evolveLore("memory", String(creature.nodeId)));
    } finally {
      setEvolving(false);
    }
  };

  const grade = async (remembered: boolean) => {
    setGrading(true);
    try {
      await gradeReview(creature.nodeId, remembered);
      onGraded?.();
    } finally {
      setGrading(false);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-label={creature.name}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: "12px 16px",
        fontFamily: "monospace",
        borderTop: "2px solid #4b4b8f",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        {creature.rarity.badge} {creature.name}
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        {creature.rarity.label} · {creature.celestial} · {creature.type}
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Connections: {creature.degree}
        {creature.isDue && <span> · dimming — hasn't been visited in a while</span>}
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        {journeys === null
          ? "Checking which Journey this belongs to..."
          : journeys.length === 0
            ? "Uncharted — not part of a Journey yet."
            : `Journey: ${journeys.map((j) => j.title).join(", ")}`}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onGreet} disabled={busy}>
          {busy ? "…" : "Greet"}
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #2a2c55" }}>
        {lore === null ? (
          <div style={{ fontSize: 12, opacity: 0.8 }}>Reading its story so far...</div>
        ) : lore.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.8 }}>No story chronicled yet.</div>
        ) : (
          <>
            <div style={{ fontSize: 12, opacity: 0.6 }}>Chapter {lore[lore.length - 1]!.version}</div>
            <div style={{ fontSize: 12 }}>{lore[lore.length - 1]!.text}</div>
          </>
        )}
        <button type="button" style={{ marginTop: 6 }} disabled={evolving} onClick={() => void evolve()}>
          {evolving ? "…" : "✦ Evolve"}
        </button>
      </div>
      {creature.dueForRecall && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #2a2c55" }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>💭 This one's ready for a recall check.</div>
          {!revealed ? (
            <button type="button" style={{ marginTop: 6 }} onClick={() => setRevealed(true)}>
              Try to recall it first
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" disabled={grading} onClick={() => void grade(true)}>
                {grading ? "…" : "I remembered"}
              </button>
              <button type="button" disabled={grading} onClick={() => void grade(false)}>
                {grading ? "…" : "Let's refresh it"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
