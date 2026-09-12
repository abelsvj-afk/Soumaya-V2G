import type { Fuel, Streak } from "@brain/shared";
import { treasuryBalanceCents } from "../data/townLedger.js";

export interface TownHudProps {
  spaceId: string;
  fuel: Fuel | null;
  streak: Streak | null;
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

/**
 * A persistent ambient town HUD (docs/overworld/town-hud.md, task #73) — a real gap the
 * 2026-09-11 parity audit flagged: Streak/Fuel only ever showed inside the Gym, Treasury only
 * ever inside Market/Hangar/Mayor's Hall. Three real numbers only (same icon convention
 * GymOverlay.tsx already established for the first two) — never a score, never an invented
 * "town health %". Purely presentational; never fetches or mutates anything itself.
 */
export function TownHud({ spaceId, fuel, streak }: TownHudProps) {
  return (
    <div
      style={{ position: "absolute", top: 8, left: 8, zIndex: 1, display: "flex", gap: 4 }}
      aria-label="Town status"
    >
      <span style={chipStyle}>🔥 {streak?.current ?? 0}</span>
      <span style={chipStyle}>
        ⚡ {fuel?.fuel ?? 0}/{fuel?.capacity ?? 0}
      </span>
      <span style={chipStyle}>🏦 {formatCents(treasuryBalanceCents(spaceId))}</span>
    </div>
  );
}
