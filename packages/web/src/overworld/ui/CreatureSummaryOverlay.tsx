import { useEffect, useState } from "react";
import type { Journey } from "@brain/shared";
import { journeysFor } from "../../api/journeys.js";
import type { CreatureEntity } from "../types.js";

export interface CreatureSummaryOverlayProps {
  creature: CreatureEntity;
  onGreet: () => void;
  onClose: () => void;
  busy?: boolean;
}

/**
 * The creature Summary screen (Details tab equivalent) — stats, type, connection count,
 * and which Journey it belongs to (idea.md: "a memory can belong to no Journey" — shown
 * as "Uncharted", never an error). Every interaction with a creature opens this first;
 * greeting (FR11/FR12) is one action available from it, not a separate screen.
 */
export function CreatureSummaryOverlay({ creature, onGreet, onClose, busy }: CreatureSummaryOverlayProps) {
  const [journeys, setJourneys] = useState<Journey[] | null>(null);

  useEffect(() => {
    void journeysFor("node", creature.nodeId).then(setJourneys);
  }, [creature.nodeId]);

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
    </div>
  );
}
