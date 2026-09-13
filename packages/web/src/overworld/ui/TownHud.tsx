import { useState } from "react";
import type { Fuel, Streak } from "@brain/shared";
import { treasuryBalanceCents } from "../data/townLedger.js";
import { armedZoneMode, armedZoneType, disarmZoning } from "../data/zoning.js";

export interface TownHudProps {
  spaceId: string;
  fuel: Fuel | null;
  streak: Streak | null;
  /** Called after the "Stop" button disarms zoning, so the world stops rendering the pending
   *  anchor marker too — TownHud itself only owns the Hangar's own persisted arm state, not the
   *  scene's transient anchor sprite (zoning-rework.md decision #3). */
  onZoningStopped?: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const chipStyle = {
  background: "#00000099",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 12,
  fontFamily: "monospace",
  whiteSpace: "nowrap" as const,
};

const ZONE_LABEL: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  sidewalk: "Sidewalk",
  transit: "Transit stop",
};

/**
 * A persistent ambient town HUD (docs/overworld/town-hud.md, task #73) — a real gap the
 * 2026-09-11 parity audit flagged: Streak/Fuel only ever showed inside the Gym, Treasury only
 * ever inside Market/Hangar/Mayor's Hall. Three real numbers only (same icon convention
 * GymOverlay.tsx already established for the first two) — never a score, never an invented
 * "town health %". Purely presentational; never fetches or mutates anything itself.
 *
 * Zoning rework (docs/overworld/zoning-rework.md, task #77) — since arming a zone type no
 * longer auto-clears after one tile, a zoning session left armed needs to be visibly obvious
 * and stoppable from anywhere, not just re-discoverable back at the Hangar. Reads the real
 * armed state directly on every render (same convention as the Treasury number above) so it
 * reflects whatever was just armed in the Hangar without any extra event wiring.
 */
export function TownHud({ spaceId, fuel, streak, onZoningStopped }: TownHudProps) {
  const [, bump] = useState(0);
  const armedZone = armedZoneType(spaceId);
  const armedMode = armedZoneType(spaceId) ? armedZoneMode(spaceId) : null;
  return (
    <div
      style={{ position: "absolute", top: 8, left: 8, zIndex: 1, display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "70vw" }}
      aria-label="Town status"
    >
      <span style={chipStyle}>🔥 {streak?.current ?? 0}</span>
      <span style={chipStyle}>
        ⚡ {fuel?.fuel ?? 0}/{fuel?.capacity ?? 0}
      </span>
      <span style={chipStyle}>🏦 {formatCents(treasuryBalanceCents(spaceId))}</span>
      {armedZone && (
        <span style={{ ...chipStyle, display: "flex", alignItems: "center", gap: 6 }}>
          🧭 Zoning: {ZONE_LABEL[armedZone] ?? armedZone} ({armedMode === "area" ? "Area" : "Tile"})
          <button
            type="button"
            onClick={() => {
              disarmZoning(spaceId);
              bump((n) => n + 1);
              onZoningStopped?.();
            }}
            style={{ ...chipStyle, padding: "2px 6px", cursor: "pointer" }}
          >
            Stop
          </button>
        </span>
      )}
    </div>
  );
}
