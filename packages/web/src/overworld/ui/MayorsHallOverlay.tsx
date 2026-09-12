import { buildingNeglect, isNeglected } from "../data/buildingNeglect.js";
import { treasuryBalanceCents } from "../data/townLedger.js";
import { zoneCounts, ZONE_TYPES } from "../data/zoning.js";
import { allPlaces } from "../scenes/regionLayout.js";
import { OverlayShell } from "./OverlayShell.js";

export interface MayorsHallOverlayProps {
  spaceId: string;
  onClose: () => void;
}

const ZONE_ICON: Record<string, string> = { residential: "🏠", commercial: "🏪", sidewalk: "➰", transit: "🚏" };
const ZONE_LABEL: Record<string, string> = { residential: "Residential", commercial: "Commercial", sidewalk: "Sidewalk", transit: "Transit" };

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The Mayor's Office (mayors-hall.md, task #63) — a real dashboard, not a new invented screen:
 * the same Town Treasury (townLedger.ts), per-building neglect (buildingNeglect.ts), and zoning
 * plan (zoning.ts) already real elsewhere, put next to each other at the town level for the
 * first time. Read-only this round — no interaction exists yet to credit as real work.
 */
export function MayorsHallOverlay({ spaceId, onClose }: MayorsHallOverlayProps) {
  const balance = treasuryBalanceCents(spaceId);
  const counts = zoneCounts(spaceId);
  const doorPlaces = allPlaces().filter((p) => p.kind === "door" && p.id !== "mayorsHall");
  const neglectedCount = doorPlaces.filter((p) => isNeglected(buildingNeglect(spaceId, p.id))).length;

  return (
    <OverlayShell icon="🏛️" title="Mayor's Office" onClose={onClose}>
      <p style={{ marginTop: 0 }}>Everything real, in one place — nothing here is a score, just what's actually true right now.</p>

      <h3>Town Treasury</h3>
      <p style={{ marginTop: 0 }}>
        <strong>{formatCents(balance)}</strong> — real earned wages, ready to spend at the Market or on a placement in the Hangar.
      </p>

      <h3>Town Health</h3>
      <p style={{ marginTop: 0 }}>
        {neglectedCount === 0
          ? "Every building's had real work recently. Nothing needs a visit."
          : `${neglectedCount} of ${doorPlaces.length} buildings could use a visit.`}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {doorPlaces.map((place) => {
          const neglected = isNeglected(buildingNeglect(spaceId, place.id));
          return (
            <li key={place.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{neglected ? "❓" : "🌱"}</span>
              <span style={{ flex: 1 }}>{place.label}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{neglected ? "could use a visit" : "doing fine"}</span>
            </li>
          );
        })}
      </ul>

      <h3>Zoning Plan</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ZONE_TYPES.map((type) => (
          <li key={type} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
            <span aria-hidden="true">{ZONE_ICON[type]}</span>
            <span style={{ flex: 1 }}>{ZONE_LABEL[type]}</span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{counts[type]} zoned</span>
          </li>
        ))}
      </ul>
    </OverlayShell>
  );
}
