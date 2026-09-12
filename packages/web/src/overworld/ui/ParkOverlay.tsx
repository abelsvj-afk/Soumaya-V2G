import { buildingNeglect, isNeglected } from "../data/buildingNeglect.js";
import { getSpaceId } from "../../api/http.js";
import { allPlaces } from "../scenes/regionLayout.js";

export interface ParkOverlayProps {
  onClose: () => void;
}

/**
 * The Park (new this round, npc-economy.md) — a real bench to rest on. Its actual substance:
 * a plain-language read on the town's own real wellbeing, reusing buildingNeglect.ts's exact
 * neglect math (the same entropy shape that already dims a memory) rather than inventing a
 * separate "how's the town doing" concept. Never a gate, never a score to optimize — just a
 * quiet look at which buildings have real work waiting.
 */
export function ParkOverlay({ onClose }: ParkOverlayProps) {
  const spaceId = getSpaceId() ?? "default";
  const doorPlaces = allPlaces().filter((p) => p.kind === "door" && p.id !== "park");

  return (
    <div
      role="dialog"
      aria-label="Park"
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
      <h2 style={{ marginTop: 0 }}>🌳 Park</h2>
      <p>A quiet bench. Good for resting — or for checking in on how the town's actually doing.</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {doorPlaces.map((place) => {
          const neglected = isNeglected(buildingNeglect(spaceId, place.id));
          return (
            <li key={place.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
              <span aria-hidden="true">{neglected ? "❓" : "🌱"}</span>
              <span style={{ flex: 1 }}>{place.label}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{neglected ? "could use a visit" : "doing fine"}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
